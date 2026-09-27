import { randomUUID as cryptoRandomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)(
  'Phase 11.1 application-management database',
  () => {
    const database = createDatabase(loadConfig());

    beforeAll(async () => {
      await runMigrations(database);
    });

    afterAll(async () => {
      await database.close();
    });

    it('creates the application-management tables and indexes', async () => {
      const tables = await database.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('application_inventory','application_policies','application_policy_rules','application_policy_assignments','application_policy_sync_state','application_management_events') ORDER BY tablename",
      );
      expect(tables.rows.map((row) => row.tablename)).toEqual([
        'application_inventory',
        'application_management_events',
        'application_policies',
        'application_policy_assignments',
        'application_policy_rules',
        'application_policy_sync_state',
      ]);

      const indexes = await database.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('application_inventory_package_idx','application_inventory_device_observed_idx','application_policy_admin_name_idx','application_policy_assignment_policy_idx','application_sync_status_idx') ORDER BY indexname",
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        'application_inventory_device_observed_idx',
        'application_inventory_package_idx',
        'application_policy_admin_name_idx',
        'application_policy_assignment_policy_idx',
        'application_sync_status_idx',
      ]);
    });

    it('extends the existing command allowlist without creating a second command table', async () => {
      const result = await database.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='commands'::regclass AND conname='commands_type_check'",
      );
      expect(result.rows[0]?.definition).toContain('SYNC_APPLICATION_POLICY');
      expect(result.rows[0]?.definition).toContain(
        'REQUEST_APPLICATION_INVENTORY',
      );

      const commandTables = await database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%command%'",
      );
      expect(Number(commandTables.rows[0]?.count ?? '0')).toBe(2);
    });

    it('hardens policy lifecycle propagation and report replay protection', async () => {
      const adminId = cryptoRandomUUID();
      const deviceId = cryptoRandomUUID();
      const policyId = cryptoRandomUUID();
      const reportedAt = new Date('2026-09-27T01:00:00.000Z');

      await database.query(
        'INSERT INTO admins (id,email,status) VALUES ($1,$2,$3)',
        [adminId, `phase11-4-${adminId}@example.test`, 'ACTIVE'],
      );
      await database.query(
        "INSERT INTO managed_devices (id,admin_id,stable_identifier,name,platform,enrollment_status,operational_status) VALUES ($1,$2,$3,$4,'android','ACTIVE','ACTIVE')",
        [deviceId, adminId, `phase11-4-${deviceId}`, 'Phase 11.4 Test'],
      );
      await database.query(
        "INSERT INTO application_policies (id,admin_id,name,status,version,created_by,updated_by) VALUES ($1,$2,$3,'ACTIVE',1,$2,$2)",
        [policyId, adminId, `Phase 11.4 ${policyId}`],
      );
      await database.query(
        "INSERT INTO application_policy_rules (policy_id,package_name,action) VALUES ($1,'com.example.app','BLOCK')",
        [policyId],
      );
      await database.query(
        'INSERT INTO application_policy_assignments (managed_device_id,policy_id,policy_version,assigned_by) VALUES ($1,$2,1,$3)',
        [deviceId, policyId, adminId],
      );
      await database.query(
        "INSERT INTO application_policy_sync_state (managed_device_id,desired_policy_id,desired_policy_version,status,last_requested_at,updated_at) VALUES ($1,$2,1,'PENDING',NOW(),NOW())",
        [deviceId, policyId],
      );

      await database.query(
        "UPDATE application_policies SET status='DISABLED',version=2,updated_at=NOW() WHERE id=$1",
        [policyId],
      );
      const disabled = await database.query<{
        policy_version: number;
        desired_policy_id: string | null;
        desired_policy_version: number | null;
      }>(
        'SELECT a.policy_version,s.desired_policy_id,s.desired_policy_version FROM application_policy_assignments a JOIN application_policy_sync_state s ON s.managed_device_id=a.managed_device_id WHERE a.managed_device_id=$1',
        [deviceId],
      );
      expect(disabled.rows[0]).toMatchObject({
        policy_version: 1,
        desired_policy_id: null,
        desired_policy_version: null,
      });

      await database.query(
        "UPDATE application_policies SET status='ACTIVE',version=3,updated_at=NOW() WHERE id=$1",
        [policyId],
      );
      const reenabled = await database.query<{
        policy_version: number;
        desired_policy_id: string | null;
        desired_policy_version: number | null;
      }>(
        'SELECT a.policy_version,s.desired_policy_id,s.desired_policy_version FROM application_policy_assignments a JOIN application_policy_sync_state s ON s.managed_device_id=a.managed_device_id WHERE a.managed_device_id=$1',
        [deviceId],
      );
      expect(reenabled.rows[0]).toMatchObject({
        policy_version: 3,
        desired_policy_id: policyId,
        desired_policy_version: 3,
      });

      await database.query(
        "UPDATE application_policy_sync_state SET reported_policy_id=$2,reported_policy_version=3,status='APPLIED',last_reported_at=$3 WHERE managed_device_id=$1",
        [deviceId, policyId, reportedAt],
      );

      await expect(
        database.query(
          "UPDATE application_policy_sync_state SET reported_policy_id=$2,reported_policy_version=3,status='STALE',last_reported_at=$3 WHERE managed_device_id=$1",
          [
            deviceId,
            policyId,
            new Date('2026-09-27T00:59:59.000Z'),
          ],
        ),
      ).rejects.toThrow(/older than the stored report/i);
    });
  },
);
