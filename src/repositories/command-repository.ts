import type { DeviceCommand, CommandStatus, CommandType } from '../domain/command.js';
import type { Repository } from './repository.js';

export interface CommandPageRequest {
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface CommandPage {
  readonly items: DeviceCommand[];
  readonly nextCursor: string | null;
}

export interface CommandRepository extends Repository {
  create(input: {
    id: string;
    managedDeviceId: string;
    adminId: string;
    type: CommandType;
    schemaVersion: number;
    payload: Record<string, unknown>;
    expiresAt: Date;
    correlationId: string;
    idempotencyKey: string;
  }): Promise<DeviceCommand>;
  findById(id: string): Promise<DeviceCommand | null>;
  findByIdempotency(adminId: string, idempotencyKey: string): Promise<DeviceCommand | null>;
  listByAdminId(adminId: string, page?: CommandPageRequest): Promise<CommandPage>;
  transition(id: string, from: CommandStatus, to: CommandStatus, now: Date, metadata?: {
    sessionId?: string | null;
    failureCode?: string | null;
  }): Promise<DeviceCommand | null>;
}
