import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { resetMigrations, runMigrations } from '../src/db/migrate.js';
import { PostgresAdminRepository } from '../src/repositories/postgres-admin-repository.js';
import { PostgresManagedDeviceRepository } from '../src/repositories/postgres-managed-device-repository.js';
import { PostgresDeviceMonitoringRepository } from '../src/repositories/postgres-device-monitoring-repository.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('Phase 7 monitoring persistence integrity', () => {
  const database = createDatabase(loadConfig());
  const admins = new PostgresAdminRepository(database);
  const devices = new PostgresManagedDeviceRepository(database);
  const monitoring = new PostgresDeviceMonitoringRepository(database);

  beforeEach(async () => {
    await resetMigrations(database);
    await runMigrations(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('prevents older observations from rolling back current state', async () => {
    const admin = await admins.create({ id:randomUUID(), email:'monitor-owner@example.com', displayName:null });
    const device = await devices.create({ id:randomUUID(), adminId:admin.id, stableIdentifier:'monitor-device', name:'Monitor', platform:'android' });
    const t1 = new Date('2026-09-25T10:00:00.000Z');
    const t2 = new Date('2026-09-25T10:01:00.000Z');

    await expect(monitoring.upsertIfNewer({
      managedDeviceId:device.id, schemaVersion:1, observedAt:t1, receivedAt:new Date('2026-09-25T10:00:01.000Z'),
      batteryPercentage:20,
    })).resolves.toBe('updated');

    await expect(monitoring.upsertIfNewer({
      managedDeviceId:device.id, schemaVersion:1, observedAt:t2, receivedAt:new Date('2026-09-25T10:01:01.000Z'),
      batteryPercentage:40,
    })).resolves.toBe('updated');

    await expect(monitoring.upsertIfNewer({
      managedDeviceId:device.id, schemaVersion:1, observedAt:t1, receivedAt:new Date('2026-09-25T10:02:00.000Z'),
      batteryPercentage:10,
    })).resolves.toBe('ignored');

    const current=await monitoring.findCurrent(device.id);
    expect(current?.observedAt).toEqual(t2);
    expect(current?.batteryPercentage).toBe(40);
  });

  it('preserves omitted partial fields while allowing explicit null', async () => {
    const admin = await admins.create({ id:randomUUID(), email:'partial-owner@example.com', displayName:null });
    const device = await devices.create({ id:randomUUID(), adminId:admin.id, stableIdentifier:'partial-device', name:'Partial', platform:'android' });
    const t1 = new Date('2026-09-25T10:00:00.000Z');
    const t2 = new Date('2026-09-25T10:01:00.000Z');

    await monitoring.upsertIfNewer({
      managedDeviceId:device.id, schemaVersion:1, observedAt:t1, receivedAt:t1,
      batteryPercentage:80, storageUsedBytes:1000,
    });
    await monitoring.upsertIfNewer({
      managedDeviceId:device.id, schemaVersion:1, observedAt:t2, receivedAt:t2,
      batteryPercentage:null,
    });

    const current=await monitoring.findCurrent(device.id);
    expect(current?.batteryPercentage).toBeNull();
    expect(current?.storageUsedBytes).toBe(1000);
  });
});
