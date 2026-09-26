import type { DeviceMonitoringSnapshot } from '../domain/device-monitoring.js';
import type { Repository } from './repository.js';

export interface DeviceMonitoringRepository extends Repository {
  upsert(
    snapshot: DeviceMonitoringSnapshot,
  ): Promise<{ snapshot: DeviceMonitoringSnapshot; updated: boolean }>;
  findByDeviceId(
    managedDeviceId: string,
  ): Promise<DeviceMonitoringSnapshot | null>;
}
