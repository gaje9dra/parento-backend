import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';
import type { AppConfig } from '../config/env.js';

export interface Database {
  readonly pool?: Pool;
  readonly configured: boolean;
  connect(): Promise<void>;
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>;
  isReady(): Promise<boolean>;
  close(): Promise<void>;
}

class PostgresDatabase implements Database {
  readonly configured = true;
  readonly pool: Pool;

  constructor(config: AppConfig) {
    if (config.database.url === undefined) {
      throw new Error('Database URL is not configured.');
    }

    this.pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
      idleTimeoutMillis: config.database.idleTimeoutMs,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      ssl: config.database.ssl ? { rejectUnauthorized: true } : undefined,
      application_name: config.app.name,
    });
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    client.release();
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    return values === undefined
      ? this.pool.query<T>(text)
      : this.pool.query<T>(text, values as unknown as any[]);
  }

  async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

class OptionalDatabase implements Database {
  readonly configured = false;

  connect(): Promise<void> {
    return Promise.resolve();
  }

  query<T extends QueryResultRow = QueryResultRow>(
    _text: string,
    _values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    return Promise.reject(new Error('Database is not configured.'));
  }

  withTransaction<T>(_work: (client: PoolClient) => Promise<T>): Promise<T> {
    return Promise.reject(new Error('Database is not configured.'));
  }

  isReady(): Promise<boolean> {
    return Promise.resolve(false);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export const createDatabase = (config: AppConfig): Database =>
  config.database.url === undefined
    ? new OptionalDatabase()
    : new PostgresDatabase(config);
