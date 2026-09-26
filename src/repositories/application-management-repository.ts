import type {
  ApplicationEnforcementState,
  ApplicationInventoryItem,
  ApplicationInventoryState,
  ApplicationPolicy,
  ApplicationPolicyAssignment,
} from '../domain/application-management.js';
import type { Repository } from './repository.js';

export interface ApplicationInventoryPage {
  readonly items: ApplicationInventoryItem[];
  readonly nextCursor: string | null;
}

export interface ApplicationManagementRepository extends Repository {
  replaceInventory(input: {
    managedDeviceId: string;
    synchronizationId: string;
    observedAt: Date;
    receivedAt: Date;
    applications: Omit<ApplicationInventoryItem, 'managedDeviceId' | 'firstObservedAt' | 'lastObservedAt' | 'receivedAt'>[];
  }): Promise<{ applied: boolean; state: ApplicationInventoryState }>;
  getInventoryState(managedDeviceId: string): Promise<ApplicationInventoryState | null>;
  listInventory(
    managedDeviceId: string,
    page?: { limit?: number; cursor?: string | null },
  ): Promise<ApplicationInventoryPage>;
  findInventoryItem(
    managedDeviceId: string,
    packageName: string,
  ): Promise<ApplicationInventoryItem | null>;

  createPolicy(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    createdBy: string;
    rules: { id: string; packageName: string; action: string }[];
  }): Promise<ApplicationPolicy>;
  updatePolicy(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    updatedBy: string;
    rules: { id: string; packageName: string; action: string }[];
  }): Promise<ApplicationPolicy | null>;
  disablePolicy(id: string, adminId: string, updatedBy: string): Promise<ApplicationPolicy | null>;
  getPolicy(id: string, adminId: string): Promise<ApplicationPolicy | null>;
  listPolicies(adminId: string): Promise<ApplicationPolicy[]>;

  assignPolicy(input: {
    managedDeviceId: string;
    policyId: string;
    policyVersion: number;
    assignedBy: string;
  }): Promise<ApplicationPolicyAssignment>;
  listAssignmentsForPolicy(policyId: string, adminId: string): Promise<ApplicationPolicyAssignment[]>;
  removeAssignment(managedDeviceId: string, adminId: string): Promise<boolean>;
  getAssignment(managedDeviceId: string, adminId: string): Promise<ApplicationPolicyAssignment | null>;
  getEffectivePolicy(
    managedDeviceId: string,
    adminId: string,
  ): Promise<ApplicationPolicy | null>;

  getEnforcementState(
    managedDeviceId: string,
    adminId: string,
  ): Promise<ApplicationEnforcementState | null>;
  recordEnforcement(input: {
    managedDeviceId: string;
    reportedPolicyId: string | null;
    reportedPolicyVersion: number | null;
    status: string;
    failureCode: string | null;
    reportedAt: Date;
  }): Promise<ApplicationEnforcementState | null>;
}
