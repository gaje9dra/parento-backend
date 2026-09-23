import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { migrationStatus, resetMigrations, runMigrations } from '../src/db/migrate.js';

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
      {
        id: '0001',
        applied: true,
        name: 'phase_2_1_baseline',
      },
    ]);
  });

  it('is deterministic when migrations are applied twice', async () => {
    await runMigrations(database);
    await runMigrations(database);

    const status = await migrationStatus(database);
    expect(status.filter((migration) => migration.applied)).toHaveLength(1);
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
