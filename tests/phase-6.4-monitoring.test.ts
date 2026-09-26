import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DeviceMonitoringSnapshot } from '../src/domain/device-monitoring.js';
import type { ManagedDevice } from '../src/domain/managed-device.js';
import type { DeviceMonitoringRepository } from '../src/repositories/device-monitoring-repository.js';
import type { DeviceConnectionSessionRepository } from '../src/repositories/device-connection-session-repository.js';
import type { DeviceConnectionSession } from '../src/domain/device-connection-session.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import { DeviceMonitoringService } from '../src/services/device-monitoring-service.js';

const adminId = randomUUID();
const deviceId = randomUUID();

const device: ManagedDevice = {
  id: deviceId,
  adminId,
  stableIdentifier: 'managed-monitoring-test',
  name: 'Monitoring Test',
  platform: 'android',
  enrollmentStatus: 'ACTIVE',
  operationalStatus: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSeenAt: null,
};

class FakeDevices implements ManagedDeviceRepository {
  readonly name = 'fake-devices';
  async create(): Promise<ManagedDevice> {
    return device;
  }
  async findById(): Promise<ManagedDevice | null> {
    return device;
  }
  async findByStableIdentifier(): Promise<ManagedDevice | null> {
    return device;
  }
  async list() {
    return { items: [device], nextCursor: null };
  }
  async listByAdminId() {
    return { items: [device], nextCursor: null };
  }
  async updateStatus(): Promise<ManagedDevice | null> {
    return device;
  }
}

class FakeSessions implements DeviceConnectionSessionRepository {
  readonly name = 'fake-sessions';
  session: DeviceConnectionSession | null = {
    id: randomUUID(),
    managedDeviceId: deviceId,
    state: 'CONNECTED',
    createdAt: new Date(),
    connectedAt: new Date(),
    lastActivityAt: new Date(),
    disconnectedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
    revokedAt: null,
  };
  async create(): Promise<DeviceConnectionSession> {
    return this.session!;
  }
  async findByTokenHash(): Promise<DeviceConnectionSession | null> {
    return this.session;
  }
  async findById(): Promise<DeviceConnectionSession | null> {
    return this.session;
  }
  async findActiveByDeviceId(): Promise<DeviceConnectionSession | null> {
    return this.session;
  }
  async touchConnected(): Promise<DeviceConnectionSession | null> {
    return this.session;
  }
  async disconnect(): Promise<DeviceConnectionSession | null> {
    return this.session;
  }
  async revokeForDevice(): Promise<void> {}
}

class FakeMonitoring implements DeviceMonitoringRepository {
  readonly name = 'fake-monitoring';
  snapshot: DeviceMonitoringSnapshot | null = null;
  async upsert(snapshot: DeviceMonitoringSnapshot) {
    if (
      this.snapshot !== null &&
      this.snapshot.deviceCollectedAt > snapshot.deviceCollectedAt
    ) {
      return { snapshot: this.snapshot, updated: false };
    }
    this.snapshot = snapshot;
    return { snapshot, updated: true };
  }
  async findByDeviceId(): Promise<DeviceMonitoringSnapshot | null> {
    return this.snapshot;
  }
  async listForAdmin() {
    return { items: [], nextCursor: null };
  }
}

const input = (overrides: Record<string, unknown> = {}) => ({
  managedDeviceId: deviceId,
  schemaVersion: 1,
  deviceCollectedAtEpochMillis: Date.now() - 1_000,
  androidVersion: '15',
  apiLevel: 35,
  appVersion: '1.0.0',
  appVersionCode: 1,
  managementMode: 'DEVICE_OWNER' as const,
  batteryPercentage: 85,
  chargingState: 'CHARGING' as const,
  batteryStatus: 'NORMAL' as const,
  networkState: 'WIFI' as const,
  storageTotalBytes: 1000,
  storageAvailableBytes: 700,
  storageUsedBytes: 300,
  memoryTotalBytes: 2000,
  memoryAvailableBytes: 1000,
  memoryLow: false,
  lastSuccessfulInitializationEpochMillis: null,
  lastSuccessfulCommunicationEpochMillis: Date.now() - 2_000,
  lastMonitoringUpdateEpochMillis: Date.now() - 1_000,
  ...overrides,
});

const createService = (repository: DeviceMonitoringRepository) =>
  new DeviceMonitoringService(
    repository,
    new FakeDevices(),
    new FakeSessions(),
    { freshnessFreshMs: 300_000, freshnessStaleMs: 1_800_000 },
  );

describe('Phase 6.4 monitoring', () => {
  it('accepts the Phase 6.3 monitoring contract and records server receipt time', async () => {
    const repository = new FakeMonitoring();
    const service = createService(repository);
    const result = await service.ingest(deviceId, input());
    expect(result.updated).toBe(true);
    expect(result.snapshot.managedDeviceId).toBe(deviceId);
    expect(result.snapshot.serverReceivedAt.getTime()).toBeGreaterThan(0);
  });

  it('rejects a device identity mismatch', async () => {
    const service = createService(new FakeMonitoring());
    await expect(
      service.ingest(deviceId, input({ managedDeviceId: randomUUID() })),
    ).rejects.toMatchObject({ statusCode: 403, code: 'AUTHORIZATION_DENIED' });
  });

  it('rejects invalid battery values', async () => {
    const service = createService(new FakeMonitoring());
    await expect(
      service.ingest(deviceId, input({ batteryPercentage: 101 })),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_MONITORING_PAYLOAD',
    });
  });

  it('does not allow an older snapshot to replace newer state', async () => {
    const repository = new FakeMonitoring();
    const service = createService(repository);
    await service.ingest(deviceId, input());
    const older = Date.now() - 60_000;
    const result = await service.ingest(
      deviceId,
      input({
        deviceCollectedAtEpochMillis: older,
        lastMonitoringUpdateEpochMillis: older,
      }),
    );
    expect(result.updated).toBe(false);
  });
});
