import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateOpaqueToken, hashOpaqueToken } from '../src/auth/token.js';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { resetMigrations, runMigrations } from '../src/db/migrate.js';
import { PostgresAdminRepository } from '../src/repositories/postgres-admin-repository.js';
import { PostgresEnrollmentSessionRepository } from '../src/repositories/postgres-enrollment-session-repository.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)(
  'Phase 5.1 enrollment security integration',
  () => {
    const database = createDatabase(loadConfig());
    const admins = new PostgresAdminRepository(database);
    const enrollments = new PostgresEnrollmentSessionRepository(database);

    beforeEach(async () => {
      await resetMigrations(database);
      await runMigrations(database);
    });

    afterAll(async () => {
      await database.close();
    });

    it('consumes an enrollment authorization exactly once under concurrency', async () => {
      const admin = await admins.create({
        id: randomUUID(),
        email: 'enrollment-concurrency@example.com',
        displayName: 'Enrollment Owner',
      });

      const secret = generateOpaqueToken();
      const session = await enrollments.create({
        id: randomUUID(),
        adminId: admin.id,
        secretHash: hashOpaqueToken(secret),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const input = {
        id: session.id,
        secretHash: hashOpaqueToken(secret),
        managedDeviceId: randomUUID(),
        stableIdentifier: 'managed-installation-concurrent',
        name: 'Concurrent Device',
        platform: 'android',
        now: new Date(),
      };

      const second = {
        ...input,
        managedDeviceId: randomUUID(),
      };

      const results = await Promise.allSettled([
        enrollments.consume(input),
        enrollments.consume(second),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const completed = await enrollments.findById(session.id);
      expect(completed?.status).toBe('COMPLETED');
      expect(completed?.managedDeviceId).toBeDefined();

      const devices = await database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM managed_devices WHERE stable_identifier = $1',
        ['managed-installation-concurrent'],
      );
      expect(devices.rows[0]?.count).toBe('1');
    });

    it('rejects a consumed authorization on replay', async () => {
      const admin = await admins.create({
        id: randomUUID(),
        email: 'enrollment-replay@example.com',
        displayName: null,
      });
      const secret = generateOpaqueToken();
      const session = await enrollments.create({
        id: randomUUID(),
        adminId: admin.id,
        secretHash: hashOpaqueToken(secret),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await enrollments.consume({
        id: session.id,
        secretHash: hashOpaqueToken(secret),
        managedDeviceId: randomUUID(),
        stableIdentifier: 'managed-installation-replay',
        name: 'Replay Device',
        platform: 'android',
        now: new Date(),
      });

      await expect(
        enrollments.consume({
          id: session.id,
          secretHash: hashOpaqueToken(secret),
          managedDeviceId: randomUUID(),
          stableIdentifier: 'managed-installation-replay-2',
          name: 'Replay Device 2',
          platform: 'android',
          now: new Date(),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('rejects an already-associated installation identity', async () => {
      const admin = await admins.create({
        id: randomUUID(),
        email: 'enrollment-identity@example.com',
        displayName: null,
      });

      await database.query(
        'INSERT INTO managed_devices (id, admin_id, stable_identifier, name, platform) VALUES ($1, $2, $3, $4, $5)',
        [randomUUID(), admin.id, 'already-managed', 'Existing', 'android'],
      );

      const secret = generateOpaqueToken();
      const session = await enrollments.create({
        id: randomUUID(),
        adminId: admin.id,
        secretHash: hashOpaqueToken(secret),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        enrollments.consume({
          id: session.id,
          secretHash: hashOpaqueToken(secret),
          managedDeviceId: randomUUID(),
          stableIdentifier: 'already-managed',
          name: 'Duplicate',
          platform: 'android',
          now: new Date(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  },
);
