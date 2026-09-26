import type { QueryResultRow } from 'pg';
import type { ApplicationInventoryItem } from '../domain/application-management.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { ApplicationInventoryRepository } from './application-inventory-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface Row extends QueryResultRow {
  managed_device_id: string;
  package_name: string;
  label: string | null;
  version_name: string | null;
  version_code: string | number | null;
  install_state: ApplicationInventoryItem['installState'];
  enabled: boolean | null;
  first_observed_at: Date;
  last_observed_at: Date;
  last_received_at: Date;
  source_category: string | null;
}

const columns =
  'managed_device_id, package_name, label, version_name, version_code, install_state, enabled, first_observed_at, last_observed_at, last_received_at, source_category';

const toItem = (row: Row): ApplicationInventoryItem => ({
  managedDeviceId: row.managed_device_id,
  packageName: row.package_name,
  label: row.label,
  versionName: row.version_name,
  versionCode: row.version_code === null ? null : Number(row.version_code),
  installState: row.install_state,
  enabled: row.enabled,
  firstObservedAt: row.first_observed_at,
  lastObservedAt: row.last_observed_at,
  lastReceivedAt: row.last_received_at,
  sourceCategory: row.source_category,
});

const encodeCursor = (packageName: string): string =>
  Buffer.from(JSON.stringify({ packageName })).toString('base64url');

const decodeCursor = (cursor: string): string => {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { packageName?: unknown };
    if (typeof parsed.packageName !== 'string')
      throw new Error('Invalid cursor.');
    return parsed.packageName;
  } catch {
    throw new PersistenceError(
      'INVALID_STATE',
      'The application page cursor is invalid.',
    );
  }
};

export class PostgresApplicationInventoryRepository
  extends PostgresRepository
  implements ApplicationInventoryRepository
{
  readonly name = 'application-inventory';

  async replaceForDevice(input: {
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
  }): Promise<{ applied: boolean; receivedAt: Date }> {
    return this.transaction(async (client) => {
      const current = await client.query<{ last_received_at: Date | null }>(
        'SELECT MAX(last_received_at) AS last_received_at FROM application_inventory WHERE managed_device_id=$1',
        [input.managedDeviceId],
      );
      const currentReceived = current.rows[0]?.last_received_at ?? null;
      if (
        currentReceived !== null &&
        input.receivedAt.getTime() <= currentReceived.getTime()
      ) {
        return { applied: false, receivedAt: currentReceived };
      }

      for (const item of input.items) {
        await client.query(
          'INSERT INTO application_inventory (managed_device_id, package_name, label, version_name, version_code, install_state, enabled, first_observed_at, last_observed_at, last_received_at, source_category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) ' +
            'ON CONFLICT (managed_device_id, package_name) DO UPDATE SET label=EXCLUDED.label, version_name=EXCLUDED.version_name, version_code=EXCLUDED.version_code, install_state=EXCLUDED.install_state, enabled=EXCLUDED.enabled, first_observed_at=LEAST(application_inventory.first_observed_at,EXCLUDED.first_observed_at), last_observed_at=GREATEST(application_inventory.last_observed_at,EXCLUDED.last_observed_at), last_received_at=EXCLUDED.last_received_at, source_category=EXCLUDED.source_category',
          [
            input.managedDeviceId,
            item.packageName,
            item.label,
            item.versionName,
            item.versionCode,
            item.installState,
            item.enabled,
            input.observedAt,
            input.receivedAt,
            item.sourceCategory,
          ],
        );
      }

      if (input.items.length === 0) {
        await client.query(
          'DELETE FROM application_inventory WHERE managed_device_id=$1',
          [input.managedDeviceId],
        );
      } else {
        await client.query(
          'DELETE FROM application_inventory WHERE managed_device_id=$1 AND NOT (package_name = ANY($2::text[]))',
          [input.managedDeviceId, input.items.map((item) => item.packageName)],
        );
      }

      return { applied: true, receivedAt: input.receivedAt };
    });
  }

  async listForAdmin(
    adminId: string,
    managedDeviceId: string,
    page: { limit?: number; cursor?: string | null } = {},
  ) {
    const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
    const cursor = page.cursor == null ? null : decodeCursor(page.cursor);
    const params: unknown[] = [managedDeviceId, adminId];
    const whereCursor = cursor === null ? '' : ' AND ai.package_name > $3';
    if (cursor !== null) params.push(cursor);
    params.push(limit + 1);

    const result = await this.query<Row>(
      'SELECT ' +
        columns +
        ' FROM application_inventory ai JOIN managed_devices md ON md.id=ai.managed_device_id ' +
        'WHERE md.id=$1 AND md.admin_id=$2' +
        whereCursor +
        ' ORDER BY ai.package_name ASC LIMIT $' +
        params.length,
      params,
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const summary = await this.query<{
      observed_at: Date | null;
      received_at: Date | null;
    }>(
      'SELECT MAX(observed_at) AS observed_at, MAX(last_received_at) AS received_at ' +
        'FROM application_inventory ai JOIN managed_devices md ON md.id=ai.managed_device_id ' +
        'WHERE md.id=$1 AND md.admin_id=$2',
      [managedDeviceId, adminId],
    );

    return {
      items: rows.map(toItem),
      nextCursor: hasMore
        ? encodeCursor(rows[rows.length - 1]!.package_name)
        : null,
      observedAt: summary.rows[0]?.observed_at ?? null,
      receivedAt: summary.rows[0]?.received_at ?? null,
    };
  }

  async findForAdmin(
    adminId: string,
    managedDeviceId: string,
    packageName: string,
  ): Promise<ApplicationInventoryItem | null> {
    const result = await this.query<Row>(
      'SELECT ' +
        columns +
        ' FROM application_inventory ai JOIN managed_devices md ON md.id=ai.managed_device_id ' +
        'WHERE md.id=$1 AND md.admin_id=$2 AND ai.package_name=$3',
      [managedDeviceId, adminId, packageName],
    );
    return result.rows[0] === undefined ? null : toItem(result.rows[0]);
  }
}
