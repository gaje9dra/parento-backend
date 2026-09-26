import { AppError } from '../types/errors.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { DeviceMonitoringRepository } from '../repositories/device-monitoring-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type {
  BatteryChargingState,
  BatteryStatus,
  DeviceMonitoringSnapshot,
  ManagementMode,
  NetworkState,
  DeviceMonitoringState,
} from '../domain/device-monitoring.js';
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
  readonly androidVersion?: string | null | undefined;
  readonly apiLevel?: number | null | undefined;
  readonly appVersion?: string | null | undefined;
  readonly appVersionCode?: number | null | undefined;
  readonly batteryPercentage?: number | null | undefined;
  readonly batteryChargingState?: BatteryChargingState | null | undefined;
  readonly batteryStatus?: BatteryStatus | null | undefined;
  readonly networkState?: NetworkState | null | undefined;
  readonly storageTotalBytes?: number | null | undefined;
  readonly storageAvailableBytes?: number | null | undefined;
  readonly storageUsedBytes?: number | null | undefined;
  readonly memoryTotalBytes?: number | null | undefined;
  readonly memoryAvailableBytes?: number | null | undefined;
  readonly memoryLow?: boolean | null | undefined;
  readonly managementMode?: ManagementMode | null | undefined;
  readonly lastSuccessfulInitializationAt?: Date | null | undefined;
  readonly lastSuccessfulCommunicationAt?: Date | null | undefined;
}

export class DeviceMonitoringService {
  constructor(
    private readonly repository: DeviceMonitoringRepository,
    private readonly devices: ManagedDeviceRepository,
    private readonly options: DeviceMonitoringServiceOptions,
  ) {}

  async ingest(
    input: MonitoringIngestionInput,
  ): Promise<'updated' | 'ignored'> {
    const device = await this.devices.findById(input.managedDeviceId);
    if (
      device === null ||
      device.enrollmentStatus !== 'ACTIVE' ||
      device.operationalStatus !== 'ACTIVE'
    ) {
      throw new AppError(
        403,
        'DEVICE_AUTHORIZATION_DENIED',
        'Managed-device monitoring is not authorized.',
      );
    }
    if (
      input.observedAt.getTime() >
      input.now.getTime() + this.options.maxFutureSkewSeconds * 1000
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_TIMESTAMP',
        'Monitoring timestamp is too far in the future.',
      );
    }
    if (
      Number.isNaN(input.observedAt.getTime()) ||
      input.observedAt.getTime() < 0
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_TIMESTAMP',
        'Monitoring timestamp is invalid.',
      );
    }
    const snapshot: DeviceMonitoringSnapshot = {
      managedDeviceId: input.managedDeviceId,
      schemaVersion: input.schemaVersion,
      observedAt: input.observedAt,
      receivedAt: input.now,
      androidVersion: input.androidVersion ?? null,
      apiLevel: input.apiLevel ?? null,
      appVersion: input.appVersion ?? null,
      appVersionCode: input.appVersionCode ?? null,
      batteryPercentage: input.batteryPercentage ?? null,
      batteryChargingState: input.batteryChargingState ?? null,
      batteryStatus: input.batteryStatus ?? null,
      networkState: input.networkState ?? null,
      storageTotalBytes: input.storageTotalBytes ?? null,
      storageAvailableBytes: input.storageAvailableBytes ?? null,
      storageUsedBytes: input.storageUsedBytes ?? null,
      memoryTotalBytes: input.memoryTotalBytes ?? null,
      memoryAvailableBytes: input.memoryAvailableBytes ?? null,
      memoryLow: input.memoryLow ?? null,
      managementMode: input.managementMode ?? null,
      lastSuccessfulInitializationAt:
        input.lastSuccessfulInitializationAt ?? null,
      lastSuccessfulCommunicationAt:
        input.lastSuccessfulCommunicationAt ?? null,
    };
    return this.repository.upsertIfNewer(snapshot);
  }

  async listForAdmin(
    adminId: string,
    page?: { limit?: number | undefined; cursor?: string | null | undefined },
  ) {
    try {
      const result = await this.repository.listForAdmin(adminId, page);
      return {
        ...result,
        items: result.items.map((item) => ({
          ...item,
          freshness: this.freshness(
            item.state,
            item.enrollmentStatus,
            item.operationalStatus,
            item.communicationState,
            new Date(),
          ),
        })),
      };
    } catch (error) {
      if (error instanceof PersistenceError && error.code === 'INVALID_STATE') {
        throw new AppError(
          400,
          'INVALID_REQUEST',
          'Invalid device page cursor.',
        );
      }
      throw error;
    }
  }

  async getForAdmin(adminId: string, managedDeviceId: string) {
    const item = await this.repository.findForAdmin(adminId, managedDeviceId);
    if (item === null)
      throw new AppError(
        404,
        'DEVICE_NOT_FOUND',
        'Managed device was not found.',
      );
    return {
      ...item,
      freshness: this.freshness(
        item.state,
        item.enrollmentStatus,
        item.operationalStatus,
        item.communicationState,
        new Date(),
      ),
    };
  }

  private freshness(
    state: DeviceMonitoringState | null,
    enrollmentStatus: string,
    operationalStatus: string,
    communicationState: string | null,
    now: Date,
  ) {
    return getMonitoringFreshness(
      {
        enrollmentStatus,
        operationalStatus,
        sessionState: communicationState,
        observedAt: state?.observedAt ?? null,
      },
      {
        staleSeconds: this.options.staleSeconds,
        veryStaleSeconds: this.options.veryStaleSeconds,
      },
      now,
    );
  }
}
