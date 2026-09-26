import type { PoolClient } from 'pg';
import type {
  ApplicationAction,
  ApplicationEnforcementState,
  ApplicationEnforcementStatus,
  ApplicationInstallState,
  ApplicationInventoryItem,
  ApplicationInventoryState,
  ApplicationPolicy,
  ApplicationPolicyAssignment,
} from '../domain/application-management.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import { mapPostgresPersistenceError } from '../db/errors.js';
import type {
  ApplicationInventoryPage,
  ApplicationManagementRepository,
} from './application-management-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface InventoryRow {
  managed_device_id: string;
  package_name: string;
  application_label: string | null;
  version_name: string | null;
  version_code: string | number | null;
  install_state: ApplicationInstallState;
  enabled: boolean | null;
  category: string | null;
  first_observed_at: Date;
  last_observed_at: Date;
  received_at: Date;
}
interface SyncRow {
  managed_device_id: string;
  synchronization_id: string | null;
  observed_at: Date | null;
  received_at: Date | null;
}
interface PolicyRow {
  id: string;
  admin_id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'DISABLED';
  version: number;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string;
}
interface RuleRow {
  id: string;
  policy_id: string;
  package_name: string;
  action: ApplicationAction;
}
interface AssignmentRow {
  managed_device_id: string;
  policy_id: string;
  policy_version: number;
  assigned_at: Date;
  assigned_by: string;
}
interface EnforcementRow {
  managed_device_id: string;
  desired_policy_id: string | null;
  desired_policy_version: number | null;
  reported_policy_id: string | null;
  reported_policy_version: number | null;
  status: ApplicationEnforcementStatus;
  synchronization_required: boolean;
  synchronization_requested_at: Date | null;
  last_reported_at: Date | null;
  failure_code: string | null;
}
const inventoryColumns =
  'managed_device_id,package_name,application_label,version_name,version_code,install_state,enabled,category,first_observed_at,last_observed_at,received_at';
const policyColumns =
  'id,admin_id,name,description,status,version,created_at,updated_at,created_by,updated_by';
const enforcementColumns =
  'managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,synchronization_required,synchronization_requested_at,last_reported_at,failure_code';

const mapInventory = (r: InventoryRow): ApplicationInventoryItem => ({
  managedDeviceId: r.managed_device_id,
  packageName: r.package_name,
  label: r.application_label,
  versionName: r.version_name,
  versionCode: r.version_code === null ? null : Number(r.version_code),
  installState: r.install_state,
  enabled: r.enabled,
  category: r.category,
  firstObservedAt: r.first_observed_at,
  lastObservedAt: r.last_observed_at,
  receivedAt: r.received_at,
});
const mapSync = (r: SyncRow): ApplicationInventoryState => ({
  managedDeviceId: r.managed_device_id,
  synchronizationId: r.synchronization_id,
  observedAt: r.observed_at,
  receivedAt: r.received_at,
});
const mapPolicy = (r: PolicyRow, rules: RuleRow[]): ApplicationPolicy => ({
  id: r.id,
  adminId: r.admin_id,
  name: r.name,
  description: r.description,
  status: r.status,
  version: r.version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  createdBy: r.created_by,
  updatedBy: r.updated_by,
  rules: rules.filter((rule) => rule.policy_id === r.id).map((rule) => ({
    id: rule.id,
    policyId: rule.policy_id,
    packageName: rule.package_name,
    action: rule.action,
  })),
});
const mapAssignment = (r: AssignmentRow): ApplicationPolicyAssignment => ({
  managedDeviceId: r.managed_device_id,
  policyId: r.policy_id,
  policyVersion: r.policy_version,
  assignedAt: r.assigned_at,
  assignedBy: r.assigned_by,
});
const mapEnforcement = (r: EnforcementRow): ApplicationEnforcementState => ({
  managedDeviceId: r.managed_device_id,
  desiredPolicyId: r.desired_policy_id,
  desiredPolicyVersion: r.desired_policy_version,
  reportedPolicyId: r.reported_policy_id,
  reportedPolicyVersion: r.reported_policy_version,
  status: r.status,
  synchronizationRequired: r.synchronization_required,
  synchronizationRequestedAt: r.synchronization_requested_at,
  lastReportedAt: r.last_reported_at,
  failureCode: r.failure_code,
});

export class PostgresApplicationManagementRepository
  extends PostgresRepository
  implements ApplicationManagementRepository
{
  readonly name = 'application-management';

  async replaceInventory(input: {
    managedDeviceId: string;
    synchronizationId: string;
    observedAt: Date;
    receivedAt: Date;
    applications: Omit<ApplicationInventoryItem, 'managedDeviceId' | 'firstObservedAt' | 'lastObservedAt' | 'receivedAt'>[];
  }): Promise<{ applied: boolean; state: ApplicationInventoryState }> {
    try {
      return await this.transaction(async (client) => {
        await client.query(
          'SELECT id FROM managed_devices WHERE id=$1 FOR UPDATE',
          [input.managedDeviceId],
        );
        const currentResult = await client.query<SyncRow>(
          'SELECT managed_device_id,synchronization_id,observed_at,received_at FROM application_inventory_sync_state WHERE managed_device_id=$1 FOR UPDATE',
          [input.managedDeviceId],
        );
        const current = currentResult.rows[0];
        if (
          current &&
          (current.synchronization_id === input.synchronizationId ||
            (current.observed_at !== null &&
              input.observedAt.getTime() <= current.observed_at.getTime()))
        ) {
          return { applied: false, state: mapSync(current) };
        }

        const packages = input.applications.map((item) => item.packageName);
        if (packages.length > 0) {
          await client.query(
            'DELETE FROM application_inventory WHERE managed_device_id=$1 AND NOT (package_name = ANY($2::text[]))',
            [input.managedDeviceId, packages],
          );
        } else {
          await client.query(
            'DELETE FROM application_inventory WHERE managed_device_id=$1',
            [input.managedDeviceId],
          );
        }

        if (input.applications.length > 0) {
          const rows = input.applications.map((item) => ({
            package_name: item.packageName,
            application_label: item.label,
            version_name: item.versionName,
            version_code: item.versionCode,
            install_state: item.installState,
            enabled: item.enabled,
            category: item.category,
          }));
          await client.query(
            'INSERT INTO application_inventory (' +
              'managed_device_id,package_name,application_label,version_name,version_code,install_state,enabled,category,first_observed_at,last_observed_at,received_at' +
              ') SELECT $1,x.package_name,x.application_label,x.version_name,x.version_code,x.install_state,x.enabled,x.category,$2,$2,$3 ' +
              'FROM jsonb_to_recordset($4::jsonb) AS x(' +
              'package_name text,application_label text,version_name text,version_code bigint,install_state text,enabled boolean,category text' +
              ') ON CONFLICT (managed_device_id,package_name) DO UPDATE SET ' +
              'application_label=EXCLUDED.application_label,version_name=EXCLUDED.version_name,version_code=EXCLUDED.version_code,' +
              'install_state=EXCLUDED.install_state,enabled=EXCLUDED.enabled,category=EXCLUDED.category,' +
              'last_observed_at=EXCLUDED.last_observed_at,received_at=EXCLUDED.received_at',
            [
              input.managedDeviceId,
              input.observedAt,
              input.receivedAt,
              JSON.stringify(rows),
            ],
          );
        }

        const result = await client.query<SyncRow>(
          'INSERT INTO application_inventory_sync_state (managed_device_id,synchronization_id,observed_at,received_at) VALUES ($1,$2,$3,$4) ' +
            'ON CONFLICT (managed_device_id) DO UPDATE SET synchronization_id=EXCLUDED.synchronization_id,observed_at=EXCLUDED.observed_at,received_at=EXCLUDED.received_at ' +
            'RETURNING managed_device_id,synchronization_id,observed_at,received_at',
          [
            input.managedDeviceId,
            input.synchronizationId,
            input.observedAt,
            input.receivedAt,
          ],
        );
        return { applied: true, state: mapSync(result.rows[0]!) };
      });
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to synchronize application inventory.');
    }
  }

  async getInventoryState(managedDeviceId: string): Promise<ApplicationInventoryState | null> {
    const result = await this.query<SyncRow>(
      'SELECT managed_device_id,synchronization_id,observed_at,received_at FROM application_inventory_sync_state WHERE managed_device_id=$1',
      [managedDeviceId],
    );
    return result.rows[0] ? mapSync(result.rows[0]) : null;
  }

  async listInventory(
    managedDeviceId: string,
    page: { limit?: number; cursor?: string | null } = {},
  ): Promise<ApplicationInventoryPage> {
    const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
    const cursor =
      page.cursor === undefined || page.cursor === null
        ? null
        : Buffer.from(page.cursor, 'base64url').toString('utf8');
    let cursorValue: { packageName: string } | null = null;
    if (cursor !== null) {
      try {
        const parsed = JSON.parse(cursor) as { packageName?: unknown };
        if (typeof parsed.packageName !== 'string') throw new Error();
        cursorValue = { packageName: parsed.packageName };
      } catch {
        throw new PersistenceError('INVALID_STATE', 'The application page cursor is invalid.');
      }
    }
    const result = cursorValue
      ? await this.query<InventoryRow>(
          'SELECT ' + inventoryColumns + ' FROM application_inventory WHERE managed_device_id=$1 AND package_name>$2 ORDER BY package_name ASC LIMIT $3',
          [managedDeviceId, cursorValue.packageName, limit + 1],
        )
      : await this.query<InventoryRow>(
          'SELECT ' + inventoryColumns + ' FROM application_inventory WHERE managed_device_id=$1 ORDER BY package_name ASC LIMIT $2',
          [managedDeviceId, limit + 1],
        );
    const rows = result.rows.length > limit ? result.rows.slice(0, limit) : result.rows;
    const nextCursor =
      result.rows.length > limit
        ? Buffer.from(JSON.stringify({ packageName: rows[rows.length - 1]!.package_name })).toString('base64url')
        : null;
    return { items: rows.map(mapInventory), nextCursor };
  }

  async findInventoryItem(managedDeviceId: string, packageName: string): Promise<ApplicationInventoryItem | null> {
    const result = await this.query<InventoryRow>(
      'SELECT ' + inventoryColumns + ' FROM application_inventory WHERE managed_device_id=$1 AND package_name=$2',
      [managedDeviceId, packageName],
    );
    return result.rows[0] ? mapInventory(result.rows[0]) : null;
  }

  async createPolicy(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    createdBy: string;
    rules: { id: string; packageName: string; action: string }[];
  }): Promise<ApplicationPolicy> {
    try {
      return await this.transaction(async (client) => {
        const result = await client.query<PolicyRow>(
          'INSERT INTO application_policies (id,admin_id,name,description,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$5) RETURNING ' + policyColumns,
          [input.id,input.adminId,input.name,input.description,input.createdBy],
        );
        for (const rule of input.rules) {
          await client.query(
            'INSERT INTO application_policy_rules (id,policy_id,package_name,action) VALUES ($1,$2,$3,$4)',
            [rule.id,input.id,rule.packageName,rule.action],
          );
        }
        return mapPolicy(result.rows[0]!, input.rules.map((rule) => ({
          id: rule.id, policy_id: input.id, package_name: rule.packageName, action: rule.action as ApplicationAction,
        })));
      });
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to create application policy.');
    }
  }

  async updatePolicy(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    updatedBy: string;
    rules: { id: string; packageName: string; action: string }[];
  }): Promise<ApplicationPolicy | null> {
    try {
      return await this.transaction(async (client) => {
        const current = await client.query<PolicyRow>(
          'SELECT ' + policyColumns + ' FROM application_policies WHERE id=$1 AND admin_id=$2 FOR UPDATE',
          [input.id,input.adminId],
        );
        if (!current.rows[0]) return null;
        const updated = await client.query<PolicyRow>(
          'UPDATE application_policies SET name=$2,description=$3,version=version+1,updated_by=$4,updated_at=NOW() WHERE id=$1 RETURNING ' + policyColumns,
          [input.id,input.name,input.description,input.updatedBy],
        );
        await client.query('DELETE FROM application_policy_rules WHERE policy_id=$1',[input.id]);
        for (const rule of input.rules) {
          await client.query(
            'INSERT INTO application_policy_rules (id,policy_id,package_name,action) VALUES ($1,$2,$3,$4)',
            [rule.id,input.id,rule.packageName,rule.action],
          );
        }
        return mapPolicy(updated.rows[0]!, input.rules.map((rule) => ({
          id: rule.id, policy_id: input.id, package_name: rule.packageName, action: rule.action as ApplicationAction,
        })));
      });
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to update application policy.');
    }
  }

  async disablePolicy(id: string, adminId: string, updatedBy: string): Promise<ApplicationPolicy | null> {
    try {
      return await this.transaction(async (client) => {
        const result = await client.query<PolicyRow>(
          'UPDATE application_policies SET status=\'DISABLED\',version=version+1,updated_by=$3,updated_at=NOW() WHERE id=$1 AND admin_id=$2 RETURNING ' + policyColumns,
          [id,adminId,updatedBy],
        );
        if (!result.rows[0]) return null;
        const rules = await client.query<RuleRow>(
          'SELECT id,policy_id,package_name,action FROM application_policy_rules WHERE policy_id=$1 ORDER BY package_name',
          [id],
        );
        return mapPolicy(result.rows[0]!, rules.rows);
      });
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to disable application policy.');
    }
  }

  private async loadPolicy(client: PoolClient, id: string, adminId: string): Promise<ApplicationPolicy | null> {
    const policy = await client.query<PolicyRow>(
      'SELECT ' + policyColumns + ' FROM application_policies WHERE id=$1 AND admin_id=$2',
      [id,adminId],
    );
    if (!policy.rows[0]) return null;
    const rules = await client.query<RuleRow>(
      'SELECT id,policy_id,package_name,action FROM application_policy_rules WHERE policy_id=$1 ORDER BY package_name',
      [id],
    );
    return mapPolicy(policy.rows[0], rules.rows);
  }

  async getPolicy(id: string, adminId: string): Promise<ApplicationPolicy | null> {
    return this.transaction((client) => this.loadPolicy(client,id,adminId));
  }

  async listPolicies(adminId: string): Promise<ApplicationPolicy[]> {
    const policies = await this.query<PolicyRow>(
      'SELECT ' + policyColumns + ' FROM application_policies WHERE admin_id=$1 ORDER BY updated_at DESC,id DESC',
      [adminId],
    );
    if (policies.rows.length === 0) return [];
    const ids = policies.rows.map((row) => row.id);
    const rules = await this.query<RuleRow>(
      'SELECT id,policy_id,package_name,action FROM application_policy_rules WHERE policy_id = ANY($1::uuid[]) ORDER BY package_name',
      [ids],
    );
    return policies.rows.map((row) => mapPolicy(row,rules.rows));
  }

  async assignPolicy(input: {
    managedDeviceId: string;
    policyId: string;
    policyVersion: number;
    assignedBy: string;
  }): Promise<ApplicationPolicyAssignment> {
    try {
      return await this.transaction(async (client) => {
        const device = await client.query(
          'SELECT id FROM managed_devices WHERE id=$1 AND admin_id=$2 AND enrollment_status=\'ACTIVE\' AND operational_status=\'ACTIVE\' FOR UPDATE',
          [input.managedDeviceId,input.assignedBy],
        );
        if (!device.rows[0]) throw new PersistenceError('NOT_FOUND','Managed device not found.');
        const policy = await client.query<PolicyRow>(
          'SELECT ' + policyColumns + ' FROM application_policies WHERE id=$1 AND admin_id=$2 AND status=\'ACTIVE\' FOR UPDATE',
          [input.policyId,input.assignedBy],
        );
        if (!policy.rows[0] || policy.rows[0].version !== input.policyVersion)
          throw new PersistenceError('INVALID_STATE','Application policy is stale or unavailable.');
        const result = await client.query<AssignmentRow>(
          'INSERT INTO device_application_policy_assignments (managed_device_id,policy_id,policy_version,assigned_by) VALUES ($1,$2,$3,$4) ON CONFLICT (managed_device_id) DO UPDATE SET policy_id=EXCLUDED.policy_id,policy_version=EXCLUDED.policy_version,assigned_at=NOW(),assigned_by=EXCLUDED.assigned_by RETURNING managed_device_id,policy_id,policy_version,assigned_at,assigned_by',
          [input.managedDeviceId,input.policyId,input.policyVersion,input.assignedBy],
        );
        return mapAssignment(result.rows[0]!);
      });
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to assign application policy.');
    }
  }

  async removeAssignment(managedDeviceId: string, adminId: string): Promise<boolean> {
    const result = await this.query(
      'DELETE FROM device_application_policy_assignments d USING managed_devices m WHERE d.managed_device_id=m.id AND d.managed_device_id=$1 AND m.admin_id=$2',
      [managedDeviceId,adminId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getAssignment(managedDeviceId: string, adminId: string): Promise<ApplicationPolicyAssignment | null> {
    const result = await this.query<AssignmentRow>(
      'SELECT d.managed_device_id,d.policy_id,d.policy_version,d.assigned_at,d.assigned_by FROM device_application_policy_assignments d JOIN managed_devices m ON m.id=d.managed_device_id WHERE d.managed_device_id=$1 AND m.admin_id=$2',
      [managedDeviceId,adminId],
    );
    return result.rows[0] ? mapAssignment(result.rows[0]) : null;
  }

  async getEffectivePolicy(managedDeviceId: string, adminId: string): Promise<ApplicationPolicy | null> {
    const result = await this.query<PolicyRow>(
      'SELECT p.' + policyColumns.replaceAll(',', ',p.') +
        ' FROM device_application_policy_assignments d JOIN managed_devices m ON m.id=d.managed_device_id JOIN application_policies p ON p.id=d.policy_id ' +
        'WHERE d.managed_device_id=$1 AND m.admin_id=$2 AND p.status=\'ACTIVE\'',
      [managedDeviceId,adminId],
    );
    if (!result.rows[0]) return null;
    const rules = await this.query<RuleRow>(
      'SELECT id,policy_id,package_name,action FROM application_policy_rules WHERE policy_id=$1 ORDER BY package_name',
      [result.rows[0].id],
    );
    return mapPolicy(result.rows[0],rules.rows);
  }

  async getEnforcementState(managedDeviceId: string, adminId: string): Promise<ApplicationEnforcementState | null> {
    const result = await this.query<EnforcementRow>(
      'SELECT e.' + enforcementColumns.replaceAll(',', ',e.') +
        ' FROM application_enforcement_state e JOIN managed_devices m ON m.id=e.managed_device_id WHERE e.managed_device_id=$1 AND m.admin_id=$2',
      [managedDeviceId,adminId],
    );
    return result.rows[0] ? mapEnforcement(result.rows[0]) : null;
  }

  async recordEnforcement(input: {
    managedDeviceId: string;
    reportedPolicyId: string | null;
    reportedPolicyVersion: number | null;
    status: string;
    failureCode: string | null;
    reportedAt: Date;
  }): Promise<ApplicationEnforcementState | null> {
    try {
      const result = await this.query<EnforcementRow>(
        'UPDATE application_enforcement_state SET reported_policy_id=$2,reported_policy_version=$3,status=$4,synchronization_required=CASE WHEN desired_policy_id=$2 AND desired_policy_version=$3 THEN FALSE ELSE TRUE END,last_reported_at=$5,failure_code=$6,updated_at=$5 WHERE managed_device_id=$1 RETURNING ' + enforcementColumns,
        [input.managedDeviceId,input.reportedPolicyId,input.reportedPolicyVersion,input.status,input.reportedAt,input.failureCode],
      );
      return result.rows[0] ? mapEnforcement(result.rows[0]) : null;
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to record application enforcement state.');
    }
  }
}
