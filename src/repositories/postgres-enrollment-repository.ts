import type { Enrollment, EnrollmentStatus } from '../domain/enrollment.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import { isValidEnrollmentTransition } from '../domain/enrollment.js';
import type { EnrollmentRepository } from './enrollment-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import { mapPostgresPersistenceError } from '../db/errors.js';

interface EnrollmentRow {
  id: string;
  enrollment_identifier: string;
  device_id: string;
  admin_id: string;
  status: EnrollmentStatus;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  completed_at: Date | null;
}

const columns =
  'id, enrollment_identifier, device_id, admin_id, status, created_at, updated_at, expires_at, completed_at';

const encodeCursor = (row: EnrollmentRow): string =>
  Buffer.from(
    JSON.stringify({
      createdAt: row.created_at.toISOString(),
      id: row.id,
    }),
  ).toString('base64url');

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('Invalid cursor.');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error('Invalid cursor.');
    return { createdAt, id: parsed.id };
  } catch {
    throw new PersistenceError(
      'INVALID_STATE',
      'The enrollment page cursor is invalid.',
    );
  }
};

const toEnrollment = (row: EnrollmentRow): Enrollment => ({
  id: row.id,
  enrollmentIdentifier: row.enrollment_identifier,
  deviceId: row.device_id,
  adminId: row.admin_id,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
  completedAt: row.completed_at,
});

export class PostgresEnrollmentRepository
  extends PostgresRepository
  implements EnrollmentRepository
{
  readonly name = 'enrollment';

  async create(input: {
    id: string;
    enrollmentIdentifier: string;
    deviceId: string;
    adminId: string;
    expiresAt: Date;
  }): Promise<Enrollment> {
    try {
      const result = await this.query<EnrollmentRow>(
        'INSERT INTO enrollments (id, enrollment_identifier, device_id, admin_id, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING ' + columns,
        [
          input.id,
          input.enrollmentIdentifier,
          input.deviceId,
          input.adminId,
          input.expiresAt,
        ],
      );
      return toEnrollment(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to create enrollment.');
    }
  }

  async findById(id: string): Promise<Enrollment | null> {
    const result = await this.query<EnrollmentRow>(
      'SELECT ' + columns + ' FROM enrollments WHERE id = $1',
      [id],
    );
    return result.rows[0] === undefined ? null : toEnrollment(result.rows[0]);
  }

  async findByIdentifier(identifier: string): Promise<Enrollment | null> {
    const result = await this.query<EnrollmentRow>(
      'SELECT ' + columns + ' FROM enrollments WHERE enrollment_identifier = $1',
      [identifier],
    );
    return result.rows[0] === undefined ? null : toEnrollment(result.rows[0]);
  }

  async listByAdminId(
    adminId: string,
    page: { limit?: number; cursor?: string | null } = {},
  ): Promise<import('./enrollment-repository.js').EnrollmentPage> {
    return this.listPage('admin_id', adminId, page);
  }

  async listByDeviceId(
    deviceId: string,
    page: { limit?: number; cursor?: string | null } = {},
  ): Promise<import('./enrollment-repository.js').EnrollmentPage> {
    return this.listPage('device_id', deviceId, page);
  }

  private async listPage(
    scopeColumn: 'admin_id' | 'device_id',
    scopeValue: string,
    page: { limit?: number; cursor?: string | null },
  ): Promise<import('./enrollment-repository.js').EnrollmentPage> {
    const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
    const cursor = page.cursor == null ? null : decodeCursor(page.cursor);
    const result = cursor === null
      ? await this.query<EnrollmentRow>(
          'SELECT ' + columns +
            ' FROM enrollments WHERE ' + scopeColumn + ' = $1 ' +
            'ORDER BY created_at DESC, id DESC LIMIT $2',
          [scopeValue, limit + 1],
        )
      : await this.query<EnrollmentRow>(
          'SELECT ' + columns +
            ' FROM enrollments WHERE ' + scopeColumn + ' = $1 ' +
            'AND (created_at, id) < ($2, $3) ' +
            'ORDER BY created_at DESC, id DESC LIMIT $4',
          [scopeValue, cursor.createdAt, cursor.id, limit + 1],
        );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    return {
      items: rows.map(toEnrollment),
      nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]!) : null,
    };
  }

  async updateStatus(
    id: string,
    status: EnrollmentStatus,
    completedAt: Date | null = null,
  ): Promise<Enrollment | null> {
    const current = await this.findById(id);
    if (current === null) return null;

    if (!isValidEnrollmentTransition(current.status, status)) {
      throw new PersistenceError(
        'INVALID_STATE',
        'The enrollment status transition is invalid.',
      );
    }

    const effectiveCompletedAt =
      status === 'COMPLETED' ? completedAt ?? new Date() : null;

    const result = await this.query<EnrollmentRow>(
      'UPDATE enrollments SET status = $2, completed_at = $3, updated_at = NOW() WHERE id = $1 RETURNING ' + columns,
      [id, status, effectiveCompletedAt],
    );
    return result.rows[0] === undefined ? null : toEnrollment(result.rows[0]);
  }
}
