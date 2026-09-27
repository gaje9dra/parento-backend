import type { NetworkPolicyEventRepository, NetworkPolicyEventType } from './network-policy-event-repository.js';
import { PostgresRepository } from './postgres-repository.js';

export class PostgresNetworkPolicyEventRepository extends PostgresRepository implements NetworkPolicyEventRepository {
  readonly name = 'network-policy-events';

  async record(input: {
    id: string;
    eventType: NetworkPolicyEventType;
    adminId: string | null;
    managedDeviceId: string | null;
    policyId: string | null;
    policyVersion: number | null;
    metadata: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await this.query(
      'INSERT INTO network_policy_events (id,event_type,admin_id,managed_device_id,policy_id,policy_version,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [input.id, input.eventType, input.adminId, input.managedDeviceId, input.policyId, input.policyVersion, JSON.stringify(input.metadata)],
    );
  }
}