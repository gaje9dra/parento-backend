import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/env.js';
import { createDatabase, type Database } from './index.js';

interface Migration {
  readonly id: string;
  readonly name: string;
  readonly sql: string;
}

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

const loadMigrations = async (): Promise<Migration[]> => {
  const entries = (await readdir(migrationsDirectory))
    .filter((entry) => /^\d+_.+\.sql$/.test(entry))
    .sort();

  return Promise.all(
    entries.map(async (entry) => {
      const match = /^(\d+)_(.+)\.sql$/.exec(entry);
      if (match === null || match[1] === undefined || match[2] === undefined) {
        throw new Error('Invalid migration filename.');
      }
      return {
        id: match[1],
        name: match[2],
        sql: await readFile(join(migrationsDirectory, entry), 'utf8'),
      };
    }),
  );
};

const ensureMigrationTable = async (db: Database): Promise<void> => {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (' +
      'id TEXT PRIMARY KEY, ' +
      'name TEXT NOT NULL, ' +
      'applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()' +
      ')',
  );
};

const status = async (db: Database): Promise<void> => {
  await ensureMigrationTable(db);
  const applied = await db.query<{ id: string }>(
    'SELECT id FROM schema_migrations ORDER BY id',
  );
  const appliedIds = new Set(applied.rows.map((row) => row.id));

  for (const migration of await loadMigrations()) {
    process.stdout.write(
      migration.id +
        ' ' +
        (appliedIds.has(migration.id) ? 'applied' : 'pending') +
        ' ' +
        migration.name +
        '\n',
    );
  }
};

const up = async (db: Database): Promise<void> => {
  await ensureMigrationTable(db);
  const applied = await db.query<{ id: string }>(
    'SELECT id FROM schema_migrations ORDER BY id',
  );
  const appliedIds = new Set(applied.rows.map((row) => row.id));

  for (const migration of await loadMigrations()) {
    if (appliedIds.has(migration.id)) continue;

    await db.withTransaction(async (client) => {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (id, name) VALUES ($1, $2)',
        [migration.id, migration.name],
      );
    });

    process.stdout.write(
      'applied ' + migration.id + ' ' + migration.name + '\n',
    );
  }
};

const reset = async (db: Database): Promise<void> => {
  const config = loadConfig();
  if (config.app.environment === 'production') {
    throw new Error('Database reset is disabled in production.');
  }
  if (!db.configured) {
    throw new Error('Database reset requires DATABASE_URL.');
  }

  await db.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
  await up(db);
};

const main = async (): Promise<void> => {
  const command = process.argv[2] ?? 'status';
  const db = createDatabase(loadConfig());

  try {
    if (!db.configured) {
      throw new Error('DATABASE_URL is required for database commands.');
    }

    if (command === 'status') await status(db);
    else if (command === 'up') await up(db);
    else if (command === 'reset') await reset(db);
    else throw new Error('Unknown migration command: ' + command);
  } finally {
    await db.close();
  }
};

await main();
