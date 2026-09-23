import type { ManagedDevice, ManagedDeviceStatus } from '../domain/managed-device.js';
import type { Repository } from './repository.js';

export interface ManagedDeviceRepository extends Repository {
  create(input: { id: string; adminId: string; name: string; platform: string }): Promise<ManagedDevice>;
  findById(id: string): Promise<ManagedDevice | null>;
  listByAdminId(adminId: string): Promise<ManagedDevice[]>;
  updateStatus(id: string, status: ManagedDeviceStatus): Promise<ManagedDevice | null>;
}
