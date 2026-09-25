import type { DeviceMonitoringState, DeviceMonitoringSnapshot } from '../domain/device-monitoring.js';
import type { Repository } from './repository.js';

export interface MonitoringDevicePageRequest {
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface MonitoringDevicePageItem {
  readonly state: DeviceMonitoringState | null;
  readonly enrollmentStatus: string;
  readonly operationalStatus: string;
  readonly communicationState: string | null;
}

export interface MonitoringDevicePage {
  readonly items: MonitoringDevicePageItem[];
  readonly nextCursor: string | null;
}

export interface DeviceMonitoringRepository extends Repository {
  findCurrent(managedDeviceId: string): Promise<MonitoringDeviceState | null>;
  upsertIfNewer(snapshot: DeviceMonitoringSnapshot): Promise<'updated' | 'ignored'>;
  listForAdmin(adminId: string, page?: MonitoringDevicePageRequest): Promise<MonitoringDevicePage>;
  findForAdmin(adminId: string, managedDeviceId: string): Promise<MonitoringDevicePageItem | null>;
}
