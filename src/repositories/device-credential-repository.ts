import type { DeviceCredential } from '../domain/device-credential.js';
import type { Repository } from './repository.js';

export interface DeviceCredentialRepository extends Repository {
  create(input: {
    id: string;
    managedDeviceId: string;
    credentialHash: string;
  }): Promise<DeviceCredential>;
  authenticate(credentialHash: string): Promise<DeviceCredential | null>;
  revokeForDevice(managedDeviceId: string, now: Date): Promise<void>;
}
