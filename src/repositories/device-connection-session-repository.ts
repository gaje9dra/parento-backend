import type {
  DeviceConnectionSession,
  DeviceConnectionState,
} from '../domain/device-connection-session.js';
import type { Repository } from './repository.js';

export interface DeviceConnectionSessionRepository extends Repository {
  create(input: {
    id: string;
    managedDeviceId: string;
    sessionTokenHash: string;
    expiresAt: Date;
  }): Promise<DeviceConnectionSession>;
  findById?(id: string): Promise<DeviceConnectionSession | null>;
  findByTokenHash(tokenHash: string): Promise<DeviceConnectionSession | null>;
  findActiveByDeviceId?(managedDeviceId: string): Promise<DeviceConnectionSession | null>;
  touchConnected(
    id: string,
    now: Date,
    expiresAt: Date,
  ): Promise<DeviceConnectionSession | null>;
  disconnect(
    id: string,
    now: Date,
    state?: DeviceConnectionState,
  ): Promise<DeviceConnectionSession | null>;
  revokeForDevice(managedDeviceId: string, now: Date): Promise<void>;
}
