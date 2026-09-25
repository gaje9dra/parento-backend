export type DeviceConnectionState =
  'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'STALE' | 'EXPIRED';

export interface DeviceConnectionSession {
  readonly id: string;
  readonly managedDeviceId: string;
  readonly state: DeviceConnectionState;
  readonly createdAt: Date;
  readonly connectedAt: Date | null;
  readonly lastActivityAt: Date;
  readonly lastSeenAt: Date;
  readonly disconnectedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
}

export const isValidDeviceConnectionTransition = (
  from: DeviceConnectionState,
  to: DeviceConnectionState,
): boolean => {
  if (from === to) return true;
  if (from === 'CONNECTING')
    return to === 'CONNECTED' || to === 'DISCONNECTED' || to === 'EXPIRED';
  if (from === 'CONNECTED')
    return to === 'DISCONNECTED' || to === 'STALE' || to === 'EXPIRED';
  if (from === 'STALE')
    return to === 'CONNECTED' || to === 'DISCONNECTED' || to === 'EXPIRED';
  return false;
};
