import type { QueryResultRow } from 'pg';
import { mapPostgresPersistenceError } from '../db/errors.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type {
  DeviceMonitoringState,
  DeviceMonitoringSnapshot,
  BatteryChargingState,
  BatteryStatus,
  ManagementMode,
  NetworkState,
} from '../domain/device-monitoring.js';
import type {
  DeviceMonitoringRepository,
  MonitoringDevicePage,
  MonitoringDevicePageItem,
  MonitoringDevicePageRequest,
} from './device-monitoring-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface Row extends QueryResultRow {
  managed_device_id: string;
  schema_version: number;
  observed_at: Date;
  received_at: Date;
  android_version: string | null;
  api_level: number | null;
  app_version: string | null;
  app_version_code: number | null;
  battery_percentage: number | null;
  battery_charging_state: BatteryChargingState | null;
  battery_status: BatteryStatus | null;
  network_state: NetworkState | null;
  storage_total_bytes: string | null;
  storage_available_bytes: string | null;
  storage_used_bytes: string | null;
  memory_total_bytes: string | null;
  memory_available_bytes: string | null;
  memory_low: boolean | null;
  management_mode: ManagementMode | null;
  last_successful_initialization_at: Date | null;
  last_successful_communication_at: Date | null;
  last_seen_at: Date | null;
  enrollment_status: string;
  operational_status: string;
  communication_state: string | null;
  created_at: Date;
}

const selectColumns = `
  m.managed_device_id,
  m.schema_version,
  m.observed_at,
  m.received_at,
  m.android_version,
  m.api_level,
  m.app_version,
  m.app_version_code,
  m.battery_percentage,
  m.battery_charging_state,
  m.battery_status,
  m.network_state,
  m.storage_total_bytes,
  m.storage_available_bytes,
  m.storage_used_bytes,
  m.memory_total_bytes,
  m.memory_available_bytes,
  m.memory_low,
  m.management_mode,
  m.last_successful_initialization_at,
  m.last_successful_communication_at,
  d.last_seen_at,
  d.enrollment_status,
  d.operational_status,
  COALESCE(active.state, recent.state) AS communication_state,
  d.created_at
`;

const joins = `
  LEFT JOIN device_monitoring_state m
    ON m.managed_device_id = d.id
  LEFT JOIN LATERAL (
    SELECT s.state
    FROM device_connection_sessions s
    WHERE s.managed_device_id = d.id
      AND s.state IN ('CONNECTED', 'STALE')
      AND s.expires_at > NOW()
    ORDER BY s.last_activity_at DESC, s.id DESC
    LIMIT 1
  ) active ON TRUE
  LEFT JOIN LATERAL (
    SELECT s.state
    FROM device_connection_sessions s
    WHERE s.managed_device_id = d.id
    ORDER BY s.last_activity_at DESC, s.id DESC
    LIMIT 1
  ) recent ON TRUE
`;

const numberOrNull = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const mapState = (row: Row): DeviceMonitoringState => ({
  managedDeviceId: row.managed_device_id,
  schemaVersion: row.schema_version,
  observedAt: row.observed_at,
  receivedAt: row.received_at,
  androidVersion: row.android_version,
  apiLevel: row.api_level,
  appVersion: row.app_version,
  appVersionCode: row.app_version_code,
  batteryPercentage: row.battery_percentage,
  batteryChargingState: row.battery_charging_state,
  batteryStatus: row.battery_status,
  networkState: row.network_state,
  storageTotalBytes: numberOrNull(row.storage_total_bytes),
  storageAvailableBytes: numberOrNull(row.storage_available_bytes),
  storageUsedBytes: numberOrNull(row.storage_used_bytes),
  memoryTotalBytes: numberOrNull(row.memory_total_bytes),
  memoryAvailableBytes: numberOrNull(row.memory_available_bytes),
  memoryLow: row.memory_low,
  managementMode: row.management_mode,
  lastSuccessfulInitializationAt: row.last_successful_initialization_at,
  lastSuccessfulCommunicationAt: row.last_successful_communication_at,
  freshness: 'UNKNOWN',
  lastSeenAt: row.last_seen_at,
});

const cursorEncode = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    'base64url',
  );

const cursorDecode = (cursor: string): { createdAt: Date; id: string } => {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };
    if (typeof value.createdAt !== 'string' || typeof value.id !== 'string') {
      throw new Error();
    }
    const createdAt = new Date(value.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: value.id };
  } catch {
    throw new PersistenceError(
      'INVALID_STATE',
      'The monitoring page cursor is invalid.',
    );
  }
};

export class PostgresDeviceMonitoringRepository
  extends PostgresRepository
  implements DeviceMonitoringRepository
{
  readonly name = 'device-monitoring';

  async findCurrent(
    managedDeviceId: string,
  ): Promise<DeviceMonitoringState | null> {
    const result = await this.query<Row>(
      'SELECT ' +
        selectColumns +
        ' FROM managed_devices d ' +
        joins +
        ' WHERE d.id = $1',
      [managedDeviceId],
    );
    return result.rows[0] === undefined || result.rows[0].observed_at === null
      ? null
      : mapState(result.rows[0]);
  }

  async upsertIfNewer(
    snapshot: DeviceMonitoringSnapshot,
  ): Promise<'updated' | 'ignored'> {
    try {
      return await this.transaction(async (client) => {
        const fields: Record<string, unknown> = {
          schema_version: snapshot.schemaVersion,
          observed_at: snapshot.observedAt,
          received_at: snapshot.receivedAt,
        };

        const optional: Record<string, unknown> = {
          android_version: snapshot.androidVersion,
          api_level: snapshot.apiLevel,
          app_version: snapshot.appVersion,
          app_version_code: snapshot.appVersionCode,
          battery_percentage: snapshot.batteryPercentage,
          battery_charging_state: snapshot.batteryChargingState,
          battery_status: snapshot.batteryStatus,
          network_state: snapshot.networkState,
          storage_total_bytes: snapshot.storageTotalBytes,
          storage_available_bytes: snapshot.storageAvailableBytes,
          storage_used_bytes: snapshot.storageUsedBytes,
          memory_total_bytes: snapshot.memoryTotalBytes,
          memory_available_bytes: snapshot.memoryAvailableBytes,
          memory_low: snapshot.memoryLow,
          management_mode: snapshot.managementMode,
          last_successful_initialization_at:
            snapshot.lastSuccessfulInitializationAt,
          last_successful_communication_at:
            snapshot.lastSuccessfulCommunicationAt,
        };

        for (const [key, value] of Object.entries(optional)) {
          if (value !== undefined) fields[key] = value;
        }

        const names = Object.keys(fields);
        const values = Object.values(fields);
        const updateColumns = names
          .filter((name) => name !== 'observed_at' && name !== 'schema_version')
          .map((name) => name + '=EXCLUDED.' + name)
          .concat([
            'schema_version=EXCLUDED.schema_version',
            'observed_at=EXCLUDED.observed_at',
          ]);
        const placeholders = names
          .map((_, index) => '$' + (index + 2))
          .join(',');

        const result = await client.query(
          'INSERT INTO device_monitoring_state (managed_device_id,' +
            names.join(',') +
            ') VALUES ($1,' +
            placeholders +
            ') ON CONFLICT (managed_device_id) DO UPDATE SET ' +
            updateColumns.join(',') +
            ' WHERE EXCLUDED.observed_at > device_monitoring_state.observed_at ' +
            'RETURNING managed_device_id',
          [snapshot.managedDeviceId, ...values],
        );

        if (result.rowCount !== 1) return 'ignored';

        await client.query(
          'UPDATE managed_devices SET last_seen_at=$2,updated_at=NOW() ' +
            'WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at<$2)',
          [snapshot.managedDeviceId, snapshot.receivedAt],
        );

        return 'updated';
      });
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to persist monitoring state.',
      );
    }
  }

  async listForAdmin(
    adminId: string,
    page: MonitoringDevicePageRequest = {},
  ): Promise<MonitoringDevicePage> {
    const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
    const cursor =
      page.cursor === undefined || page.cursor === null
        ? null
        : cursorDecode(page.cursor);
    const where =
      cursor === null
        ? 'WHERE d.admin_id=$1'
        : 'WHERE d.admin_id=$1 AND (d.created_at,d.id)<($2,$3)';
    const values =
      cursor === null
        ? [adminId, limit + 1]
        : [adminId, cursor.createdAt, cursor.id, limit + 1];
    const limitPlaceholder = cursor === null ? '$2' : '$4';

    const result = await this.query<Row>(
      'SELECT ' +
        selectColumns +
        ' FROM managed_devices d ' +
        joins +
        ' ' +
        where +
        ' ORDER BY d.created_at DESC,d.id DESC LIMIT ' +
        limitPlaceholder,
      values,
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    return {
      items: rows.map((row) => ({
        state: row.observed_at === null ? null : mapState(row),
        enrollmentStatus: row.enrollment_status,
        operationalStatus: row.operational_status,
        communicationState: row.communication_state,
      })),
      nextCursor:
        hasMore && rows.length > 0
          ? cursorEncode(
              rows[rows.length - 1]!.created_at,
              rows[rows.length - 1]!.managed_device_id,
            )
          : null,
    };
  }

  async findForAdmin(
    adminId: string,
    managedDeviceId: string,
  ): Promise<MonitoringDevicePageItem | null> {
    const result = await this.query<Row>(
      'SELECT ' +
        selectColumns +
        ' FROM managed_devices d ' +
        joins +
        ' WHERE d.admin_id=$1 AND d.id=$2',
      [adminId, managedDeviceId],
    );
    const row = result.rows[0];
    if (row === undefined) return null;

    return {
      state: row.observed_at === null ? null : mapState(row),
      enrollmentStatus: row.enrollment_status,
      operationalStatus: row.operational_status,
      communicationState: row.communication_state,
    };
  }
}
