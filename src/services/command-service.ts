import { randomUUID } from 'node:crypto';
import type { Command, CommandStatus } from '../domain/command.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { CommandRepository } from '../repositories/command-repository.js';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import { AppError } from '../types/errors.js';

export interface CommandServiceOptions { readonly ttlSeconds: number; readonly maxPayloadBytes: number; }

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CommandService {
 constructor(private readonly commands:CommandRepository,private readonly devices:ManagedDeviceRepository,private readonly sessions:DeviceConnectionSessionRepository,private readonly options:CommandServiceOptions){}
 async create(adminId:string,input:{deviceId:string;type:string;version:number;payload:unknown;idempotencyKey:string|null;correlationId:string|null}):Promise<{command:Command;created:boolean}>{
  if(!UUID.test(input.deviceId)) throw new AppError(400,'INVALID_REQUEST','Managed-device identifier is invalid.');
  if(input.type!=='FUTURE_COMMAND'||input.version!==1) throw new AppError(400,'UNSUPPORTED_COMMAND_TYPE','The requested command type is not enabled in this phase.');
  if(input.payload===null||typeof input.payload!=='object'||Array.isArray(input.payload)) throw new AppError(400,'INVALID_COMMAND_PAYLOAD','Command payload must be a JSON object.');
  const payload=input.payload as Record<string,unknown>;
  if(Object.keys(payload).length!==0) throw new AppError(400,'INVALID_COMMAND_PAYLOAD','FUTURE_COMMAND does not accept executable or device-control payload data.');
  const bytes=Buffer.byteLength(JSON.stringify(payload),'utf8');
  if(bytes>this.options.maxPayloadBytes) throw new AppError(413,'COMMAND_PAYLOAD_TOO_LARGE','Command payload is too large.');
  const device=await this.devices.findById(input.deviceId);
  if(device===null) throw new AppError(404,'DEVICE_NOT_FOUND','Managed device was not found.');
  if(device.adminId!==adminId) throw new AppError(403,'AUTHORIZATION_DENIED','The administrator does not control this device.');
  if(device.enrollmentStatus!=='ACTIVE'||device.operationalStatus!=='ACTIVE') throw new AppError(409,'DEVICE_NOT_READY','Managed device is not available for commands.');
  if(input.idempotencyKey!==null && !/^[A-Za-z0-9._:-]{1,128}$/.test(input.idempotencyKey)) throw new AppError(400,'INVALID_REQUEST','Idempotency key is invalid.');
  const now=new Date();
  try{return await this.commands.create({id:randomUUID(),managedDeviceId:device.id,adminId,type:'FUTURE_COMMAND',version:1,payload,correlationId:input.correlationId,idempotencyKey:input.idempotencyKey,expiresAt:new Date(now.getTime()+this.options.ttlSeconds*1000)});}
  catch(error){if(error instanceof PersistenceError && error.code==='CONFLICT') throw new AppError(409,'COMMAND_IDEMPOTENCY_CONFLICT','A command already exists for this idempotency key.');throw error;}
 }
 async getOwned(id:string,adminId:string):Promise<Command>{
  const command=await this.commands.findOwned(id,adminId);
  if(command===null) throw new AppError(404,'COMMAND_NOT_FOUND','Command was not found.');
  return this.expireIfNeeded(command);
 }
 async getOwnedForDevice(id:string,adminId:string,deviceId:string):Promise<Command>{ const command=await this.getOwned(id,adminId); if(command.managedDeviceId!==deviceId) throw new AppError(403,'AUTHORIZATION_DENIED','The command is not assigned to this device.'); return command; }
 async cancel(id:string,adminId:string,deviceId?:string):Promise<Command>{
  const command=await this.getOwned(id,adminId);
  if(deviceId!==undefined && command.managedDeviceId!==deviceId) throw new AppError(403,'AUTHORIZATION_DENIED','The command is not assigned to this device.');
  if(['SUCCEEDED','FAILED','EXPIRED','CANCELLED','REJECTED'].includes(command.status)) throw new AppError(409,'COMMAND_STATE_CONFLICT','The command cannot be cancelled in its current state.');
  try{return await this.commands.cancelOwned(id,adminId,new Date());}catch(error){if(error instanceof PersistenceError) throw new AppError(409,'COMMAND_STATE_CONFLICT',error.message);throw error;}
 }
 async acknowledge(id:string,session: {id:string;managedDeviceId:string}):Promise<Command>{return this.deviceTransition(id,session,'DELIVERED','ACKNOWLEDGED');}
 async start(id:string,session: {id:string;managedDeviceId:string}):Promise<Command>{return this.deviceTransition(id,session,'ACKNOWLEDGED','RUNNING');}
 async result(id:string,session:{id:string;managedDeviceId:string},status:'SUCCEEDED'|'FAILED',resultCode:string|null,errorCategory:string|null,resultMetadata:Record<string,unknown>|null):Promise<Command>{
  const command=await this.commands.findById(id); this.assertDevice(command,session.managedDeviceId);
  if(command!.status!=='RUNNING') throw new AppError(409,'COMMAND_STATE_CONFLICT','Command is not running.');
  try{return await this.commands.transition({id,from:'RUNNING',to:status,actorType:'DEVICE',actorId:session.managedDeviceId,now:new Date(),correlationId:command!.correlationId,resultCode,errorCategory,resultMetadata});}catch(error){if(error instanceof PersistenceError) throw new AppError(409,'COMMAND_STATE_CONFLICT',error.message);throw error;}
 }
 private async deviceTransition(id:string,session:{id:string;managedDeviceId:string},from:CommandStatus,to:CommandStatus):Promise<Command>{
  const command=await this.commands.findById(id); this.assertDevice(command,session.managedDeviceId);
  if(command!.status!==from) throw new AppError(409,'COMMAND_STATE_CONFLICT','Command is not in the required state.');
  try{return await this.commands.transition({id,from,to,actorType:'DEVICE',actorId:session.managedDeviceId,now:new Date(),correlationId:command!.correlationId});}catch(error){if(error instanceof PersistenceError) throw new AppError(409,'COMMAND_STATE_CONFLICT',error.message);throw error;}
 }
 private assertDevice(command:Command|null,deviceId:string):asserts command is Command{if(command===null) throw new AppError(404,'COMMAND_NOT_FOUND','Command was not found.');if(command.managedDeviceId!==deviceId) throw new AppError(403,'AUTHORIZATION_DENIED','The command is not assigned to this device.');}
 private async expireIfNeeded(command:Command):Promise<Command>{if(command.expiresAt.getTime()>Date.now()||['SUCCEEDED','FAILED','EXPIRED','CANCELLED','REJECTED'].includes(command.status)) return command;try{return await this.commands.transition({id:command.id,from:command.status,to:'EXPIRED',actorType:'SYSTEM',actorId:null,now:new Date(),correlationId:command.correlationId});}catch{return command;}}
}
