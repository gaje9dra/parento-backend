import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('Phase 11.1 application-management database', () => {
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
    expect(result.rows[0]?.definition).toContain('REQUEST_APPLICATION_INVENTORY');

    const commandTables = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%command%'",
    );
    expect(Number(commandTables.rows[0]?.count ?? '0')).toBe(2);
  });
});
