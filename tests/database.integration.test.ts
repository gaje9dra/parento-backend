import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import {
  migrationStatus,
  resetMigrations,
  runMigrations,
} from '../src/db/migrate.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('PostgreSQL persistence foundation', () => {
  const database = createDatabase(loadConfig());

  beforeAll(async () => {
    await resetMigrations(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('connects to PostgreSQL', async () => {
    const ready = await database.isReady();
    expect(ready).toBe(true);
  });

  it('applies the baseline migration to a clean database', async () => {
    await runMigrations(database);

    const status = await migrationStatus(database);
    expect(status).toEqual([
      { id: '0001', applied: true, name: 'phase_2_1_baseline' },
      { id: '0002', applied: true, name: 'core_domain' },
      { id: '0003', applied: true, name: 'phase_2_3_integrity' },
      { id: '0004', applied: true, name: 'phase_2_4_query_indexes' },
    ]);
  });

  it('is deterministic when migrations are applied twice', async () => {
    await runMigrations(database);
    await runMigrations(database);

    const status = await migrationStatus(database);
    expect(status.filter((migration) => migration.applied)).toHaveLength(4);
  });

  it('verifies the final schema has the Phase 2 integrity constraints and query indexes', async () => {
    const indexes = await database.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (" +
        "'admins_email_unique_idx', 'managed_devices_admin_created_id_idx', " +
        "'enrollments_admin_created_id_idx', 'enrollments_device_created_id_idx'" +
        ') ORDER BY indexname',
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'admins_email_unique_idx',
      'enrollments_admin_created_id_idx',
      'enrollments_device_created_id_idx',
      'managed_devices_admin_created_id_idx',
    ]);

    const constraints = await database.query<{ constraint_name: string }>(
      "SELECT constraint_name FROM information_schema.table_constraints " +
        "WHERE constraint_schema = 'public' AND constraint_name IN (" +
        "'managed_devices_stable_identifier_unique', 'enrollments_device_admin_fk', " +
        "'managed_devices_stable_identifier_check', 'enrollments_completed_timestamp_check'" +
        ') ORDER BY constraint_name',
    );
    expect(constraints.rows.map((row) => row.constraint_name)).toEqual([
      'enrollments_completed_timestamp_check',
      'enrollments_device_admin_fk',
      'managed_devices_stable_identifier_check',
      'managed_devices_stable_identifier_unique',
    ]);
  });

  it('upgrades a Phase 2.3 database to the Phase 2.4 schema', async () => {
    await resetMigrations(database);

    for (const id of ['0001_phase_2_1_baseline.sql', '0002_core_domain.sql', '0003_phase_2_3_integrity.sql']) {
      const sql = await readFile(join(process.cwd(), 'migrations', id), 'utf8');
      await database.withTransaction(async (client) => {
        await client.query(sql);
        const migrationId = id.slice(0, 4);
        const migrationName = id.slice(5, -4);
        await client.query(
          'INSERT INTO schema_migrations (id, name) VALUES ($1, $2)',
          [migrationId, migrationName],
        );
      });
    }

    await runMigrations(database);
    const status = await migrationStatus(database);
    expect(status.at(-1)).toEqual({
      id: '0004',
      applied: true,
      name: 'phase_2_4_query_indexes',
    });
  });

  it('supports transactional rollback', async () => {
    await expect(
      database.withTransaction(async (client) => {
        await client.query(
          'CREATE TABLE transaction_rollback_probe (id INTEGER PRIMARY KEY)',
        );
        throw new Error('intentional rollback');
      }),
    ).rejects.toThrow('intentional rollback');

    const result = await database.query(
      "SELECT to_regclass('transaction_rollback_probe') AS name",
    );
    expect(result.rows[0]?.name).toBeNull();
  });
});
