import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Command, CommandActorType, CommandStatus } from '../domain/command.js';
import { isTerminalCommandStatus, isValidCommandTransition } from '../domain/command.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import { mapPostgresPersistenceError } from '../db/errors.js';
import type { CommandRepository } from './command-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface Row {
  id: string; managed_device_id: string; admin_id: string; type: 'FUTURE_COMMAND'; version: number;
  status: CommandStatus; payload: Record<string, unknown>; correlation_id: string | null;
  idempotency_key: string | null; created_at: Date; expires_at: Date; delivery_at: Date | null;
  acknowledged_at: Date | null; started_at: Date | null; completed_at: Date | null; cancelled_at: Date | null;
  failure_code: string | null; error_category: string | null; result_code: string | null;
  result_metadata: Record<string, unknown> | null;
}
const columns='id,managed_device_id,admin_id,type,version,status,payload,correlation_id,idempotency_key,created_at,expires_at,delivery_at,acknowledged_at,started_at,completed_at,cancelled_at,failure_code,error_category,result_code,result_metadata';
const map=(r:Row):Command=>({
 id:r.id,managedDeviceId:r.managed_device_id,adminId:r.admin_id,type:r.type,version:r.version,status:r.status,
 payload:r.payload,correlationId:r.correlation_id,idempotencyKey:r.idempotency_key,createdAt:r.created_at,expiresAt:r.expires_at,
 deliveryAt:r.delivery_at,acknowledgedAt:r.acknowledged_at,startedAt:r.started_at,completedAt:r.completed_at,cancelledAt:r.cancelled_at,
 failureCode:r.failure_code,errorCategory:r.error_category,resultCode:r.result_code,resultMetadata:r.result_metadata,
});

export class PostgresCommandRepository extends PostgresRepository implements CommandRepository {
 readonly name='command';

 async create(input: {id:string;managedDeviceId:string;adminId:string;type:'FUTURE_COMMAND';version:number;payload:Record<string,unknown>;correlationId:string|null;idempotencyKey:string|null;expiresAt:Date}):Promise<{command:Command;created:boolean}>{
  try {
   const created = await this.transaction(async client => {
    if (input.idempotencyKey !== null) {
     const existing = await client.query<Row>(
      'SELECT '+columns+' FROM commands WHERE admin_id=$1 AND managed_device_id=$2 AND idempotency_key=$3 FOR UPDATE',
      [input.adminId,input.managedDeviceId,input.idempotencyKey],
     );
     if (existing.rows[0]) return {command:map(existing.rows[0]),created:false};
    }
    const result = await client.query<Row>(
     'INSERT INTO commands (id,managed_device_id,admin_id,type,version,payload,correlation_id,idempotency_key,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING '+columns,
     [input.id,input.managedDeviceId,input.adminId,input.type,input.version,JSON.stringify(input.payload),input.correlationId,input.idempotencyKey,input.expiresAt],
    );
    const command=map(result.rows[0]!);
    await client.query(
     'INSERT INTO command_events (id,command_id,from_status,to_status,actor_type,actor_id,correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
     [randomUUID(),command.id,null,'CREATED','ADMIN',input.adminId,input.correlationId],
    );
    return {command,created:true};
   });
   return created;
  } catch (error) {
   if (input.idempotencyKey !== null) {
    const existing = await this.findByIdempotency(input.adminId,input.managedDeviceId,input.idempotencyKey);
    if (existing !== null) return {command:existing,created:false};
   }
   throw mapPostgresPersistenceError(error,'Unable to create command.');
  }
 }
 private async findByIdempotency(adminId:string,managedDeviceId:string,idempotencyKey:string):Promise<Command|null>{
  const result=await this.query<Row>('SELECT '+columns+' FROM commands WHERE admin_id=$1 AND managed_device_id=$2 AND idempotency_key=$3',[adminId,managedDeviceId,idempotencyKey]);
  return result.rows[0]===undefined?null:map(result.rows[0]);
 }
 async findById(id:string):Promise<Command|null>{const r=await this.query<Row>('SELECT '+columns+' FROM commands WHERE id=$1',[id]);return r.rows[0]?map(r.rows[0]):null;}
 async findOwned(id:string,adminId:string):Promise<Command|null>{const r=await this.query<Row>('SELECT '+columns+' FROM commands WHERE id=$1 AND admin_id=$2',[id,adminId]);return r.rows[0]?map(r.rows[0]):null;}
 async cancelOwned(id:string,adminId:string,now:Date):Promise<Command>{
  const current=await this.findOwned(id,adminId); if(!current) throw new PersistenceError('NOT_FOUND','Command not found.');
  return this.transition({id,from:current.status,to:'CANCELLED',actorType:'ADMIN',actorId:adminId,now,correlationId:current.correlationId});
 }
 async transition(input:{id:string;from:CommandStatus;to:CommandStatus;actorType:CommandActorType;actorId:string|null;now:Date;correlationId:string|null;failureCode?:string|null;errorCategory?:string|null;resultCode?:string|null;resultMetadata?:Record<string,unknown>|null}):Promise<Command>{
  if(!isValidCommandTransition(input.from,input.to)) throw new PersistenceError('INVALID_STATE','The command state transition is invalid.');
  return this.transaction(async client=>{
   const currentResult=await client.query<Row>('SELECT '+columns+' FROM commands WHERE id=$1 FOR UPDATE',[input.id]);
   const current=currentResult.rows[0]; if(!current) throw new PersistenceError('NOT_FOUND','Command not found.');
   if(current.status!==input.from) throw new PersistenceError('INVALID_STATE','The command state has changed.');
   if(isTerminalCommandStatus(current.status)) throw new PersistenceError('INVALID_STATE','Terminal commands cannot transition.');
   if(input.now.getTime()>=current.expires_at.getTime() && !['EXPIRED','CANCELLED'].includes(input.to)){
    await client.query("UPDATE commands SET status='EXPIRED', completed_at=$2 WHERE id=$1",[input.id,input.now]);
    await this.insertEvent(client,input.id,current.status,'EXPIRED','SYSTEM',null,current.correlation_id,input.now);
    throw new PersistenceError('INVALID_STATE','Command expired.');
   }
   const set:string[]=['status=$2']; const values:unknown[]=[input.id,input.to];
   const add=(sql:string,value:unknown)=>{set.push(sql.replace('$X','$'+(values.length+1)));values.push(value);};
   if(input.to==='DELIVERING') add('delivery_at=COALESCE(delivery_at,$X)',input.now);
   if(input.to==='ACKNOWLEDGED') add('acknowledged_at=$X',input.now);
   if(input.to==='RUNNING') add('started_at=COALESCE(started_at,$X)',input.now);
   if(['SUCCEEDED','FAILED','EXPIRED','CANCELLED','REJECTED'].includes(input.to)) add('completed_at=$X',input.now);
   if(input.to==='CANCELLED') add('cancelled_at=$X',input.now);
   if(input.failureCode!==undefined) add('failure_code=$X',input.failureCode);
   if(input.errorCategory!==undefined) add('error_category=$X',input.errorCategory);
   if(input.resultCode!==undefined) add('result_code=$X',input.resultCode);
   if(input.resultMetadata!==undefined) add('result_metadata=$X',input.resultMetadata===null?null:JSON.stringify(input.resultMetadata));
   const result=await client.query<Row>('UPDATE commands SET '+set.join(', ')+' WHERE id=$1 RETURNING '+columns,values);
   const command=map(result.rows[0]!);
   await this.insertEvent(client,input.id,current.status,input.to,input.actorType,input.actorId,input.correlationId??current.correlation_id,input.now);
   return command;
  });
 }
 private async insertEvent(client: PoolClient, commandId:string, fromStatus:CommandStatus|null, toStatus:CommandStatus, actorType:CommandActorType, actorId:string|null, correlationId:string|null, occurredAt:Date):Promise<void>{
  await client.query(
   'INSERT INTO command_events (id,command_id,from_status,to_status,actor_type,actor_id,correlation_id,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
   [randomUUID(),commandId,fromStatus,toStatus,actorType,actorId,correlationId,occurredAt],
  );
 }
}
