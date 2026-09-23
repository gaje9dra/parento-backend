export type ManagedDeviceStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface ManagedDevice {
  readonly id: string;
  readonly adminId: string;
  readonly name: string;
  readonly platform: string;
  readonly enrollmentStatus: ManagedDeviceStatus;
  readonly operationalStatus: ManagedDeviceStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastSeenAt: Date | null;
}
