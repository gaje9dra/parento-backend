import type { Database } from '../db/index.js';
import type { Enrollment, EnrollmentStatus } from '../domain/enrollment.js';
import type { EnrollmentRepository } from './enrollment-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import { mapPostgresPersistenceError } from './postgres-admin-repository.js';

interface EnrollmentRow { id: string; enrollment_identifier: string; device_id: string; admin_id: string; status: EnrollmentStatus; created_at: Date; expires_at: Date; completed_at: Date | null; }

const toEnrollment = (row: EnrollmentRow): Enrollment => ({
  id: row.id, enrollmentIdentifier: row.enrollment_identifier, deviceId: row.device_id, adminId: row.admin_id,
  status: row.status, createdAt: row.created_at, expiresAt: row.expires_at, completedAt: row.completed_at,
});

export class PostgresEnrollmentRepository extends PostgresRepository implements EnrollmentRepository {
  readonly name = 'enrollment';

  async create(input: { id: string; enrollmentIdentifier: string; deviceId: string; adminId: string; expiresAt: Date }): Promise<Enrollment> {
    try {
      const result = await this.query<EnrollmentRow>(
        'INSERT INTO enrollments (id, enrollment_identifier, device_id, admin_id, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, enrollment_identifier, device_id, admin_id, status, created_at, expires_at, completed_at',
        [input.id, input.enrollmentIdentifier, input.deviceId, input.adminId, input.expiresAt],
      );
      return toEnrollment(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to create enrollment.');
    }
  }

  async findById(id: string): Promise<Enrollment | null> {
    const result = await this.query<EnrollmentRow>(
      'SELECT id, enrollment_identifier, device_id, admin_id, status, created_at, expires_at, completed_at FROM enrollments WHERE id = $1', [id],
    );
    return result.rows[0] === undefined ? null : toEnrollment(result.rows[0]);
  }

  async findByIdentifier(identifier: string): Promise<Enrollment | null> {
    const result = await this.query<EnrollmentRow>(
      'SELECT id, enrollment_identifier, device_id, admin_id, status, created_at, expires_at, completed_at FROM enrollments WHERE enrollment_identifier = $1', [identifier],
    );
    return result.rows[0] === undefined ? null : toEnrollment(result.rows[0]);
  }

  async updateStatus(id: string, status: EnrollmentStatus, completedAt: Date | null = null): Promise<Enrollment | null> {
    const result = await this.query<EnrollmentRow>(
      'UPDATE enrollments SET status = $2, completed_at = $3 WHERE id = $1 RETURNING id, enrollment_identifier, device_id, admin_id, status, created_at, expires_at, completed_at',
      [id, status, status === 'COMPLETED' ? completedAt ?? new Date() : null],
    );
    return result.rows[0] === undefined ? null : toEnrollment(result.rows[0]);
  }
}
