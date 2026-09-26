import type { DeviceMonitoringSnapshot } from './device-monitoring.js';
import type { ManagedDeviceStatus } from './managed-device.js';
import type { DeviceConnectionState } from './device-connection-session.js';

export type MonitoringFreshness =
  | 'FRESH'
  | 'STALE'
  | 'VERY_STALE'
  | 'NEVER_REPORTED'
  | 'DISCONNECTED'
  | 'REVOKED';

export interface MonitoringFreshnessThresholds {
  readonly freshMs: number;
  readonly staleMs: number;
}

export const classifyMonitoringFreshness = (
  snapshot: DeviceMonitoringSnapshot | null,
  input: {
    readonly enrollmentStatus: ManagedDeviceStatus;
    readonly operationalStatus: ManagedDeviceStatus;
    readonly communicationState: DeviceConnectionState | null;
    readonly now: Date;
  },
  thresholds: MonitoringFreshnessThresholds,
): MonitoringFreshness => {
  if (
    input.enrollmentStatus === 'REVOKED' ||
    input.operationalStatus === 'REVOKED'
  ) {
    return 'REVOKED';
  }

  if (
    input.communicationState === null ||
    input.communicationState === 'DISCONNECTED' ||
    input.communicationState === 'EXPIRED'
  ) {
    return 'DISCONNECTED';
  }

  if (snapshot === null) return 'NEVER_REPORTED';

  const ageMs = Math.max(
    0,
    input.now.getTime() - snapshot.serverReceivedAt.getTime(),
  );

  if (ageMs <= thresholds.freshMs) return 'FRESH';
  if (ageMs <= thresholds.staleMs) return 'STALE';
  return 'VERY_STALE';
};

export const monitoringFreshnessAgeMs = (
  snapshot: DeviceMonitoringSnapshot | null,
  now: Date,
): number | null =>
  snapshot === null
    ? null
    : Math.max(0, now.getTime() - snapshot.serverReceivedAt.getTime());

export const validateMonitoringFreshnessThresholds = (
  thresholds: MonitoringFreshnessThresholds,
): void => {
  if (
    !Number.isSafeInteger(thresholds.freshMs) ||
    !Number.isSafeInteger(thresholds.staleMs) ||
    thresholds.freshMs <= 0 ||
    thresholds.staleMs <= thresholds.freshMs
  ) {
    throw new Error(
      'Monitoring freshness thresholds must be positive and staleMs must exceed freshMs.',
    );
  }
};
