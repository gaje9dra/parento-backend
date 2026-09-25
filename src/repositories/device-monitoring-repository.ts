import type { DeviceMonitoringSnapshot } from '../domain/device-monitoring.js';
import type { ManagedDevice, ManagedDeviceStatus } from '../domain/managed-device.js';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';
import type { Repository } from './repository.js';

export interface MonitoringDeviceSummary {
  readonly device: ManagedDevice;
  readonly snapshot: DeviceMonitoringSnapshot | null;
  readonly session: DeviceConnectionSession | null;
}

export interface MonitoringDevicePageRequest {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly enrollmentStatus?: ManagedDeviceStatus;
  readonly communicationState?: 'CONNECTED' | 'STALE' | 'DISCONNECTED' | 'EXPIRED';
  readonly managementMode?: 'NOT_MANAGED' | 'PROFILE_OWNER' | 'DEVICE_OWNER' | 'UNKNOWN';
  readonly freshness?: 'FRESH' | 'STALE' | 'VERY_STALE' | 'NEVER_REPORTED' | 'DISCONNECTED' | 'REVOKED';
  readonly search?: string;
}

export interface MonitoringDevicePage {
  readonly items: MonitoringDeviceSummary[];
  readonly nextCursor: string | null;
}

export interface DeviceMonitoringRepository extends Repository {
  upsert(
    snapshot: DeviceMonitoringSnapshot,
  ): Promise<{ snapshot: DeviceMonitoringSnapshot; updated: boolean }>;
  findByDeviceId(
    managedDeviceId: string,
  ): Promise<DeviceMonitoringSnapshot | null>;
  listForAdmin(
    adminId: string,
    page: MonitoringDevicePageRequest,
    now: Date,
    freshness: { freshMs: number; staleMs: number },
  ): Promise<MonitoringDevicePage>;
}
