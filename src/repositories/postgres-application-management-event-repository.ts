import type { ApplicationManagementEventRepository } from './application-management-event-repository.js';
import { PostgresRepository } from './postgres-repository.js';

export class PostgresApplicationManagementEventRepository
  extends PostgresRepository
  implements ApplicationManagementEventRepository
{
  readonly name = 'application-management-events';

  async record(input: {
    id: string;
    eventType:
      | 'POLICY_CREATED'
      | 'POLICY_UPDATED'
      | 'POLICY_DISABLED'
      | 'POLICY_ASSIGNED'
      | 'POLICY_REMOVED'
      | 'INVENTORY_SYNCHRONIZED'
      | 'POLICY_SYNC_REQUESTED'
      | 'ENFORCEMENT_STATUS_CHANGED';
    adminId: string | null;
    managedDeviceId: string | null;
    policyId: string | null;
    policyVersion: number | null;
    metadata: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await this.query(
      'INSERT INTO application_management_events (id,event_type,admin_id,managed_device_id,policy_id,policy_version,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        input.id,
        input.eventType,
        input.adminId,
        input.managedDeviceId,
        input.policyId,
        input.policyVersion,
        JSON.stringify(input.metadata),
      ],
    );
  }
}
