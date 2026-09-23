import type { PoolClient, QueryResultRow } from 'pg';
import type { Database } from '../db/index.js';
import type { Repository } from './repository.js';

export abstract class PostgresRepository implements Repository {
  abstract readonly name: string;

  protected constructor(protected readonly database: Database) {}

  protected query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ) {
    return this.database.query<T>(text, values);
  }

  protected transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.database.withTransaction(work);
  }
}
