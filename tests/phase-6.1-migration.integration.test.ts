import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { migrationStatus, resetMigrations, runMigrations } from '../src/db/migrate.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('Phase 6.1 database migration', () => {
  const database = createDatabase(loadConfig());

  beforeAll(async () => {
    await resetMigrations(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('creates communication tables and constraints', async () => {
    await runMigrations(database);
    const status = await migrationStatus(database);
    expect(status.find((item) => item.id === '0009_phase_6_1_device_communication')?.applied).toBe(true);

    const result = await database.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('device_credentials','device_sessions','device_commands') ORDER BY table_name",
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'device_commands',
      'device_credentials',
      'device_sessions',
    ]);
  });
});
