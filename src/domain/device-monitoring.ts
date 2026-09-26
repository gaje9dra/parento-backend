export type MonitoringManagementMode =
  'NOT_MANAGED' | 'PROFILE_OWNER' | 'DEVICE_OWNER' | 'UNKNOWN';
export type MonitoringChargingState =
  'CHARGING' | 'DISCHARGING' | 'FULL' | 'NOT_CHARGING' | 'UNKNOWN';
export type MonitoringBatteryStatus =
  'NORMAL' | 'LOW' | 'CRITICAL' | 'FULL' | 'UNKNOWN';
export type MonitoringNetworkState =
  'UNKNOWN' | 'OFFLINE' | 'WIFI' | 'CELLULAR' | 'OTHER';

export interface DeviceMonitoringSnapshot {
  readonly managedDeviceId: string;
  readonly schemaVersion: number;
  readonly deviceCollectedAt: Date;
  readonly serverReceivedAt: Date;
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
  readonly lastSuccessfulInitializationAt: Date | null;
  readonly lastSuccessfulCommunicationAt: Date | null;
  readonly lastMonitoringUpdateAt: Date;
}
