import type { QueryResultRow } from 'pg';
import type {
  ApplicationPolicy,
  ApplicationPolicyAssignment,
  ApplicationPolicyRule,
  ApplicationPolicySyncState,
  ApplicationRuleAction,
} from '../domain/application-management.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { ApplicationPolicyRepository } from './application-policy-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface PolicyRow extends QueryResultRow {
  id: string; admin_id: string; name: string; description: string | null;
  status: 'ACTIVE' | 'DISABLED'; version: number; created_at: Date; updated_at: Date;
  created_by: string; updated_by: string;
}
interface RuleRow extends QueryResultRow {
  policy_id: string; package_name: string; action: ApplicationRuleAction;
}
interface AssignmentRow extends QueryResultRow {
  managed_device_id: string; policy_id: string; policy_version: number;
  assigned_at: Date; updated_at: Date; assigned_by: string;
}
interface SyncRow extends QueryResultRow {
  managed_device_id: string; desired_policy_id: string | null; desired_policy_version: number | null;
  reported_policy_id: string | null; reported_policy_version: number | null;
  status: ApplicationPolicySyncState['status']; last_requested_at: Date | null;
  last_reported_at: Date | null; last_error_code: string | null; updated_at: Date;
}
const policyColumns =
  'id, admin_id, name, description, status, version, created_at, updated_at, created_by, updated_by';

const toPolicy = (
  row: PolicyRow,
  rules: ApplicationPolicyRule[],
): ApplicationPolicy => ({
  id: row.id,
  adminId: row.admin_id,
  name: row.name,
  description: row.description,
  status: row.status,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  rules,
});

const loadRules = async (
  query: <T extends QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: T[] }>,
  policyId: string,
): Promise<ApplicationPolicyRule[]> => {
  const result = await query<RuleRow>(
    'SELECT policy_id, package_name, action FROM application_policy_rules WHERE policy_id=$1 ORDER BY package_name',
    [policyId],
  );
  return result.rows;
};

const toAssignment = (row: AssignmentRow): ApplicationPolicyAssignment => ({
  managedDeviceId: row.managed_device_id,
  policyId: row.policy_id,
  policyVersion: row.policy_version,
  assignedAt: row.assigned_at,
  updatedAt: row.updated_at,
  assignedBy: row.assigned_by,
});

const toSync = (row: SyncRow): ApplicationPolicySyncState => ({
  managedDeviceId: row.managed_device_id,
  desiredPolicyId: row.desired_policy_id,
  desiredPolicyVersion: row.desired_policy_version,
  reportedPolicyId: row.reported_policy_id,
  reportedPolicyVersion: row.reported_policy_version,
  status: row.status,
  lastRequestedAt: row.last_requested_at,
  lastReportedAt: row.last_reported_at,
  lastErrorCode: row.last_error_code,
  updatedAt: row.updated_at,
});

export class PostgresApplicationPolicyRepository
  extends PostgresRepository
  implements ApplicationPolicyRepository
{
  readonly name = 'application-policy';

  async create(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    createdBy: string;
    rules: readonly { packageName: string; action: ApplicationRuleAction }[];
  }): Promise<ApplicationPolicy> {
    return this.transaction(async (client) => {
      const result = await client.query<PolicyRow>(
        'INSERT INTO application_policies (id,admin_id,name,description,status,version,created_by,updated_by) VALUES ($1,$2,$3,$4,\'ACTIVE\',1,$5,$5) RETURNING ' +
          policyColumns,
        [
          input.id,
          input.adminId,
          input.name,
          input.description,
          input.createdBy,
        ],
      );
      for (const rule of input.rules) {
        await client.query(
          'INSERT INTO application_policy_rules (policy_id,package_name,action) VALUES ($1,$2,$3)',
          [input.id, rule.packageName, rule.action],
        );
      }
      return toPolicy(
        result.rows[0]!,
        input.rules.map((rule) => ({
          policyId: input.id,
          packageName: rule.packageName,
          action: rule.action,
        })),
      );
    });
  }

  async findOwned(id: string, adminId: string) {
    const result = await this.query<PolicyRow>(
      'SELECT ' +
        policyColumns +
        ' FROM application_policies WHERE id=$1 AND admin_id=$2',
      [id, adminId],
    );
    if (result.rows[0] === undefined) return null;
    return toPolicy(result.rows[0], await loadRules(this.query.bind(this), id));
  }

  async listOwned(
    adminId: string,
    page: { limit?: number; cursor?: string | null } = {},
  ) {
    const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
    const cursor = page.cursor == null ? null : decodeURIComponent(page.cursor);
    const params: unknown[] = [adminId];
    const where = cursor === null ? '' : ' AND p.updated_at < $2';
    if (cursor !== null) params.push(new Date(cursor));
    params.push(limit + 1);
    const result = await this.query<PolicyRow>(
      'SELECT ' +
        policyColumns +
        ' FROM application_policies p WHERE p.admin_id=$1' +
        where +
        ' ORDER BY p.updated_at DESC,p.id DESC LIMIT $' +
        params.length,
      params,
    );
    const rows = result.rows;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const policies = await Promise.all(
      items.map(async (row) =>
        toPolicy(row, await loadRules(this.query.bind(this), row.id)),
      ),
    );
    return {
      items: policies,
      nextCursor: hasMore
        ? encodeURIComponent(rows[limit - 1]!.updated_at.toISOString())
        : null,
    };
  }

  async updateOwned(input: {
    id: string;
    adminId: string;
    name: string;
    description: string | null;
    status: 'ACTIVE' | 'DISABLED';
    expectedVersion: number;
    updatedBy: string;
    rules: readonly { packageName: string; action: ApplicationRuleAction }[];
  }) {
    return this.transaction(async (client) => {
      const current = await client.query<PolicyRow>(
        'SELECT ' +
          policyColumns +
          ' FROM application_policies WHERE id=$1 AND admin_id=$2 FOR UPDATE',
        [input.id, input.adminId],
      );
      const row = current.rows[0];
      if (!row)
        throw new PersistenceError(
          'NOT_FOUND',
          'Application policy was not found.',
        );
      if (row.version !== input.expectedVersion)
        throw new PersistenceError(
          'CONFLICT',
          'Application policy version is stale.',
        );

      const nextVersion = row.version + 1;
      const updated = await client.query<PolicyRow>(
        'UPDATE application_policies SET name=$3,description=$4,status=$5,version=$6,updated_by=$7,updated_at=NOW() WHERE id=$1 AND admin_id=$2 RETURNING ' +
          policyColumns,
        [
          input.id,
          input.adminId,
          input.name,
          input.description,
          input.status,
          nextVersion,
          input.updatedBy,
        ],
      );
      await client.query(
        'DELETE FROM application_policy_rules WHERE policy_id=$1',
        [input.id],
      );
      for (const rule of input.rules) {
        await client.query(
          'INSERT INTO application_policy_rules(policy_id,package_name,action) VALUES($1,$2,$3)',
          [input.id, rule.packageName, rule.action],
        );
      }
      return toPolicy(
        updated.rows[0]!,
        input.rules.map((rule) => ({
          policyId: input.id,
          packageName: rule.packageName,
          action: rule.action,
        })),
      );
    });
  }

  async disableOwned(
    id: string,
    adminId: string,
    expectedVersion: number,
    updatedBy: string,
  ) {
    const current = await this.findOwned(id, adminId);
    if (!current)
      throw new PersistenceError(
        'NOT_FOUND',
        'Application policy was not found.',
      );
    return this.updateOwned({
      id,
      adminId,
      name: current.name,
      description: current.description,
      status: 'DISABLED',
      expectedVersion,
      updatedBy,
      rules: current.rules.map((rule) => ({
        packageName: rule.packageName,
        action: rule.action,
      })),
    });
  }

  async assign(input: {
    managedDeviceId: string;
    policyId: string;
    policyVersion: number;
    assignedBy: string;
  }) {
    const result = await this.query<AssignmentRow>(
      'INSERT INTO application_policy_assignments(managed_device_id,policy_id,policy_version,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT(managed_device_id) DO UPDATE SET policy_id=EXCLUDED.policy_id,policy_version=EXCLUDED.policy_version,assigned_by=EXCLUDED.assigned_by,updated_at=NOW() RETURNING managed_device_id,policy_id,policy_version,assigned_at,updated_at,assigned_by',
      [
        input.managedDeviceId,
        input.policyId,
        input.policyVersion,
        input.assignedBy,
      ],
    );
    return toAssignment(result.rows[0]!);
  }

  async removeAssignment(managedDeviceId: string, policyId: string) {
    await this.query(
      'DELETE FROM application_policy_assignments WHERE managed_device_id=$1 AND policy_id=$2',
      [managedDeviceId, policyId],
    );
  }

  async findAssignment(managedDeviceId: string) {
    const result = await this.query<AssignmentRow>(
      'SELECT managed_device_id,policy_id,policy_version,assigned_at,updated_at,assigned_by FROM application_policy_assignments WHERE managed_device_id=$1',
      [managedDeviceId],
    );
    return result.rows[0] === undefined ? null : toAssignment(result.rows[0]);
  }

  async findSyncState(managedDeviceId: string) {
    const result = await this.query<SyncRow>(
      'SELECT managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at FROM application_policy_sync_state WHERE managed_device_id=$1',
      [managedDeviceId],
    );
    return result.rows[0] === undefined ? null : toSync(result.rows[0]);
  }

  async setSyncRequested(input: {
    managedDeviceId: string;
    policyId: string | null;
    policyVersion: number | null;
    requestedAt: Date;
  }) {
    const result = await this.query<SyncRow>(
      'INSERT INTO application_policy_sync_state(managed_device_id,desired_policy_id,desired_policy_version,status,last_requested_at,updated_at) VALUES($1,$2,$3,\'PENDING\',$4,NOW()) ON CONFLICT(managed_device_id) DO UPDATE SET desired_policy_id=EXCLUDED.desired_policy_id,desired_policy_version=EXCLUDED.desired_policy_version,status=EXCLUDED.status,last_requested_at=EXCLUDED.last_requested_at,last_error_code=NULL,updated_at=NOW() RETURNING managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at',
      [
        input.managedDeviceId,
        input.policyId,
        input.policyVersion,
        input.requestedAt,
      ],
    );
    return toSync(result.rows[0]!);
  }

  async reportSync(input: {
    managedDeviceId: string;
    policyId: string | null;
    policyVersion: number | null;
    status: ApplicationPolicySyncState['status'];
    reportedAt: Date;
    errorCode: string | null;
  }) {
    const result = await this.query<SyncRow>(
      'UPDATE application_policy_sync_state SET reported_policy_id=$2,reported_policy_version=$3,status=$4,last_reported_at=$5,last_error_code=$6,updated_at=NOW() WHERE managed_device_id=$1 RETURNING managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at',
      [
        input.managedDeviceId,
        input.policyId,
        input.policyVersion,
        input.status,
        input.reportedAt,
        input.errorCode,
      ],
    );
    if (result.rows[0] === undefined) {
      return this.setSyncRequested({
        managedDeviceId: input.managedDeviceId,
        policyId: input.policyId,
        policyVersion: input.policyVersion,
        requestedAt: input.reportedAt,
      });
    }
    return toSync(result.rows[0]);
  }
}
