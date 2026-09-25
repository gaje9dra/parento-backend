import { describe, expect, it } from 'vitest';
import { isTerminalCommandStatus, isValidCommandTransition } from '../src/domain/command.js';
import { CommandService } from '../src/services/command-service.js';
import type { Command } from '../src/domain/command.js';
import type { CommandRepository } from '../src/repositories/command-repository.js';
import type { ManagedDeviceRepository, DevicePage } from '../src/repositories/managed-device-repository.js';
import type { ManagedDevice } from '../src/domain/managed-device.js';

const adminId='550e8400-e29b-41d4-a716-446655440000';
const deviceId='550e8400-e29b-41d4-a716-446655440001';

class FakeCommands implements CommandRepository {
 readonly name='fake-command';
 private readonly items=new Map<string,Command>();
 async create(input:Parameters<CommandRepository['create']>[0]){
  const now=new Date();
  const command:Command={...input,status:'CREATED',createdAt:now,deliveryAt:null,acknowledgedAt:null,startedAt:null,completedAt:null,cancelledAt:null,failureCode:null,errorCategory:null,resultCode:null,resultMetadata:null};
  const existing=input.idempotencyKey===null?undefined:[...this.items.values()].find(c=>c.adminId===input.adminId&&c.managedDeviceId===input.managedDeviceId&&c.idempotencyKey===input.idempotencyKey);
  if(existing) return {command:existing,created:false};
  this.items.set(command.id,command); return {command,created:true};
 }
 async findById(id:string){return this.items.get(id)??null;}
 async findOwned(id:string,admin:string){const c=this.items.get(id);return c?.adminId===admin?c??null:null;}
 async cancelOwned(id:string,admin:string,now:Date){const c=await this.findOwned(id,admin);if(!c) throw new Error('missing');return this.transition({id,from:c.status,to:'CANCELLED',actorType:'ADMIN',actorId:admin,now,correlationId:c.correlationId});}
 async transition(input:Parameters<CommandRepository['transition']>[0]){
  const c=this.items.get(input.id);if(!c||c.status!==input.from) throw new Error('stale');
  const next={...c,status:input.to,...(['SUCCEEDED','FAILED','EXPIRED','CANCELLED','REJECTED'].includes(input.to)?{completedAt:input.now}:{}),...(input.to==='CANCELLED'?{cancelledAt:input.now}:{}),...(input.failureCode!==undefined?{failureCode:input.failureCode}:{}),...(input.errorCategory!==undefined?{errorCategory:input.errorCategory}:{}),...(input.resultCode!==undefined?{resultCode:input.resultCode}:{}),...(input.resultMetadata!==undefined?{resultMetadata:input.resultMetadata}:{}),...(input.to==='DELIVERED'?{deliveryAt:input.now}:{}),...(input.to==='ACKNOWLEDGED'?{acknowledgedAt:input.now}:{}),...(input.to==='RUNNING'?{startedAt:input.now}:{})} as Command;
  this.items.set(input.id,next);return next;
 }
}

class FakeDevices implements ManagedDeviceRepository {
 readonly name='fake-device'; constructor(private readonly device:ManagedDevice){}
 async create(){return this.device;} async findById(id:string){return id===this.device.id?this.device:null;}
 async findByStableIdentifier(){return null;} async list():Promise<DevicePage>{return {items:[this.device],nextCursor:null};}
 async listByAdminId():Promise<DevicePage>{return {items:[this.device],nextCursor:null};} async updateStatus(){return this.device;}
}

const device=(owner=adminId):ManagedDevice=>({id:deviceId,adminId:owner,stableIdentifier:'installation-test',name:'Test',platform:'android',enrollmentStatus:'ACTIVE',operationalStatus:'ACTIVE',createdAt:new Date(),updatedAt:new Date(),lastSeenAt:null});

describe('Phase 6.1 command foundation',()=>{
 it('defines terminal states and rejects terminal replay',()=>{
  expect(isValidCommandTransition('CREATED','QUEUED')).toBe(true);
  expect(isValidCommandTransition('SUCCEEDED','RUNNING')).toBe(false);
  expect(isTerminalCommandStatus('SUCCEEDED')).toBe(true);
 });
 it('enforces device ownership',async()=>{
  const service=new CommandService(new FakeCommands(),new FakeDevices(device('550e8400-e29b-41d4-a716-446655440002')),300,3600);
  await expect(service.create({adminId,managedDeviceId:deviceId,type:'FUTURE_COMMAND',version:1,payload:{},idempotencyKey:'ownership-test'})).rejects.toMatchObject({code:'AUTHORIZATION_DENIED'});
 });
 it('deduplicates idempotent retries',async()=>{
  const service=new CommandService(new FakeCommands(),new FakeDevices(device()),300,3600);
  const input={adminId,managedDeviceId:deviceId,type:'FUTURE_COMMAND',version:1,payload:{},idempotencyKey:'retry-key'};
  const first=await service.create(input);const second=await service.create(input);
  expect(first.command.id).toBe(second.command.id);expect(second.created).toBe(false);
 });
});
