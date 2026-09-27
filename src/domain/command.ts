export const COMMAND_TYPES = [
  'FUTURE_COMMAND',
  'START_SCREEN_SHARE',
  'STOP_SCREEN_SHARE',
  'START_AUDIO_ACCESS',
  'STOP_AUDIO_ACCESS',
  'SYNC_APPLICATION_POLICY',
  'REQUEST_APPLICATION_INVENTORY',
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];
export const COMMAND_TYPE = 'FUTURE_COMMAND' as const;

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

export type CommandActorType = 'ADMIN' | 'DEVICE' | 'SYSTEM';

export interface Command {
  readonly id: string;
  readonly managedDeviceId: string;
  readonly adminId: string;
  readonly type: CommandType;
  readonly version: number;
  readonly status: CommandStatus;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string | null;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly deliveryAt: Date | null;
  readonly acknowledgedAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly failureCode: string | null;
  readonly errorCategory: string | null;
  readonly resultCode: string | null;
  readonly resultMetadata: Record<string, unknown> | null;
}

export const TERMINAL_COMMAND_STATUSES: readonly CommandStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REJECTED',
];

const transitions: Record<CommandStatus, readonly CommandStatus[]> = {
  CREATED: ['QUEUED', 'CANCELLED', 'REJECTED', 'EXPIRED'],
  QUEUED: ['DELIVERING', 'CANCELLED', 'EXPIRED', 'REJECTED'],
  DELIVERING: ['DELIVERED', 'QUEUED', 'FAILED', 'EXPIRED', 'CANCELLED'],
  DELIVERED: ['ACKNOWLEDGED', 'FAILED', 'EXPIRED'],
  ACKNOWLEDGED: ['RUNNING', 'FAILED', 'EXPIRED'],
  RUNNING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const isTerminalCommandStatus = (status: CommandStatus): boolean =>
  TERMINAL_COMMAND_STATUSES.includes(status);

export const isValidCommandTransition = (
  from: CommandStatus,
  to: CommandStatus,
): boolean => from === to || transitions[from].includes(to);
