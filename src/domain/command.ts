export type CommandActorType = 'ADMIN' | 'DEVICE' | 'SYSTEM';
export type CommandStatus =
  | 'CREATED' | 'QUEUED' | 'DELIVERING' | 'DELIVERED' | 'ACKNOWLEDGED'
  | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'REJECTED';
export type CommandType = 'FUTURE_COMMAND';

export interface Command {
  readonly id:string; readonly managedDeviceId:string; readonly adminId:string;
  readonly type:CommandType; readonly version:number; readonly status:CommandStatus;
  readonly payload:Record<string,unknown>; readonly correlationId:string|null;
  readonly idempotencyKey:string|null; readonly createdAt:Date; readonly expiresAt:Date;
  readonly deliveryAt:Date|null; readonly acknowledgedAt:Date|null; readonly startedAt:Date|null;
  readonly completedAt:Date|null; readonly cancelledAt:Date|null; readonly failureCode:string|null;
  readonly errorCategory:string|null; readonly resultCode:string|null; readonly resultMetadata:Record<string,unknown>|null;
}
const transitions:Record<CommandStatus,readonly CommandStatus[]> = {
  CREATED:['QUEUED','CANCELLED','REJECTED','EXPIRED'], QUEUED:['DELIVERING','CANCELLED','EXPIRED','REJECTED'],
  DELIVERING:['DELIVERED','FAILED','EXPIRED','CANCELLED'], DELIVERED:['ACKNOWLEDGED','FAILED','EXPIRED'],
  ACKNOWLEDGED:['RUNNING','FAILED','EXPIRED'], RUNNING:['SUCCEEDED','FAILED'],
  SUCCEEDED:[], FAILED:[], EXPIRED:[], CANCELLED:[], REJECTED:[],
};
export const isValidCommandTransition=(from:CommandStatus,to:CommandStatus):boolean =>
  from===to || transitions[from].includes(to);
export const isTerminalCommandStatus=(status:CommandStatus):boolean =>
  transitions[status].length===0;
