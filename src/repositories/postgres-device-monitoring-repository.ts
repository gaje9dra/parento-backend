import type {
  DeviceMonitoringSnapshot,
  MonitoringBatteryStatus,
  MonitoringChargingState,
  MonitoringManagementMode,
  MonitoringNetworkState,
} from '../domain/device-monitoring.js';
import { mapPostgresPersistenceError } from '../db/errors.js';
import type { DeviceMonitoringRepository } from './device-monitoring-repository.js';
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
}

const columns =
  'managed_device_id,schema_version,device_collected_at,server_received_at,android_version,api_level,app_version,app_version_code,management_mode,battery_percentage,charging_state,battery_status,network_state,storage_total_bytes,storage_available_bytes,storage_used_bytes,memory_total_bytes,memory_available_bytes,memory_low,last_successful_initialization_at,last_successful_communication_at,last_monitoring_update_at';

const numberOrNull = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const map = (r: Row): DeviceMonitoringSnapshot => ({
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
});

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
          columns +
          ') VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) ' +
          'ON CONFLICT (managed_device_id) DO UPDATE SET ' +
          'schema_version=EXCLUDED.schema_version,device_collected_at=EXCLUDED.device_collected_at,server_received_at=EXCLUDED.server_received_at,android_version=EXCLUDED.android_version,api_level=EXCLUDED.api_level,app_version=EXCLUDED.app_version,app_version_code=EXCLUDED.app_version_code,management_mode=EXCLUDED.management_mode,battery_percentage=EXCLUDED.battery_percentage,charging_state=EXCLUDED.charging_state,battery_status=EXCLUDED.battery_status,network_state=EXCLUDED.network_state,storage_total_bytes=EXCLUDED.storage_total_bytes,storage_available_bytes=EXCLUDED.storage_available_bytes,storage_used_bytes=EXCLUDED.storage_used_bytes,memory_total_bytes=EXCLUDED.memory_total_bytes,memory_available_bytes=EXCLUDED.memory_available_bytes,memory_low=EXCLUDED.memory_low,last_successful_initialization_at=EXCLUDED.last_successful_initialization_at,last_successful_communication_at=EXCLUDED.last_successful_communication_at,last_monitoring_update_at=EXCLUDED.last_monitoring_update_at ' +
          'WHERE device_monitoring_snapshots.device_collected_at <= EXCLUDED.device_collected_at ' +
          'RETURNING ' +
          columns,
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

      return { snapshot: map(result.rows[0]), updated: true };
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
        columns +
        ' FROM device_monitoring_snapshots WHERE managed_device_id=$1',
      [managedDeviceId],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }
}
