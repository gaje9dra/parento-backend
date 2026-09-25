export type DeviceCredentialStatus = 'ACTIVE' | 'REVOKED';

export interface DeviceCredential {
  readonly id: string;
  readonly managedDeviceId: string;
  readonly status: DeviceCredentialStatus;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
}
