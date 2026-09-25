import { AppError } from '../types/errors.js';
import type { DeviceMonitoringRepository } from '../repositories/device-monitoring-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';
import type {
  BatteryChargingState,
  BatteryStatus,
  DeviceMonitoringSnapshot,
  DeviceMonitoringState,
  ManagementMode,
  NetworkState,
} from '../domain/device-monitoring.js';
import { getMonitoringFreshness } from '../domain/device-monitoring.js';

export interface DeviceMonitoringServiceOptions {
  readonly staleSeconds: number;
  readonly veryStaleSeconds: number;
  readonly maxFutureSkewSeconds: number;
  readonly maxTelemetryPayloadBytes: number;
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
    private readonly sessions: DeviceConnectionSessionRepository,
    private readonly options: DeviceMonitoringServiceOptions,
  ) {}

  async ingest(input: MonitoringIngestionInput): Promise<'updated' | 'ignored'> {
    const device = await this.devices.findById(input.managedDeviceId);
    if (
      device === null ||
      device.enrollmentStatus !== 'ACTIVE' ||
      device.operationalStatus !== 'ACTIVE'
    ) {
      throw new AppError(403, 'DEVICE_AUTHORIZATION_DENIED', 'Managed-device monitoring is not authorized.');
    }

    const futureLimit = input.now.getTime() + this.options.maxFutureSkewSeconds * 1000;
    if (input.observedAt.getTime() > futureLimit) {
      throw new AppError(400, 'INVALID_MONITORING_TIMESTAMP', 'Monitoring timestamp is too far in the future.');
    }

    if (input.observedAt.getTime() < 0) {
      throw new AppError(400, 'INVALID_MONITORING_TIMESTAMP', 'Monitoring timestamp is invalid.');
    }

    const snapshot: DeviceMonitoringSnapshot = {
      managedDeviceId: input.managedDeviceId,
      schemaVersion: input.schemaVersion,
      observedAt: input.observedAt,
      receivedAt: input.now,
      androidVersion: input.androidVersion ?? undefined as never,
      apiLevel: input.apiLevel ?? undefined as never,
      appVersion: input.appVersion ?? undefined as never,
      appVersionCode: input.appVersionCode ?? undefined as never,
      batteryPercentage: input.batteryPercentage ?? undefined as never,
      batteryChargingState: input.batteryChargingState ?? undefined as never,
      batteryStatus: input.batteryStatus ?? undefined as never,
      networkState: input.networkState ?? undefined as never,
      storageTotalBytes: input.storageTotalBytes ?? undefined as never,
      storageAvailableBytes: input.storageAvailableBytes ?? undefined as never,
      storageUsedBytes: input.storageUsedBytes ?? undefined as never,
      memoryTotalBytes: input.memoryTotalBytes ?? undefined as never,
      memoryAvailableBytes: input.memoryAvailableBytes ?? undefined as never,
      memoryLow: input.memoryLow ?? undefined as never,
      managementMode: input.managementMode ?? undefined as never,
      lastSuccessfulInitializationAt: input.lastSuccessfulInitializationAt ?? undefined as never,
      lastSuccessfulCommunicationAt: input.lastSuccessfulCommunicationAt ?? undefined as never,
    };
    return this.repository.upsertIfNewer(snapshot);
  }

  async listForAdmin(adminId: string, page?: { limit?: number; cursor?: string | null }) {
    return this.repository.listForAdmin(adminId, page);
  }

  async getForAdmin(adminId: string, managedDeviceId: string) {
    const item = await this.repository.findForAdmin(adminId, managedDeviceId);
    if (item === null) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', 'Managed device was not found.');
    }
    return item;
  }

  freshness(
    state: DeviceMonitoringState,
    enrollmentStatus: string,
    operationalStatus: string,
    communicationState: string | null,
    now: Date,
  ) {
    return getMonitoringFreshness(
      { enrollmentStatus, operationalStatus, sessionState: communicationState, observedAt: state.observedAt },
      { staleSeconds: this.options.staleSeconds, veryStaleSeconds: this.options.veryStaleSeconds },
      now,
    );
  }
}
