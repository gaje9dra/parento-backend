import { randomUUID } from 'node:crypto';
import type {
  ManagedDevice,
  ManagedDeviceStatus,
} from '../domain/managed-device.js';
import type {
  DevicePageRequest,
  DevicePage,
  ManagedDeviceRepository,
} from '../repositories/managed-device-repository.js';

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
    return this.repository.findByStableIdentifier(stableIdentifier.trim());
  }

  list(page?: DevicePageRequest): Promise<DevicePage> {
    return this.repository.list(page);
  }

  listByAdminId(
    adminId: string,
    page?: DevicePageRequest,
  ): Promise<DevicePage> {
    return this.repository.listByAdminId(adminId, page);
  }

  updateStatus(
    id: string,
    status: ManagedDeviceStatus,
  ): Promise<ManagedDevice | null> {
    return this.repository.updateStatus(id, status);
  }
}
