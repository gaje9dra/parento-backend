import { randomUUID } from 'node:crypto';
import type { Command, CommandStatus } from '../domain/command.js';
import type { CommandRepository } from '../repositories/command-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import { AppError } from '../types/errors.js';

const MAX_PAYLOAD_BYTES=4096;
const KEY=/^[A-Za-z0-9._:-]{8,128}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CommandDeliveryPort {
  deliver(command:Command):Promise<{delivered:boolean;sessionId?:string}>;
}
export const notConfiguredCommandDelivery:CommandDeliveryPort={deliver:async()=>({delivered:false})};

export class CommandService {
  constructor(
    private readonly repository:CommandRepository,
    private readonly devices:ManagedDeviceRepository,
    private readonly defaultTtlSeconds:number,
    private readonly maxTtlSeconds:number,
    private readonly delivery:CommandDeliveryPort=notConfiguredCommandDelivery,
  ) {}

  async create(input:{adminId:string;managedDeviceId:string;type:string;version:number;payload:Record<string,unknown>;idempotencyKey?:string|null;expiresAt?:Date}):Promise<{command:Command;created:boolean}> {
    if(!UUID.test(input.managedDeviceId)) throw new AppError(400,'INVALID_REQUEST','Managed-device identifier is invalid.');
    const device=await this.devices.findById(input.managedDeviceId);
    if(device===null) throw new AppError(404,'RESOURCE_NOT_FOUND','Managed device was not found.');
    if(device.adminId!==input.adminId) throw new AppError(403,'AUTHORIZATION_DENIED','Access to the managed device is denied.');
    if(device.enrollmentStatus!=='ACTIVE'||device.operationalStatus!=='ACTIVE') throw new AppError(409,'CONFLICT','Managed device is not available for commands.');
    if(input.type!=='FUTURE_COMMAND'||input.version!==1) throw new AppError(400,'INVALID_REQUEST','Command type or version is not supported in this phase.');
    const bytes=Buffer.byteLength(JSON.stringify(input.payload),'utf8');
    if(bytes>MAX_PAYLOAD_BYTES) throw new AppError(413,'REQUEST_TOO_LARGE','Command payload is too large.');
    if(input.idempotencyKey!==undefined&&input.idempotencyKey!==null&&!KEY.test(input.idempotencyKey)) throw new AppError(400,'INVALID_REQUEST','Idempotency key has an invalid format.');
    const now=new Date();
    const expiresAt=input.expiresAt??new Date(now.getTime()+this.defaultTtlSeconds*1000);
    if(expiresAt<=now||expiresAt.getTime()>now.getTime()+this.maxTtlSeconds*1000) throw new AppError(400,'INVALID_REQUEST','Command expiration is invalid.');
    try {
      const result=await this.repository.create({
        id:randomUUID(),managedDeviceId:input.managedDeviceId,adminId:input.adminId,type:'FUTURE_COMMAND',
        version:1,payload:input.payload,correlationId:randomUUID(),idempotencyKey:input.idempotencyKey??null,expiresAt,
      });
      if(!result.created) return result;
      const queued=await this.repository.transition({id:result.command.id,from:'CREATED',to:'QUEUED',actorType:'SYSTEM',actorId:null,now,correlationId:result.command.correlationId});
      const delivery=await this.delivery.deliver(queued);
      if(delivery.delivered) {
        const delivering=await this.repository.transition({id:queued.id,from:'QUEUED',to:'DELIVERING',actorType:'SYSTEM',actorId:null,now:new Date(),correlationId:queued.correlationId});
        return {command:delivering,created:true};
      }
      return {command:queued,created:true};
    } catch(error) {
      throw error;
    }
  }

  async getOwned(id:string,adminId:string):Promise<Command>{
    if(!UUID.test(id)) throw new AppError(400,'INVALID_REQUEST','Command identifier is invalid.');
    const command=await this.repository.findOwned(id,adminId);
    if(command===null) throw new AppError(404,'RESOURCE_NOT_FOUND','Command was not found.');
    return command;
  }

  async cancel(id:string,adminId:string):Promise<Command>{
    const command=await this.getOwned(id,adminId);
    if(!['CREATED','QUEUED'].includes(command.status)) throw new AppError(409,'CONFLICT','Command cannot be cancelled in its current state.');
    return this.repository.cancelOwned(id,adminId,new Date());
  }

  async transitionFromDevice(input:{id:string;from:CommandStatus;to:CommandStatus;sessionId:string;failureCode?:string;errorCategory?:string;resultCode?:string;resultMetadata?:Record<string,unknown>}):Promise<Command>{
    const command=await this.repository.findById(input.id);
    if(command===null) throw new AppError(404,'RESOURCE_NOT_FOUND','Command was not found.');
    if(command.status==='SUCCEEDED'||command.status==='FAILED'||command.status==='EXPIRED'||command.status==='CANCELLED'||command.status==='REJECTED') throw new AppError(409,'CONFLICT','Terminal commands cannot transition.');
    return this.repository.transition({id:input.id,from:input.from,to:input.to,actorType:'DEVICE',actorId:input.sessionId,now:new Date(),correlationId:command.correlationId,failureCode:input.failureCode??null,errorCategory:input.errorCategory??null,resultCode:input.resultCode??null,resultMetadata:input.resultMetadata??null});
  }
}
