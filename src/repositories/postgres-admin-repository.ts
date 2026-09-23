import type { Admin, AdminStatus } from '../domain/admin.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { AdminRepository } from './admin-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface AdminRow {
  id: string;
  email: string;
  display_name: string | null;
  status: AdminStatus;
  created_at: Date;
  updated_at: Date;
}

const toAdmin = (row: AdminRow): Admin => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PostgresAdminRepository
  extends PostgresRepository
  implements AdminRepository
{
  readonly name = 'admin';

  async create(input: {
    id: string;
    email: string;
    displayName: string | null;
  }): Promise<Admin> {
    try {
      const result = await this.query<AdminRow>(
        'INSERT INTO admins (id, email, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name, status, created_at, updated_at',
        [input.id, input.email, input.displayName],
      );
      return toAdmin(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to create administrator.');
    }
  }

  async findById(id: string): Promise<Admin | null> {
    const result = await this.query<AdminRow>(
      'SELECT id, email, display_name, status, created_at, updated_at FROM admins WHERE id = $1',
      [id],
    );
    return result.rows[0] === undefined ? null : toAdmin(result.rows[0]);
  }

  async findByEmail(email: string): Promise<Admin | null> {
    const result = await this.query<AdminRow>(
      'SELECT id, email, display_name, status, created_at, updated_at FROM admins WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    return result.rows[0] === undefined ? null : toAdmin(result.rows[0]);
  }

  async existsByEmail(email: string): Promise<boolean> {
    const result = await this.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM admins WHERE LOWER(email) = LOWER($1)) AS exists',
      [email],
    );
    return result.rows[0]?.exists === true;
  }

  async updateStatus(id: string, status: AdminStatus): Promise<Admin | null> {
    const result = await this.query<AdminRow>(
      'UPDATE admins SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, email, display_name, status, created_at, updated_at',
      [id, status],
    );
    return result.rows[0] === undefined ? null : toAdmin(result.rows[0]);
  }

  async updateMetadata(
    id: string,
    metadata: { displayName: string | null },
  ): Promise<Admin | null> {
    const result = await this.query<AdminRow>(
      'UPDATE admins SET display_name = $2, updated_at = NOW() WHERE id = $1 RETURNING id, email, display_name, status, created_at, updated_at',
      [id, metadata.displayName],
    );
    return result.rows[0] === undefined ? null : toAdmin(result.rows[0]);
  }
}

export const mapPostgresPersistenceError = (
  error: unknown,
  fallbackMessage: string,
): PersistenceError => {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined;

  if (code === '23505') {
    return new PersistenceError('CONFLICT', 'The resource already exists.', error);
  }
  if (code === '23503') {
    return new PersistenceError(
      'FOREIGN_KEY',
      'The referenced resource does not exist.',
      error,
    );
  }
  if (code === '23514') {
    return new PersistenceError(
      'INVALID_STATE',
      'The resource state is invalid.',
      error,
    );
  }
  if (code === '23502' || code === '22P02') {
    return new PersistenceError(
      'INVALID_STATE',
      'The resource data is invalid.',
      error,
    );
  }
  if (
    code?.startsWith('08') ||
    code === '53300' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03'
  ) {
    return new PersistenceError(
      'DATABASE_UNAVAILABLE',
      'The database service is unavailable.',
      error,
    );
  }
  if (code === '57014' || code === '55P03') {
    return new PersistenceError(
      'DATABASE_UNAVAILABLE',
      'The database operation timed out or could not acquire a lock.',
      error,
    );
  }

  return new PersistenceError('UNKNOWN', fallbackMessage, error);
};
