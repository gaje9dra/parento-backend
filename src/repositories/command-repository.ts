import type { Command, CommandActorType, CommandStatus, CommandType } from '../domain/command.js';
import type { Repository } from './repository.js';
export interface CommandRepository extends Repository {
  create(input:{id:string;managedDeviceId:string;adminId:string;type:CommandType;version:number;payload:Record<string,unknown>;correlationId:string|null;idempotencyKey:string|null;expiresAt:Date}):Promise<{command:Command;created:boolean}>;
  findById(id:string):Promise<Command|null>;
  findOwned(id:string,adminId:string):Promise<Command|null>;
  cancelOwned(id:string,adminId:string,now:Date):Promise<Command>;
  transition(input:{id:string;from:CommandStatus;to:CommandStatus;actorType:CommandActorType;actorId:string|null;now:Date;correlationId:string|null;failureCode?:string|null;errorCategory?:string|null;resultCode?:string|null;resultMetadata?:Record<string,unknown>|null}):Promise<Command>;
}
