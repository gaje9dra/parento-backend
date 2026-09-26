import { describe, expect, it } from 'vitest';
import {
  classifyMonitoringFreshness,
  monitoringFreshnessAgeMs,
  validateMonitoringFreshnessThresholds,
} from '../src/domain/device-monitoring-freshness.js';
import type { DeviceMonitoringSnapshot } from '../src/domain/device-monitoring.js';

const now = new Date('2026-09-25T12:00:00.000Z');

const snapshot = (receivedAt: string): DeviceMonitoringSnapshot => ({
  managedDeviceId: '00000000-0000-0000-0000-000000000001',
  schemaVersion: 1,
  deviceCollectedAt: new Date(receivedAt),
  serverReceivedAt: new Date(receivedAt),
  androidVersion: '15',
  apiLevel: 35,
  appVersion: '1.0.0',
  appVersionCode: 1,
  managementMode: 'DEVICE_OWNER',
  batteryPercentage: 80,
  chargingState: 'CHARGING',
  batteryStatus: 'NORMAL',
  networkState: 'WIFI',
  storageTotalBytes: 1000,
  storageAvailableBytes: 500,
  storageUsedBytes: 500,
  memoryTotalBytes: 2000,
  memoryAvailableBytes: 1000,
  memoryLow: false,
  lastSuccessfulInitializationAt: null,
  lastSuccessfulCommunicationAt: new Date(receivedAt),
  lastMonitoringUpdateAt: new Date(receivedAt),
});

const thresholds = { freshMs: 300_000, staleMs: 1_800_000 };

describe('Phase 7.1 monitoring freshness', () => {
  it('distinguishes fresh, stale and very stale telemetry', () => {
    expect(
      classifyMonitoringFreshness(
        snapshot('2026-09-25T11:56:00.000Z'),
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          communicationState: 'CONNECTED',
          now,
        },
        thresholds,
      ),
    ).toBe('FRESH');

    expect(
      classifyMonitoringFreshness(
        snapshot('2026-09-25T11:50:00.000Z'),
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          communicationState: 'CONNECTED',
          now,
        },
        thresholds,
      ),
    ).toBe('STALE');

    expect(
      classifyMonitoringFreshness(
        snapshot('2026-09-25T11:20:00.000Z'),
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          communicationState: 'CONNECTED',
          now,
        },
        thresholds,
      ),
    ).toBe('VERY_STALE');
  });

  it('distinguishes never-reported, disconnected and revoked devices', () => {
    expect(
      classifyMonitoringFreshness(
        null,
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          communicationState: 'CONNECTED',
          now,
        },
        thresholds,
      ),
    ).toBe('NEVER_REPORTED');

    expect(
      classifyMonitoringFreshness(
        snapshot('2026-09-25T11:59:00.000Z'),
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          communicationState: null,
          now,
        },
        thresholds,
      ),
    ).toBe('DISCONNECTED');

    expect(
      classifyMonitoringFreshness(
        snapshot('2026-09-25T11:59:00.000Z'),
        {
          enrollmentStatus: 'REVOKED',
          operationalStatus: 'REVOKED',
          communicationState: null,
          now,
        },
        thresholds,
      ),
    ).toBe('REVOKED');
  });

  it('uses server receipt time for freshness age', () => {
    expect(
      monitoringFreshnessAgeMs(snapshot('2026-09-25T11:55:00.000Z'), now),
    ).toBe(300_000);
  });

  it('rejects invalid threshold ordering', () => {
    expect(() =>
      validateMonitoringFreshnessThresholds({ freshMs: 10, staleMs: 10 }),
    ).toThrow();
  });
});
