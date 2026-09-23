export type ManagedDeviceStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface ManagedDevice {
  readonly id: string;
  readonly adminId: string;
  readonly stableIdentifier: string;
  readonly name: string;
  readonly platform: string;
  readonly enrollmentStatus: ManagedDeviceStatus;
  readonly operationalStatus: ManagedDeviceStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastSeenAt: Date | null;
}

export const isValidManagedDeviceTransition = (
  from: ManagedDeviceStatus,
  to: ManagedDeviceStatus,
): boolean => {
  if (from === to) return true;
  if (from === 'PENDING') return to === 'ACTIVE' || to === 'REVOKED';
  if (from === 'ACTIVE') return to === 'REVOKED';
  return false;
};
