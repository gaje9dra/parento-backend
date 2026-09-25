import { AppError } from '../types/errors.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { DeviceMonitoringRepository } from '../repositories/device-monitoring-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type { BatteryChargingState, BatteryStatus, DeviceMonitoringSnapshot, ManagementMode, NetworkState, DeviceMonitoringState } from '../domain/device-monitoring.js';
import { getMonitoringFreshness } from '../domain/device-monitoring.js';

export interface DeviceMonitoringServiceOptions {
  readonly staleSeconds: number;
  readonly veryStaleSeconds: number;
  readonly maxFutureSkewSeconds: number;
}

export interface MonitoringIngestionInput {
  readonly managedDeviceId: string;
  readonly schemaVersion: number;
  readonly observedAt: Date;
  readonly now: Date;
  readonly androidVersion?: string | null;
  readonly apiLevel?: number | null;
  readonly appVersion?: string | null;
  readonly appVersionCode?: number | null;
  readonly batteryPercentage?: number | null;
  readonly batteryChargingState?: BatteryChargingState | null;
  readonly batteryStatus?: BatteryStatus | null;
  readonly networkState?: NetworkState | null;
  readonly storageTotalBytes?: number | null;
  readonly storageAvailableBytes?: number | null;
  readonly storageUsedBytes?: number | null;
  readonly memoryTotalBytes?: number | null;
  readonly memoryAvailableBytes?: number | null;
  readonly memoryLow?: boolean | null;
  readonly managementMode?: ManagementMode | null;
  readonly lastSuccessfulInitializationAt?: Date | null;
  readonly lastSuccessfulCommunicationAt?: Date | null;
}

export class DeviceMonitoringService {
  constructor(
    private readonly repository: DeviceMonitoringRepository,
    private readonly devices: ManagedDeviceRepository,
    private readonly options: DeviceMonitoringServiceOptions,
  ) {}

  async ingest(input: MonitoringIngestionInput): Promise<'updated' | 'ignored'> {
    const device = await this.devices.findById(input.managedDeviceId);
    if (device === null || device.enrollmentStatus !== 'ACTIVE' || device.operationalStatus !== 'ACTIVE') {
      throw new AppError(403, 'DEVICE_AUTHORIZATION_DENIED', 'Managed-device monitoring is not authorized.');
    }
    if (input.observedAt.getTime() > input.now.getTime() + this.options.maxFutureSkewSeconds * 1000) {
      throw new AppError(400, 'INVALID_MONITORING_TIMESTAMP', 'Monitoring timestamp is too far in the future.');
    }
    if (Number.isNaN(input.observedAt.getTime()) || input.observedAt.getTime() < 0) {
      throw new AppError(400, 'INVALID_MONITORING_TIMESTAMP', 'Monitoring timestamp is invalid.');
    }
    const snapshot: DeviceMonitoringSnapshot = {
      managedDeviceId: input.managedDeviceId,
      schemaVersion: input.schemaVersion,
      observedAt: input.observedAt,
      receivedAt: input.now,
      androidVersion: input.androidVersion,
      apiLevel: input.apiLevel,
      appVersion: input.appVersion,
      appVersionCode: input.appVersionCode,
      batteryPercentage: input.batteryPercentage,
      batteryChargingState: input.batteryChargingState,
      batteryStatus: input.batteryStatus,
      networkState: input.networkState,
      storageTotalBytes: input.storageTotalBytes,
      storageAvailableBytes: input.storageAvailableBytes,
      storageUsedBytes: input.storageUsedBytes,
      memoryTotalBytes: input.memoryTotalBytes,
      memoryAvailableBytes: input.memoryAvailableBytes,
      memoryLow: input.memoryLow,
      managementMode: input.managementMode,
      lastSuccessfulInitializationAt: input.lastSuccessfulInitializationAt,
      lastSuccessfulCommunicationAt: input.lastSuccessfulCommunicationAt,
    };
    return this.repository.upsertIfNewer(snapshot);
  }

  async listForAdmin(adminId: string, page?: { limit?: number; cursor?: string | null }) {
    try {
      const result = await this.repository.listForAdmin(adminId, page);
      return { ...result, items: result.items.map(item => ({ ...item, freshness: this.freshness(item.state, item.enrollmentStatus, item.operationalStatus, item.communicationState, new Date()) })) };
    } catch (error) {
      if (error instanceof PersistenceError && error.code === 'INVALID_STATE') {
        throw new AppError(400, 'INVALID_REQUEST', 'Invalid device page cursor.');
      }
      throw error;
    }
  }

  async getForAdmin(adminId: string, managedDeviceId: string) {
    const item = await this.repository.findForAdmin(adminId, managedDeviceId);
    if (item === null) throw new AppError(404, 'DEVICE_NOT_FOUND', 'Managed device was not found.');
    return { ...item, freshness: this.freshness(item.state, item.enrollmentStatus, item.operationalStatus, item.communicationState, new Date()) };
  }

  private freshness(state: DeviceMonitoringState | null, enrollmentStatus: string, operationalStatus: string, communicationState: string | null, now: Date) {
    return getMonitoringFreshness(
      { enrollmentStatus, operationalStatus, sessionState: communicationState, observedAt: state?.observedAt ?? null },
      { staleSeconds: this.options.staleSeconds, veryStaleSeconds: this.options.veryStaleSeconds },
      now,
    );
  }
}
