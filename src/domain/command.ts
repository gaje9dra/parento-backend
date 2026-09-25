export type CommandType = 'FUTURE_COMMAND';

export type CommandStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REJECTED';

export interface DeviceCommand {
  readonly id: string;
  readonly managedDeviceId: string;
  readonly adminId: string;
  readonly type: CommandType;
  readonly schemaVersion: number;
  readonly payload: Record<string, unknown>;
  readonly status: CommandStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly deliveredAt: Date | null;
  readonly acknowledgedAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly failureCode: string | null;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly sessionId: string | null;
}

const transitions: Record<CommandStatus, readonly CommandStatus[]> = {
  CREATED: ['QUEUED', 'CANCELLED', 'REJECTED', 'EXPIRED'],
  QUEUED: ['DELIVERING', 'CANCELLED', 'EXPIRED', 'REJECTED'],
  DELIVERING: ['DELIVERED', 'FAILED', 'EXPIRED', 'CANCELLED'],
  DELIVERED: ['ACKNOWLEDGED', 'FAILED', 'EXPIRED'],
  ACKNOWLEDGED: ['RUNNING', 'FAILED', 'EXPIRED'],
  RUNNING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const isValidCommandTransition = (
  from: CommandStatus,
  to: CommandStatus,
): boolean => from === to || transitions[from].includes(to);

export const isTerminalCommandStatus = (status: CommandStatus): boolean =>
  transitions[status].length === 0;
