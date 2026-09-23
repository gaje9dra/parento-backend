import { randomUUID } from 'node:crypto';
import type { ManagedDevice } from '../domain/managed-device.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';

export class ManagedDevicePersistenceService {
  constructor(private readonly repository: ManagedDeviceRepository) {}

  create(input: { adminId: string; name: string; platform: string }): Promise<ManagedDevice> {
    if (input.name.trim() === '' || input.platform.trim() === '') {
      throw new Error('Managed device name and platform are required.');
    }
    return this.repository.create({
      id: randomUUID(),
      adminId: input.adminId,
      name: input.name.trim(),
      platform: input.platform.trim(),
    });
  }

  findById(id: string): Promise<ManagedDevice | null> {
    return this.repository.findById(id);
  }

  listByAdminId(adminId: string): Promise<ManagedDevice[]> {
    return this.repository.listByAdminId(adminId);
  }
}
