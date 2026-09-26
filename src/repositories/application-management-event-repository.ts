import type { Repository } from './repository.js';

export type ApplicationManagementEventType =
  | 'POLICY_CREATED'
  | 'POLICY_UPDATED'
  | 'POLICY_DISABLED'
  | 'POLICY_ASSIGNED'
  | 'POLICY_REMOVED'
  | 'INVENTORY_SYNCHRONIZED'
  | 'POLICY_SYNC_REQUESTED'
  | 'ENFORCEMENT_STATUS_CHANGED';

export interface ApplicationManagementEventRepository extends Repository {
  record(input: {
    id: string;
    eventType: ApplicationManagementEventType;
    adminId: string | null;
    managedDeviceId: string | null;
    policyId: string | null;
    policyVersion: number | null;
    metadata: Record<string, string | number | boolean | null>;
  }): Promise<void>;
}
