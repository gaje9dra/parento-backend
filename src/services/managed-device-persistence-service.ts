import { randomUUID } from 'node:crypto';
import type { ManagedDevice } from '../domain/managed-device.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';

export class ManagedDevicePersistenceService {
  constructor(private readonly repository: ManagedDeviceRepository) {}

  create(input: {
    adminId: string;
    stableIdentifier: string;
    name: string;
    platform: string;
  }): Promise<ManagedDevice> {
    const stableIdentifier = input.stableIdentifier.trim();
    if (
      stableIdentifier === '' ||
      input.name.trim() === '' ||
      input.platform.trim() === ''
    ) {
      throw new Error(
        'Managed device stable identifier, name, and platform are required.',
      );
    }

    return this.repository.create({
      id: randomUUID(),
      adminId: input.adminId,
      stableIdentifier,
      name: input.name.trim(),
      platform: input.platform.trim(),
    });
  }

  findById(id: string): Promise<ManagedDevice | null> {
    return this.repository.findById(id);
  }

  findByStableIdentifier(
    stableIdentifier: string,
  ): Promise<ManagedDevice | null> {
    return this.repository.findByStableIdentifier(stableIdentifier);
  }

  listByAdminId(
    adminId: string,
    page?: { limit?: number; cursor?: string | null },
  ) {
    return this.repository.listByAdminId(adminId, page);
  }
}
