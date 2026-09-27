import type {
  NetworkPolicy,
  NetworkPolicyAssignment,
  NetworkPolicyCapability,
  NetworkPolicySyncState,
  NetworkRuleAction,
} from '../domain/network-policy.js';
import type { Repository } from './repository.js';

export interface NetworkPolicyRepository extends Repository {
  create(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    createdBy: string;
    rules: readonly { domain: string; action: NetworkRuleAction; enabled: boolean }[];
  }): Promise<NetworkPolicy>;
  findOwned(id: string, adminId: string): Promise<NetworkPolicy | null>;
  listOwned(adminId: string, page?: { limit?: number; cursor?: string | null }): Promise<{ items: NetworkPolicy[]; nextCursor: string | null }>;
  updateOwned(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    status: 'ACTIVE' | 'DISABLED';
    expectedVersion: number;
    updatedBy: string;
    rules: readonly { domain: string; action: NetworkRuleAction; enabled: boolean }[];
  }): Promise<NetworkPolicy>;
  assign(input: {
    managedDeviceId: string;
    policyId: string;
    policyVersion: number;
    assignedBy: string;
  }): Promise<NetworkPolicyAssignment>;
  removeAssignment(managedDeviceId: string, policyId: string): Promise<void>;
  findAssignment(managedDeviceId: string): Promise<NetworkPolicyAssignment | null>;
  findSyncState(managedDeviceId: string): Promise<NetworkPolicySyncState | null>;
  setSyncRequested(input: { managedDeviceId: string; policyId: string | null; policyVersion: number | null; requestedAt: Date }): Promise<NetworkPolicySyncState>;
  reportSync(input: {
    managedDeviceId: string;
    policyId: string | null;
    policyVersion: number | null;
    status: NetworkPolicySyncState['status'];
    reportedAt: Date;
    errorCode: string | null;
  }): Promise<NetworkPolicySyncState>;
  setCapability(input: {
    managedDeviceId: string;
    supported: boolean;
    mode: NetworkPolicyCapability['mode'];
    capabilityVersion: number | null;
    reportedAt: Date;
  }): Promise<NetworkPolicyCapability>;
  findCapability(managedDeviceId: string): Promise<NetworkPolicyCapability | null>;
}