import type { DeviceConnectionSession, DeviceConnectionState } from '../domain/device-connection-session.js';
import type {
  DeviceMonitoringSnapshot,
  MonitoringBatteryStatus,
  MonitoringChargingState,
  MonitoringManagementMode,
  MonitoringNetworkState,
} from '../domain/device-monitoring.js';
import type { ManagedDevice, ManagedDeviceStatus } from '../domain/managed-device.js';
import { mapPostgresPersistenceError } from '../db/errors.js';
import type {
  DeviceMonitoringRepository,
  MonitoringDevicePage,
  MonitoringDevicePageRequest,
  MonitoringDeviceSummary,
} from './device-monitoring-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface Row {
  managed_device_id: string;
  schema_version: number;
  device_collected_at: Date;
  server_received_at: Date;
  android_version: string;
  api_level: number;
  app_version: string;
  app_version_code: string | number;
  management_mode: MonitoringManagementMode;
  battery_percentage: number | null;
  charging_state: MonitoringChargingState;
  battery_status: MonitoringBatteryStatus;
  network_state: MonitoringNetworkState;
  storage_total_bytes: string | number | null;
  storage_available_bytes: string | number | null;
  storage_used_bytes: string | number | null;
  memory_total_bytes: string | number | null;
  memory_available_bytes: string | number | null;
  memory_low: boolean | null;
  last_successful_initialization_at: Date | null;
  last_successful_communication_at: Date | null;
  last_monitoring_update_at: Date;
  device_id: string;
  admin_id: string;
  stable_identifier: string;
  device_name: string;
  platform: string;
  enrollment_status: ManagedDeviceStatus;
  operational_status: ManagedDeviceStatus;
  device_created_at: Date;
  device_updated_at: Date;
  device_last_seen_at: Date | null;
  session_id: string | null;
  session_state: DeviceConnectionState | null;
  session_created_at: Date | null;
  session_connected_at: Date | null;
  session_last_activity_at: Date | null;
  session_disconnected_at: Date | null;
  session_expires_at: Date | null;
  session_last_seen_at: Date | null;
  session_revoked_at: Date | null;
}

const snapshotColumns =
  'm.managed_device_id,m.schema_version,m.device_collected_at,m.server_received_at,m.android_version,m.api_level,m.app_version,m.app_version_code,m.management_mode,m.battery_percentage,m.charging_state,m.battery_status,m.network_state,m.storage_total_bytes,m.storage_available_bytes,m.storage_used_bytes,m.memory_total_bytes,m.memory_available_bytes,m.memory_low,m.last_successful_initialization_at,m.last_successful_communication_at,m.last_monitoring_update_at';

const deviceColumns =
  'd.id AS device_id,d.admin_id,d.stable_identifier,d.name AS device_name,d.platform,d.enrollment_status,d.operational_status,d.created_at AS device_created_at,d.updated_at AS device_updated_at,d.last_seen_at AS device_last_seen_at';

const sessionColumns =
  's.id AS session_id,s.state AS session_state,s.created_at AS session_created_at,s.connected_at AS session_connected_at,s.last_activity_at AS session_last_activity_at,s.disconnected_at AS session_disconnected_at,s.expires_at AS session_expires_at,s.last_seen_at AS session_last_seen_at,s.revoked_at AS session_revoked_at';

const numberOrNull = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const mapSnapshot = (r: Row): DeviceMonitoringSnapshot | null =>
  r.managed_device_id === undefined
    ? null
    : {
        managedDeviceId: r.managed_device_id,
        schemaVersion: r.schema_version,
        deviceCollectedAt: r.device_collected_at,
        serverReceivedAt: r.server_received_at,
        androidVersion: r.android_version,
        apiLevel: r.api_level,
        appVersion: r.app_version,
        appVersionCode: Number(r.app_version_code),
        managementMode: r.management_mode,
        batteryPercentage: r.battery_percentage,
        chargingState: r.charging_state,
        batteryStatus: r.battery_status,
        networkState: r.network_state,
        storageTotalBytes: numberOrNull(r.storage_total_bytes),
        storageAvailableBytes: numberOrNull(r.storage_available_bytes),
        storageUsedBytes: numberOrNull(r.storage_used_bytes),
        memoryTotalBytes: numberOrNull(r.memory_total_bytes),
        memoryAvailableBytes: numberOrNull(r.memory_available_bytes),
        memoryLow: r.memory_low,
        lastSuccessfulInitializationAt: r.last_successful_initialization_at,
        lastSuccessfulCommunicationAt: r.last_successful_communication_at,
        lastMonitoringUpdateAt: r.last_monitoring_update_at,
      };

const mapDevice = (r: Row): ManagedDevice => ({
  id: r.device_id,
  adminId: r.admin_id,
  stableIdentifier: r.stable_identifier,
  name: r.device_name,
  platform: r.platform,
  enrollmentStatus: r.enrollment_status,
  operationalStatus: r.operational_status,
  createdAt: r.device_created_at,
  updatedAt: r.device_updated_at,
  lastSeenAt: r.device_last_seen_at,
});

const mapSession = (r: Row): DeviceConnectionSession | null =>
  r.session_id === null || r.session_state === null || r.session_expires_at === null
    ? null
    : {
        id: r.session_id,
        managedDeviceId: r.device_id,
        state: r.session_state,
        createdAt: r.session_created_at!,
        connectedAt: r.session_connected_at,
        lastActivityAt: r.session_last_activity_at!,
        disconnectedAt: r.session_disconnected_at,
        expiresAt: r.session_expires_at,
        lastSeenAt: r.session_last_seen_at!,
        revokedAt: r.session_revoked_at,
      };

const encodeCursor = (row: Row): string =>
  Buffer.from(
    JSON.stringify({
      createdAt: row.device_created_at.toISOString(),
      id: row.device_id,
    }),
  ).toString('base64url');

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('Invalid cursor.');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error('Invalid cursor.');
    return { createdAt, id: parsed.id };
  } catch {
    throw new Error('Invalid monitoring page cursor.');
  }
};

export class PostgresDeviceMonitoringRepository
  extends PostgresRepository
  implements DeviceMonitoringRepository
{
  readonly name = 'device-monitoring';

  async upsert(
    snapshot: DeviceMonitoringSnapshot,
  ): Promise<{ snapshot: DeviceMonitoringSnapshot; updated: boolean }> {
    try {
      const result = await this.query<Row>(
        'INSERT INTO device_monitoring_snapshots (' +
          snapshotColumns.replaceAll('m.', '') +
          ') VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) ' +
          'ON CONFLICT (managed_device_id) DO UPDATE SET ' +
          'schema_version=EXCLUDED.schema_version,device_collected_at=EXCLUDED.device_collected_at,server_received_at=EXCLUDED.server_received_at,android_version=EXCLUDED.android_version,api_level=EXCLUDED.api_level,app_version=EXCLUDED.app_version,app_version_code=EXCLUDED.app_version_code,management_mode=EXCLUDED.management_mode,battery_percentage=EXCLUDED.battery_percentage,charging_state=EXCLUDED.charging_state,battery_status=EXCLUDED.battery_status,network_state=EXCLUDED.network_state,storage_total_bytes=EXCLUDED.storage_total_bytes,storage_available_bytes=EXCLUDED.storage_available_bytes,storage_used_bytes=EXCLUDED.storage_used_bytes,memory_total_bytes=EXCLUDED.memory_total_bytes,memory_available_bytes=EXCLUDED.memory_available_bytes,memory_low=EXCLUDED.memory_low,last_successful_initialization_at=EXCLUDED.last_successful_initialization_at,last_successful_communication_at=EXCLUDED.last_successful_communication_at,last_monitoring_update_at=EXCLUDED.last_monitoring_update_at ' +
          'WHERE device_monitoring_snapshots.device_collected_at <= EXCLUDED.device_collected_at ' +
          'RETURNING ' +
          snapshotColumns.replaceAll('m.', ''),
        [
          snapshot.managedDeviceId,
          snapshot.schemaVersion,
          snapshot.deviceCollectedAt,
          snapshot.serverReceivedAt,
          snapshot.androidVersion,
          snapshot.apiLevel,
          snapshot.appVersion,
          snapshot.appVersionCode,
          snapshot.managementMode,
          snapshot.batteryPercentage,
          snapshot.chargingState,
          snapshot.batteryStatus,
          snapshot.networkState,
          snapshot.storageTotalBytes,
          snapshot.storageAvailableBytes,
          snapshot.storageUsedBytes,
          snapshot.memoryTotalBytes,
          snapshot.memoryAvailableBytes,
          snapshot.memoryLow,
          snapshot.lastSuccessfulInitializationAt,
          snapshot.lastSuccessfulCommunicationAt,
          snapshot.lastMonitoringUpdateAt,
        ],
      );

      if (result.rows[0] === undefined) {
        const existing = await this.findByDeviceId(snapshot.managedDeviceId);
        if (existing === null) {
          throw new Error('Monitoring snapshot disappeared during update.');
        }
        return { snapshot: existing, updated: false };
      }

      return { snapshot: this.mapPersistedSnapshot(result.rows[0]), updated: true };
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to store device monitoring snapshot.',
      );
    }
  }

  async findByDeviceId(
    managedDeviceId: string,
  ): Promise<DeviceMonitoringSnapshot | null> {
    const result = await this.query<Row>(
      'SELECT ' +
        snapshotColumns.replaceAll('m.', '') +
        ' FROM device_monitoring_snapshots m WHERE m.managed_device_id=$1',
      [managedDeviceId],
    );
    return result.rows[0] === undefined ? null : this.mapPersistedSnapshot(result.rows[0]);
  }

  async listForAdmin(
    adminId: string,
    page: MonitoringDevicePageRequest,
    now: Date,
    freshness: { freshMs: number; staleMs: number },
  ): Promise<MonitoringDevicePage> {
    try {
      const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
      const cursor = page.cursor == null ? null : decodeCursor(page.cursor);
      const values: unknown[] = [adminId, now, freshness.freshMs, freshness.staleMs];
      const conditions = ['d.admin_id = $1'];
      const add = (value: unknown): string => {
        values.push(value);
        return '$' + values.length;
      };

      if (page.enrollmentStatus !== undefined) {
        conditions.push('d.enrollment_status = ' + add(page.enrollmentStatus));
      }
      if (page.managementMode !== undefined) {
        conditions.push('m.management_mode = ' + add(page.managementMode));
      }
      if (page.search !== undefined && page.search.trim() !== '') {
        const search = add('%' + page.search.trim() + '%');
        conditions.push('(d.name ILIKE ' + search + ' OR d.stable_identifier ILIKE ' + search + ')');
      }

      const freshnessExpression = `CASE
        WHEN d.enrollment_status = 'REVOKED' OR d.operational_status = 'REVOKED' THEN 'REVOKED'
        WHEN s.id IS NULL OR s.expires_at <= $2 OR s.state IN ('DISCONNECTED','EXPIRED') THEN 'DISCONNECTED'
        WHEN m.managed_device_id IS NULL THEN 'NEVER_REPORTED'
        WHEN EXTRACT(EPOCH FROM ($2 - m.server_received_at)) * 1000 <= $3 THEN 'FRESH'
        WHEN EXTRACT(EPOCH FROM ($2 - m.server_received_at)) * 1000 <= $4 THEN 'STALE'
        ELSE 'VERY_STALE'
      END`;
      const communicationExpression = `CASE
        WHEN s.id IS NULL THEN 'DISCONNECTED'
        WHEN s.expires_at <= $2 THEN 'EXPIRED'
        ELSE s.state
      END`;

      if (page.communicationState !== undefined) {
        conditions.push(communicationExpression + ' = ' + add(page.communicationState));
      }
      if (page.freshness !== undefined) {
        conditions.push(freshnessExpression + ' = ' + add(page.freshness));
      }
      if (cursor !== null) {
        conditions.push('(d.created_at, d.id) < (' + add(cursor.createdAt) + ', ' + add(cursor.id) + ')');
      }

      const limitPlaceholder = add(limit + 1);
      const result = await this.query<Row>(
        'SELECT ' +
          snapshotColumns +
          ',' +
          deviceColumns +
          ',' +
          sessionColumns +
          ' FROM managed_devices d ' +
          'LEFT JOIN device_monitoring_snapshots m ON m.managed_device_id=d.id ' +
          'LEFT JOIN LATERAL (' +
          'SELECT id,state,created_at,connected_at,last_activity_at,disconnected_at,expires_at,last_seen_at,revoked_at ' +
          'FROM device_connection_sessions WHERE managed_device_id=d.id ' +
          'ORDER BY last_seen_at DESC, created_at DESC, id DESC LIMIT 1' +
          ') s ON TRUE ' +
          'WHERE ' +
          conditions.join(' AND ') +
          ' ORDER BY d.created_at DESC, d.id DESC LIMIT ' +
          limitPlaceholder,
        values,
      );

      const hasMore = result.rows.length > limit;
      const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
      return {
        items: rows.map((row) => ({
          device: mapDevice(row),
          snapshot: row.managed_device_id === null ? null : this.mapPersistedSnapshot(row),
          session: mapSession(row),
        })),
        nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]!) : null,
      };
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to query device monitoring summaries.',
      );
    }
  }

  private mapPersistedSnapshot(row: Row): DeviceMonitoringSnapshot {
    return {
      managedDeviceId: row.managed_device_id,
      schemaVersion: row.schema_version,
      deviceCollectedAt: row.device_collected_at,
      serverReceivedAt: row.server_received_at,
      androidVersion: row.android_version,
      apiLevel: row.api_level,
      appVersion: row.app_version,
      appVersionCode: Number(row.app_version_code),
      managementMode: row.management_mode,
      batteryPercentage: row.battery_percentage,
      chargingState: row.charging_state,
      batteryStatus: row.battery_status,
      networkState: row.network_state,
      storageTotalBytes: numberOrNull(row.storage_total_bytes),
      storageAvailableBytes: numberOrNull(row.storage_available_bytes),
      storageUsedBytes: numberOrNull(row.storage_used_bytes),
      memoryTotalBytes: numberOrNull(row.memory_total_bytes),
      memoryAvailableBytes: numberOrNull(row.memory_available_bytes),
      memoryLow: row.memory_low,
      lastSuccessfulInitializationAt: row.last_successful_initialization_at,
      lastSuccessfulCommunicationAt: row.last_successful_communication_at,
      lastMonitoringUpdateAt: row.last_monitoring_update_at,
    };
  }
}
