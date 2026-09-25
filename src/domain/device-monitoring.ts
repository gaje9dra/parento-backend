export type ManagementMode =
  | 'UNMANAGED'
  | 'PROFILE_OWNER'
  | 'DEVICE_OWNER'
  | 'UNKNOWN';

export type NetworkState = 'UNKNOWN' | 'OFFLINE' | 'WIFI' | 'CELLULAR' | 'OTHER';

export type BatteryChargingState =
  | 'CHARGING'
  | 'DISCHARGING'
  | 'FULL'
  | 'NOT_CHARGING'
  | 'UNKNOWN';

export type BatteryStatus = 'NORMAL' | 'LOW' | 'CRITICAL' | 'FULL' | 'UNKNOWN';

export type MonitoringFreshness =
  | 'FRESH'
  | 'STALE'
  | 'VERY_STALE'
  | 'NEVER_REPORTED'
  | 'OFFLINE'
  | 'REVOKED'
  | 'UNKNOWN';

export interface DeviceMonitoringSnapshot {
  readonly managedDeviceId: string;
  readonly schemaVersion: number;
  readonly observedAt: Date;
  readonly receivedAt: Date;
  readonly androidVersion: string | null | undefined;
  readonly apiLevel: number | null | undefined;
  readonly appVersion: string | null | undefined;
  readonly appVersionCode: number | null | undefined;
  readonly batteryPercentage: number | null | undefined;
  readonly batteryChargingState: BatteryChargingState | null | undefined;
  readonly batteryStatus: BatteryStatus | null | undefined;
  readonly networkState: NetworkState | null | undefined;
  readonly storageTotalBytes: number | null | undefined;
  readonly storageAvailableBytes: number | null | undefined;
  readonly storageUsedBytes: number | null | undefined;
  readonly memoryTotalBytes: number | null | undefined;
  readonly memoryAvailableBytes: number | null | undefined;
  readonly memoryLow: boolean | null | undefined;
  readonly managementMode: ManagementMode | null | undefined;
  readonly lastSuccessfulInitializationAt: Date | null | undefined;
  readonly lastSuccessfulCommunicationAt: Date | null | undefined;
}

export interface DeviceMonitoringState extends DeviceMonitoringSnapshot {
  readonly freshness: MonitoringFreshness;
  readonly lastSeenAt: Date | null;
}

export const getMonitoringFreshness = (
  input: {
    enrollmentStatus: string;
    operationalStatus: string;
    sessionState: string | null;
    observedAt: Date | null;
  },
  thresholds: { staleSeconds: number; veryStaleSeconds: number },
  now: Date,
): MonitoringFreshness => {
  if (input.enrollmentStatus === 'REVOKED' || input.operationalStatus === 'REVOKED') {
    return 'REVOKED';
  }
  if (input.observedAt === null) return 'NEVER_REPORTED';
  if (input.sessionState === 'DISCONNECTED' || input.sessionState === 'EXPIRED') {
    return 'OFFLINE';
  }
  const ageSeconds = Math.max(0, now.getTime() - input.observedAt.getTime()) / 1000;
  if (ageSeconds >= thresholds.veryStaleSeconds) return 'VERY_STALE';
  if (ageSeconds >= thresholds.staleSeconds) return 'STALE';
  if (input.sessionState === null) return 'UNKNOWN';
  return 'FRESH';
};
