import type { Repository } from './repository.js';

export type NetworkPolicyEventType =
  | 'POLICY_CREATED'
  | 'POLICY_UPDATED'
  | 'POLICY_DISABLED'
  | 'POLICY_ASSIGNED'
  | 'POLICY_REMOVED'
  | 'POLICY_SYNC_REQUESTED'
  | 'ENFORCEMENT_STATUS_CHANGED'
  | 'CAPABILITY_CHANGED';

export interface NetworkPolicyEventRepository extends Repository {
  record(input: {
    id: string;
    eventType: NetworkPolicyEventType;
    adminId: string | null;
    managedDeviceId: string | null;
    policyId: string | null;
    policyVersion: number | null;
    metadata: Record<string, string | number | boolean | null>;
  }): Promise<void>;
}