import type { ApplicationInventoryItem } from '../domain/application-management.js';
import type { Repository } from './repository.js';

export interface ApplicationInventoryRepository extends Repository {
  replaceForDevice(input: {
    managedDeviceId: string;
    observedAt: Date;
    receivedAt: Date;
    items: readonly Omit<
      ApplicationInventoryItem,
      | 'managedDeviceId'
      | 'firstObservedAt'
      | 'lastObservedAt'
      | 'lastReceivedAt'
    >[];
  }): Promise<{ applied: boolean; receivedAt: Date }>;
  listForAdmin(
    adminId: string,
    managedDeviceId: string,
    page?: { limit?: number; cursor?: string | null },
  ): Promise<{
    items: ApplicationInventoryItem[];
    nextCursor: string | null;
    observedAt: Date | null;
    receivedAt: Date | null;
  }>;
  findForAdmin(
    adminId: string,
    managedDeviceId: string,
    packageName: string,
  ): Promise<ApplicationInventoryItem | null>;
}
