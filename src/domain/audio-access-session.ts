export type AudioAccessSessionStatus =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'STARTING'
  | 'ACTIVE'
  | 'STOPPING'
  | 'STOPPED'
  | 'EXPIRED'
  | 'FAILED'
  | 'REJECTED';

export type AudioAccessTerminationReason =
  | 'ADMIN_STOP'
  | 'EXPIRED'
  | 'DEVICE_DISCONNECTED'
  | 'DEVICE_REVOKED'
  | 'ADMIN_DISABLED'
  | 'FAILED'
  | 'REJECTED'
  | 'UNKNOWN';

export interface AudioAccessSession {
  readonly id: string;
  readonly managedDeviceId: string;
  readonly adminId: string;
  readonly status: AudioAccessSessionStatus;
  readonly createdAt: Date;
  readonly authorizedAt: Date | null;
  readonly startedAt: Date | null;
  readonly stoppedAt: Date | null;
  readonly expiresAt: Date;
  readonly lastActivityAt: Date;
  readonly terminationReason: AudioAccessTerminationReason | null;
  readonly correlationId: string;
  readonly transportState: Record<string, unknown> | null;
}

const transitions: Record<
  AudioAccessSessionStatus,
  readonly AudioAccessSessionStatus[]
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

export const isTerminalAudioAccessStatus = (
  status: AudioAccessSessionStatus,
): boolean => ['STOPPED', 'EXPIRED', 'FAILED', 'REJECTED'].includes(status);

export const isValidAudioAccessTransition = (
  from: AudioAccessSessionStatus,
  to: AudioAccessSessionStatus,
): boolean => from === to || transitions[from].includes(to);
