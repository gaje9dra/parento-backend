import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { resetMigrations, runMigrations } from '../src/db/migrate.js';
import { PostgresAdminRepository } from '../src/repositories/postgres-admin-repository.js';
import {
  PostgresManagedDeviceRepository,
} from '../src/repositories/postgres-managed-device-repository.js';
import {
  PostgresEnrollmentRepository,
} from '../src/repositories/postgres-enrollment-repository.js';
import { EnrollmentPersistenceService } from '../src/services/enrollment-persistence-service.js';
import { AdminPersistenceService } from '../src/services/admin-persistence-service.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('Phase 2.3 domain persistence', () => {
  const database = createDatabase(loadConfig());
  const admins = new PostgresAdminRepository(database);
  const devices = new PostgresManagedDeviceRepository(database);
  const enrollments = new PostgresEnrollmentRepository(database);
  const enrollmentService = new EnrollmentPersistenceService(enrollments);
  const adminService = new AdminPersistenceService(admins);

  beforeEach(async () => {
    await resetMigrations(database);
    await runMigrations(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('enforces unique admin email and supports metadata/status updates', async () => {
    const admin = await admins.create({
      id: randomUUID(),
      email: 'admin@example.com',
      displayName: 'Initial',
    });
    await expect(
      admins.create({
        id: randomUUID(),
        email: 'ADMIN@example.com',
        displayName: null,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(
      (await admins.updateMetadata(admin.id, { displayName: 'Updated' }))
        ?.displayName,
    ).toBe('Updated');
    expect((await admins.updateStatus(admin.id, 'DISABLED'))?.status).toBe(
      'DISABLED',
    );
  });

  it('normalizes new administrator identifiers and validates profile metadata', async () => {
    const admin = await adminService.create({
      email: '  Admin@Example.com  ',
      displayName: '  Parent Admin  ',
    });

    expect(admin.email).toBe('admin@example.com');
    expect(admin.displayName).toBe('Parent Admin');
    expect(await adminService.findByEmail(' ADMIN@EXAMPLE.COM ')).toMatchObject({
      id: admin.id,
      email: 'admin@example.com',
    });

    expect(() =>
      adminService.create({
        email: 'invalid',
        displayName: null,
      }),
    ).toThrow('Administrator email is invalid.');

    expect(() =>
      adminService.updateMetadata(admin.id, 'x'.repeat(101)),
    ).toThrow(/must not exceed 100/);

    await expect(
      adminService.create({
        email: 'second@example.com',
        displayName: '',
      }),
    ).resolves.toMatchObject({ displayName: null });
  });

  it('requires a valid admin relationship for devices', async () => {
    const admin = await admins.create({
      id: randomUUID(),
      email: 'owner@example.com',
      displayName: 'Owner',
    });
    const device = await devices.create({
      id: randomUUID(),
      adminId: admin.id,
      stableIdentifier: 'managed-installation-1',
      name: 'Child Device',
      platform: 'android',
    });
    expect(device.adminId).toBe(admin.id);
    expect(
      (await devices.findByStableIdentifier('managed-installation-1'))?.id,
    ).toBe(device.id);
    expect((await devices.listByAdminId(admin.id)).items).toHaveLength(1);

    await expect(
      devices.create({
        id: randomUUID(),
        adminId: randomUUID(),
        stableIdentifier: 'orphan',
        name: 'Orphan',
        platform: 'android',
      }),
    ).rejects.toMatchObject({ code: 'FOREIGN_KEY' });
  });

  it('rejects duplicate stable device identifiers', async () => {
    const admin = await admins.create({
      id: randomUUID(),
      email: 'device-unique@example.com',
      displayName: null,
    });
    const stableIdentifier = 'duplicate-device-id';

    await devices.create({
      id: randomUUID(),
      adminId: admin.id,
      stableIdentifier,
      name: 'First',
      platform: 'android',
    });

    await expect(
      devices.create({
        id: randomUUID(),
        adminId: admin.id,
        stableIdentifier,
        name: 'Second',
        platform: 'android',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('enforces enrollment admin/device integrity and lifecycle', async () => {
    const admin = await admins.create({
      id: randomUUID(),
      email: 'enroll@example.com',
      displayName: null,
    });
    const device = await devices.create({
      id: randomUUID(),
      adminId: admin.id,
      stableIdentifier: 'enrollment-device',
      name: 'Enrollment Device',
      platform: 'android',
    });
    const enrollment = await enrollments.create({
      id: randomUUID(),
      enrollmentIdentifier: 'enrollment-test-1',
      deviceId: device.id,
      adminId: admin.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(enrollment.status).toBe('PENDING');
    expect(enrollment.updatedAt).toBeInstanceOf(Date);

    await expect(
      enrollments.create({
        id: randomUUID(),
        enrollmentIdentifier: 'enrollment-test-1',
        deviceId: device.id,
        adminId: admin.id,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const completed = await enrollments.updateStatus(
      enrollment.id,
      'COMPLETED',
    );
    expect(completed?.completedAt).toBeInstanceOf(Date);
    expect(completed?.updatedAt).toBeInstanceOf(Date);

    await expect(
      enrollments.updateStatus(enrollment.id, 'PENDING'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('rejects enrollment whose admin does not own the device', async () => {
    const admin = await admins.create({
      id: randomUUID(),
      email: 'owner@example.com',
      displayName: null,
    });
    const otherAdmin = await admins.create({
      id: randomUUID(),
      email: 'other@example.com',
      displayName: null,
    });
    const device = await devices.create({
      id: randomUUID(),
      adminId: admin.id,
      stableIdentifier: 'owned-device',
      name: 'Owned Device',
      platform: 'android',
    });

    await expect(
      enrollments.create({
        id: randomUUID(),
        enrollmentIdentifier: 'wrong-owner',
        deviceId: device.id,
        adminId: otherAdmin.id,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: 'FOREIGN_KEY' });
  });

  it('enforces managed-device lifecycle transitions', async () => {
    const admin = await admins.create({
      id: randomUUID(),
      email: 'status@example.com',
      displayName: null,
    });
    const device = await devices.create({
      id: randomUUID(),
      adminId: admin.id,
      stableIdentifier: 'status-device',
      name: 'Status Device',
      platform: 'android',
    });

    expect(
      (await devices.updateStatus(device.id, 'ACTIVE'))?.operationalStatus,
    ).toBe('ACTIVE');
    expect(
      (await devices.updateStatus(device.id, 'REVOKED'))?.operationalStatus,
    ).toBe('REVOKED');
    await expect(
      devices.updateStatus(device.id, 'ACTIVE'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('supports transaction rollback at the persistence boundary', async () => {
    const adminId = randomUUID();
    await expect(
      database.withTransaction(async (client) => {
        await client.query(
          'INSERT INTO admins (id, email, display_name) VALUES ($1, $2, $3)',
          [adminId, 'rollback@example.com', null],
        );
        throw new Error('intentional rollback');
      }),
    ).rejects.toThrow('intentional rollback');

    expect(await admins.findById(adminId)).toBeNull();
  });

  it('rejects expired enrollment at the service boundary', async () => {
    const admin = await admins.create({
      id: randomUUID(),
      email: 'expiry@example.com',
      displayName: null,
    });
    const device = await devices.create({
      id: randomUUID(),
      adminId: admin.id,
      stableIdentifier: 'expiry-device',
      name: 'Expiry Device',
      platform: 'android',
    });

    expect(() =>
      enrollmentService.create({
        enrollmentIdentifier: 'expired-at-create',
        deviceId: device.id,
        adminId: admin.id,
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).toThrow('Enrollment expiration must be in the future.');
  });
});
