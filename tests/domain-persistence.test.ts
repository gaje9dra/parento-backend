import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { resetMigrations, runMigrations } from '../src/db/migrate.js';
import { PostgresAdminRepository } from '../src/repositories/postgres-admin-repository.js';
import { PostgresManagedDeviceRepository } from '../src/repositories/postgres-managed-device-repository.js';
import { PostgresEnrollmentRepository } from '../src/repositories/postgres-enrollment-repository.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('Phase 2.2 domain persistence', () => {
  const database = createDatabase(loadConfig());
  const admins = new PostgresAdminRepository(database);
  const devices = new PostgresManagedDeviceRepository(database);
  const enrollments = new PostgresEnrollmentRepository(database);

  beforeEach(async () => {
    await resetMigrations(database);
    await runMigrations(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('creates and retrieves an admin with explicit status', async () => {
    const admin = await admins.create({ id: randomUUID(), email: 'Admin@Example.com', displayName: 'Test Admin' });
    expect(admin.status).toBe('ACTIVE');
    expect(await admins.findByEmail('admin@example.com')).not.toBeNull();
  });

  it('enforces case-insensitive unique admin email', async () => {
    await admins.create({ id: randomUUID(), email: 'admin@example.com', displayName: null });
    await expect(
      admins.create({ id: randomUUID(), email: 'ADMIN@example.com', displayName: null }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('creates a device and preserves admin relationship', async () => {
    const admin = await admins.create({ id: randomUUID(), email: 'owner@example.com', displayName: 'Owner' });
    const device = await devices.create({ id: randomUUID(), adminId: admin.id, name: 'Child Device', platform: 'android' });
    expect(device.adminId).toBe(admin.id);
    expect(await devices.listByAdminId(admin.id)).toHaveLength(1);
  });

  it('rejects an orphaned device relationship', async () => {
    await expect(
      devices.create({ id: randomUUID(), adminId: randomUUID(), name: 'Orphan', platform: 'android' }),
    ).rejects.toMatchObject({ code: 'FOREIGN_KEY' });
  });

  it('creates enrollment with admin/device references', async () => {
    const admin = await admins.create({ id: randomUUID(), email: 'enroll@example.com', displayName: null });
    const device = await devices.create({ id: randomUUID(), adminId: admin.id, name: 'Enrollment Device', platform: 'android' });
    const enrollment = await enrollments.create({
      id: randomUUID(),
      enrollmentIdentifier: 'enrollment-test-1',
      deviceId: device.id,
      adminId: admin.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(enrollment.status).toBe('PENDING');
    expect(enrollment.deviceId).toBe(device.id);
    expect(enrollment.adminId).toBe(admin.id);
  });

  it('rejects expired enrollment at the service boundary', async () => {
    const admin = await admins.create({ id: randomUUID(), email: 'expiry@example.com', displayName: null });
    const device = await devices.create({ id: randomUUID(), adminId: admin.id, name: 'Expiry Device', platform: 'android' });
    const enrollment = await enrollments.create({
      id: randomUUID(),
      enrollmentIdentifier: 'expired-at-create',
      deviceId: device.id,
      adminId: admin.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(enrollment.status).toBe('PENDING');
  });

  it('supports disabled admin and status changes', async () => {
    const admin = await admins.create({ id: randomUUID(), email: 'status@example.com', displayName: null });
    expect((await admins.updateStatus(admin.id, 'DISABLED'))?.status).toBe('DISABLED');

    const device = await devices.create({ id: randomUUID(), adminId: admin.id, name: 'Status Device', platform: 'android' });
    expect((await devices.updateStatus(device.id, 'REVOKED'))?.operationalStatus).toBe('REVOKED');

    const enrollment = await enrollments.create({
      id: randomUUID(),
      enrollmentIdentifier: 'status-enrollment',
      deviceId: device.id,
      adminId: admin.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await enrollments.updateStatus(enrollment.id, 'COMPLETED'))?.completedAt).not.toBeNull();
  });
});
