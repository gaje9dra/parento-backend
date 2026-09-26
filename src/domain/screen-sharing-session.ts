export type ScreenSharingSessionStatus =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'STARTING'
  | 'ACTIVE'
  | 'STOPPING'
  | 'STOPPED'
  | 'EXPIRED'
  | 'FAILED'
  | 'REJECTED';

export type ScreenSharingTerminationReason =
  | 'ADMIN_STOP'
  | 'EXPIRED'
  | 'DEVICE_DISCONNECTED'
  | 'DEVICE_REVOKED'
  | 'ADMIN_DISABLED'
  | 'FAILED'
  | 'REJECTED'
  | 'UNKNOWN';

export interface ScreenSharingSession {
  readonly id: string;
  readonly managedDeviceId: string;
  readonly adminId: string;
  readonly status: ScreenSharingSessionStatus;
  readonly createdAt: Date;
  readonly authorizedAt: Date | null;
  readonly startedAt: Date | null;
  readonly stoppedAt: Date | null;
  readonly expiresAt: Date;
  readonly lastActivityAt: Date;
  readonly terminationReason: ScreenSharingTerminationReason | null;
  readonly correlationId: string;
  readonly transportState: Record<string, unknown> | null;
}

const transitions: Record<
  ScreenSharingSessionStatus,
  readonly ScreenSharingSessionStatus[]
> = {
  REQUESTED: ['AUTHORIZED', 'REJECTED', 'FAILED', 'EXPIRED'],
  AUTHORIZED: ['STARTING', 'STOPPING', 'EXPIRED', 'FAILED'],
  STARTING: ['ACTIVE', 'STOPPING', 'FAILED', 'EXPIRED'],
  ACTIVE: ['STOPPING', 'EXPIRED', 'FAILED'],
  STOPPING: ['STOPPED', 'FAILED', 'EXPIRED'],
  STOPPED: [],
  EXPIRED: [],
  FAILED: [],
  REJECTED: [],
};

export const isTerminalScreenSharingStatus = (
  status: ScreenSharingSessionStatus,
): boolean => ['STOPPED', 'EXPIRED', 'FAILED', 'REJECTED'].includes(status);

export const isValidScreenSharingTransition = (
  from: ScreenSharingSessionStatus,
  to: ScreenSharingSessionStatus,
): boolean => from === to || transitions[from].includes(to);
