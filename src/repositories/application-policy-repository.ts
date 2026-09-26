import type {
  ApplicationPolicy,
  ApplicationPolicyAssignment,
  ApplicationPolicySyncState,
  ApplicationRuleAction,
} from '../domain/application-management.js';
import type { Repository } from './repository.js';

export interface ApplicationPolicyRepository extends Repository {
  create(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    createdBy: string;
    rules: readonly { packageName: string; action: ApplicationRuleAction }[];
  }): Promise<ApplicationPolicy>;
  findOwned(id: string, adminId: string): Promise<ApplicationPolicy | null>;
  listOwned(
    adminId: string,
    page?: { limit?: number; cursor?: string | null },
  ): Promise<{ items: ApplicationPolicy[]; nextCursor: string | null }>;
  updateOwned(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    status: 'ACTIVE' | 'DISABLED';
    expectedVersion: number;
    updatedBy: string;
    rules: readonly { packageName: string; action: ApplicationRuleAction }[];
  }): Promise<ApplicationPolicy>;
  disableOwned(
    id: string,
    adminId: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<ApplicationPolicy>;
  assign(input: {
    managedDeviceId: string;
    policyId: string;
    policyVersion: number;
    assignedBy: string;
  }): Promise<ApplicationPolicyAssignment>;
  removeAssignment(managedDeviceId: string, policyId: string): Promise<void>;
  findAssignment(managedDeviceId: string): Promise<ApplicationPolicyAssignment | null>;
  findSyncState(managedDeviceId: string): Promise<ApplicationPolicySyncState | null>;
  setSyncRequested(input: {
    managedDeviceId: string;
    policyId: string | null;
    policyVersion: number | null;
    requestedAt: Date;
  }): Promise<ApplicationPolicySyncState>;
  reportSync(input: {
    managedDeviceId: string;
    policyId: string | null;
    policyVersion: number | null;
    status: 'UNKNOWN' | 'PENDING' | 'APPLIED' | 'PARTIALLY_APPLIED' | 'FAILED' | 'STALE';
    reportedAt: Date;
    errorCode: string | null;
  }): Promise<ApplicationPolicySyncState>;
}
