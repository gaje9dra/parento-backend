import type { PoolClient, QueryResultRow } from 'pg';
import { mapPostgresPersistenceError } from '../db/errors.js';
import type { Database } from '../db/index.js';
import type { Repository } from './repository.js';

export abstract class PostgresRepository implements Repository {
  abstract readonly name: string;

  constructor(protected readonly database: Database) {}

  protected async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ) {
    try {
      return await this.database.query<T>(text, values);
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Database operation failed.');
    }
  }

  protected transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.database.withTransaction(work);
  }
}
