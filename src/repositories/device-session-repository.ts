import type { DeviceSession } from '../domain/device-session.js';
import type { Repository } from './repository.js';

export interface DeviceCredentialRecord {
  readonly id: string;
  readonly managedDeviceId: string;
  readonly credentialHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface DeviceSessionRepository extends Repository {
  createCredential(input: {
    id: string;
    managedDeviceId: string;
    credentialHash: string;
    expiresAt: Date | null;
  }): Promise<DeviceCredentialRecord>;
  findCredentialByHash(hash: string): Promise<DeviceCredentialRecord | null>;
  createSession(input: {
    id: string;
    managedDeviceId: string;
    credentialId: string;
    state: 'CONNECTED';
    createdAt: Date;
    lastActivityAt: Date;
    connectedAt: Date;
    expiresAt: Date;
  }): Promise<DeviceSession>;
  findById(id: string): Promise<DeviceSession | null>;
  disconnect(id: string, now: Date, state: 'DISCONNECTED' | 'STALE'): Promise<DeviceSession | null>;
}
