import type {
  ManagedDevice,
  ManagedDeviceStatus,
} from '../domain/managed-device.js';
import type { Repository } from './repository.js';

export interface DevicePageRequest {
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface DevicePage {
  readonly items: ManagedDevice[];
  readonly nextCursor: string | null;
}

export interface ManagedDeviceRepository extends Repository {
  create(input: {
    id: string;
    adminId: string;
    stableIdentifier: string;
    name: string;
    platform: string;
  }): Promise<ManagedDevice>;
  findById(id: string): Promise<ManagedDevice | null>;
  findByStableIdentifier(
    stableIdentifier: string,
  ): Promise<ManagedDevice | null>;
  list(page?: DevicePageRequest): Promise<DevicePage>;
  listByAdminId(adminId: string, page?: DevicePageRequest): Promise<DevicePage>;
  touchLastSeen(id: string, now: Date): Promise<void>;
  updateStatus(
    id: string,
    status: ManagedDeviceStatus,
  ): Promise<ManagedDevice | null>;
}
