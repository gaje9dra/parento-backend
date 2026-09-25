import type {
  DeviceMonitoringSnapshot,
  MonitoringBatteryStatus,
  MonitoringChargingState,
  MonitoringManagementMode,
  MonitoringNetworkState,
} from '../domain/device-monitoring.js';
import type { DeviceMonitoringRepository } from '../repositories/device-monitoring-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';
import {
  classifyMonitoringFreshness,
  monitoringFreshnessAgeMs,
  type MonitoringFreshness,
} from '../domain/device-monitoring-freshness.js';
import { AppError } from '../types/errors.js';

export interface DeviceMonitoringServiceOptions {
  readonly freshnessFreshMs: number;
  readonly freshnessStaleMs: number;
}

export interface AdminDeviceMonitoringStatus {
  readonly device: import('../domain/managed-device.js').ManagedDevice;
  readonly connection: {
    readonly state: string;
    readonly session: DeviceConnectionSession | null;
  };
  readonly monitoring: {
    readonly freshness: MonitoringFreshness;
    readonly ageMs: number | null;
    readonly snapshot: DeviceMonitoringSnapshot | null;
  };
}

export interface DeviceMonitoringInput {
  readonly managedDeviceId: string;
  readonly schemaVersion: number;
  readonly deviceCollectedAtEpochMillis: number;
  readonly androidVersion: string;
  readonly apiLevel: number;
  readonly appVersion: string;
  readonly appVersionCode: number;
  readonly managementMode: MonitoringManagementMode;
  readonly batteryPercentage: number | null;
  readonly chargingState: MonitoringChargingState;
  readonly batteryStatus: MonitoringBatteryStatus;
  readonly networkState: MonitoringNetworkState;
  readonly storageTotalBytes: number | null;
  readonly storageAvailableBytes: number | null;
  readonly storageUsedBytes: number | null;
  readonly memoryTotalBytes: number | null;
  readonly memoryAvailableBytes: number | null;
  readonly memoryLow: boolean | null;
  readonly lastSuccessfulInitializationEpochMillis: number | null;
  readonly lastSuccessfulCommunicationEpochMillis: number | null;
  readonly lastMonitoringUpdateEpochMillis: number;
}

const enumValues = {
  managementMode: new Set<MonitoringManagementMode>([
    'NOT_MANAGED',
    'PROFILE_OWNER',
    'DEVICE_OWNER',
    'UNKNOWN',
  ]),
  chargingState: new Set<MonitoringChargingState>([
    'CHARGING',
    'DISCHARGING',
    'FULL',
    'NOT_CHARGING',
    'UNKNOWN',
  ]),
  batteryStatus: new Set<MonitoringBatteryStatus>([
    'NORMAL',
    'LOW',
    'CRITICAL',
    'FULL',
    'UNKNOWN',
  ]),
  networkState: new Set<MonitoringNetworkState>([
    'UNKNOWN',
    'OFFLINE',
    'WIFI',
    'CELLULAR',
    'OTHER',
  ]),
};

const validateTimestamp = (
  value: number | null,
  field: string,
  now: number,
): void => {
  if (value === null) return;
  if (!Number.isSafeInteger(value) || value <= 0 || value > now + 5 * 60_000) {
    throw new AppError(
      400,
      'INVALID_MONITORING_PAYLOAD',
      field + ' is invalid.',
    );
  }
};

const validateNonNegative = (value: number | null, field: string): void => {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new AppError(
      400,
      'INVALID_MONITORING_PAYLOAD',
      field + ' must be a non-negative integer or null.',
    );
  }
};

export class DeviceMonitoringService {
  constructor(
    private readonly repository: DeviceMonitoringRepository,
    private readonly devices: ManagedDeviceRepository,
    private readonly sessions: DeviceConnectionSessionRepository,
    private readonly options: DeviceMonitoringServiceOptions,
  ) {}

  async ingest(
    sessionDeviceId: string,
    input: DeviceMonitoringInput,
    sessionContext?: { readonly id: string; readonly expiresAt: Date },
  ): Promise<{ snapshot: DeviceMonitoringSnapshot; updated: boolean }> {
    if (input.managedDeviceId !== sessionDeviceId) {
      throw new AppError(
        403,
        'AUTHORIZATION_DENIED',
        'Monitoring data does not belong to the authenticated device.',
      );
    }
    if (input.schemaVersion !== 1) {
      throw new AppError(
        400,
        'UNSUPPORTED_MONITORING_SCHEMA',
        'Monitoring schema version is not supported.',
      );
    }

    const now = Date.now();
    validateTimestamp(
      input.deviceCollectedAtEpochMillis,
      'deviceCollectedAtEpochMillis',
      now,
    );
    validateTimestamp(
      input.lastMonitoringUpdateEpochMillis,
      'lastMonitoringUpdateEpochMillis',
      now,
    );
    validateTimestamp(
      input.lastSuccessfulInitializationEpochMillis,
      'lastSuccessfulInitializationEpochMillis',
      now,
    );
    validateTimestamp(
      input.lastSuccessfulCommunicationEpochMillis,
      'lastSuccessfulCommunicationEpochMillis',
      now,
    );

    if (
      input.lastMonitoringUpdateEpochMillis < input.deviceCollectedAtEpochMillis
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'Monitoring update time cannot precede collection time.',
      );
    }
    if (
      input.batteryPercentage !== null &&
      (!Number.isInteger(input.batteryPercentage) ||
        input.batteryPercentage < 0 ||
        input.batteryPercentage > 100)
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'Battery percentage must be between 0 and 100.',
      );
    }
    if (
      !enumValues.managementMode.has(input.managementMode) ||
      !enumValues.chargingState.has(input.chargingState) ||
      !enumValues.batteryStatus.has(input.batteryStatus) ||
      !enumValues.networkState.has(input.networkState)
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'Monitoring enum value is invalid.',
      );
    }
    if (
      !Number.isInteger(input.apiLevel) ||
      input.apiLevel < 1 ||
      input.apiLevel > 1000
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'API level is invalid.',
      );
    }
    if (
      !Number.isSafeInteger(input.appVersionCode) ||
      input.appVersionCode < 0
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'Application version code is invalid.',
      );
    }
    if (
      input.androidVersion.length === 0 ||
      input.androidVersion.length > 64 ||
      input.appVersion.length === 0 ||
      input.appVersion.length > 64
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'Application/platform version is invalid.',
      );
    }

    validateNonNegative(input.storageTotalBytes, 'storageTotalBytes');
    validateNonNegative(input.storageAvailableBytes, 'storageAvailableBytes');
    validateNonNegative(input.storageUsedBytes, 'storageUsedBytes');
    validateNonNegative(input.memoryTotalBytes, 'memoryTotalBytes');
    validateNonNegative(input.memoryAvailableBytes, 'memoryAvailableBytes');

    if (
      input.storageTotalBytes !== null &&
      input.storageAvailableBytes !== null &&
      input.storageAvailableBytes > input.storageTotalBytes
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'Available storage cannot exceed total storage.',
      );
    }
    if (
      input.storageTotalBytes !== null &&
      input.storageUsedBytes !== null &&
      input.storageUsedBytes > input.storageTotalBytes
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'Used storage cannot exceed total storage.',
      );
    }
    if (
      input.memoryTotalBytes !== null &&
      input.memoryAvailableBytes !== null &&
      input.memoryAvailableBytes > input.memoryTotalBytes
    ) {
      throw new AppError(
        400,
        'INVALID_MONITORING_PAYLOAD',
        'Available memory cannot exceed total memory.',
      );
    }

    const device = await this.devices.findById(sessionDeviceId);
    if (device === null) {
      throw new AppError(
        404,
        'DEVICE_NOT_FOUND',
        'Managed device was not found.',
      );
    }
    if (
      device.enrollmentStatus !== 'ACTIVE' ||
      device.operationalStatus !== 'ACTIVE'
    ) {
      throw new AppError(
        403,
        'DEVICE_AUTHORIZATION_DENIED',
        'Managed-device monitoring is not authorized.',
      );
    }

    const result = await this.repository.upsert({
      managedDeviceId: sessionDeviceId,
      schemaVersion: input.schemaVersion,
      deviceCollectedAt: new Date(input.deviceCollectedAtEpochMillis),
      serverReceivedAt: new Date(now),
      androidVersion: input.androidVersion,
      apiLevel: input.apiLevel,
      appVersion: input.appVersion,
      appVersionCode: input.appVersionCode,
      managementMode: input.managementMode,
      batteryPercentage: input.batteryPercentage,
      chargingState: input.chargingState,
      batteryStatus: input.batteryStatus,
      networkState: input.networkState,
      storageTotalBytes: input.storageTotalBytes,
      storageAvailableBytes: input.storageAvailableBytes,
      storageUsedBytes: input.storageUsedBytes,
      memoryTotalBytes: input.memoryTotalBytes,
      memoryAvailableBytes: input.memoryAvailableBytes,
      memoryLow: input.memoryLow,
      lastSuccessfulInitializationAt:
        input.lastSuccessfulInitializationEpochMillis === null
          ? null
          : new Date(input.lastSuccessfulInitializationEpochMillis),
      lastSuccessfulCommunicationAt:
        input.lastSuccessfulCommunicationEpochMillis === null
          ? null
          : new Date(input.lastSuccessfulCommunicationEpochMillis),
      lastMonitoringUpdateAt: new Date(input.lastMonitoringUpdateEpochMillis),
    });
    if (sessionContext !== undefined) {
      await this.sessions.touchConnected(
        sessionContext.id,
        new Date(now),
        sessionContext.expiresAt,
      );
    }
    await this.devices.touchLastSeen?.(sessionDeviceId, new Date(now));
    return result;
  }

  async getForAdmin(
    adminId: string,
    deviceId: string,
  ): Promise<DeviceMonitoringSnapshot | null> {
    await this.authorizeDevice(adminId, deviceId);
    return this.repository.findByDeviceId(deviceId);
  }

  async getStatusForAdmin(
    adminId: string,
    deviceId: string,
    now = new Date(),
  ): Promise<AdminDeviceMonitoringStatus> {
    const device = await this.authorizeDevice(adminId, deviceId);
    const [snapshot, session] = await Promise.all([
      this.repository.findByDeviceId(deviceId),
      this.sessions.findLatestByDeviceId?.(deviceId) ??
        this.sessions.findActiveByDeviceId?.(deviceId) ??
        Promise.resolve(null),
    ]);
    const communicationState =
      session === null
        ? null
        : session.expiresAt.getTime() <= now.getTime()
          ? 'EXPIRED'
          : session.state;

    return {
      device,
      connection: {
        state: communicationState ?? 'DISCONNECTED',
        session,
      },
      monitoring: {
        freshness: classifyMonitoringFreshness(
          snapshot,
          {
            enrollmentStatus: device.enrollmentStatus,
            operationalStatus: device.operationalStatus,
            communicationState,
            now,
          },
          {
            freshMs: this.options.freshnessFreshMs,
            staleMs: this.options.freshnessStaleMs,
          },
        ),
        ageMs: monitoringFreshnessAgeMs(snapshot, now),
        snapshot,
      },
    };
  }

  async listForAdmin(
    adminId: string,
    page: import('../repositories/device-monitoring-repository.js').MonitoringDevicePageRequest,
    now = new Date(),
  ) {
    const result = await this.repository.listForAdmin(adminId, page, now, {
      freshMs: this.options.freshnessFreshMs,
      staleMs: this.options.freshnessStaleMs,
    });
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        freshness: classifyMonitoringFreshness(
          item.snapshot,
          {
            enrollmentStatus: item.device.enrollmentStatus,
            operationalStatus: item.device.operationalStatus,
            communicationState: item.session?.state ?? null,
            now,
          },
          {
            freshMs: this.options.freshnessFreshMs,
            staleMs: this.options.freshnessStaleMs,
          },
        ),
        ageMs: monitoringFreshnessAgeMs(item.snapshot, now),
      })),
    };
  }

  private async authorizeDevice(
    adminId: string,
    deviceId: string,
  ): Promise<import('../domain/managed-device.js').ManagedDevice> {
    const device = await this.devices.findById(deviceId);
    if (device === null) {
      throw new AppError(
        404,
        'DEVICE_NOT_FOUND',
        'Managed device was not found.',
      );
    }
    if (device.adminId !== adminId) {
      throw new AppError(
        403,
        'AUTHORIZATION_DENIED',
        'The administrator does not control this device.',
      );
    }
    return device;
  }
}
