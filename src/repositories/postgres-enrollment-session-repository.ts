import { timingSafeEqual } from 'node:crypto';
import type {
  EnrollmentSession,
  EnrollmentSessionStatus,
} from '../domain/enrollment-session.js';
import {
  isValidEnrollmentSessionTransition,
} from '../domain/enrollment-session.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import { mapPostgresPersistenceError } from '../db/errors.js';
import type { EnrollmentSessionRepository } from './enrollment-session-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface SessionRow {
  id: string;
  admin_id: string;
  status: EnrollmentSessionStatus;
  secret_hash: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  verified_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  managed_device_id: string | null;
  verification_attempts: number;
}

const columns =
  'id, admin_id, status, secret_hash, created_at, updated_at, expires_at, verified_at, completed_at, cancelled_at, managed_device_id, verification_attempts';

const toSession = (row: SessionRow): EnrollmentSession => ({
  id: row.id,
  adminId: row.admin_id,
  status: row.status,
  secretHash: row.secret_hash,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
  verifiedAt: row.verified_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  managedDeviceId: row.managed_device_id,
  verificationAttempts: row.verification_attempts,
});

const secureHashMatches = (expected: string, actual: string): boolean => {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
};

export class PostgresEnrollmentSessionRepository
  extends PostgresRepository
  implements EnrollmentSessionRepository
{
  readonly name = 'enrollment-session';

  async create(input: {
    id: string;
    adminId: string;
    secretHash: string;
    expiresAt: Date;
  }): Promise<EnrollmentSession> {
    try {
      const result = await this.query<SessionRow>(
        'INSERT INTO enrollment_sessions (id, admin_id, secret_hash, expires_at) VALUES ($1, $2, $3, $4) RETURNING ' +
          columns,
        [input.id, input.adminId, input.secretHash, input.expiresAt],
      );
      return toSession(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to create enrollment session.',
      );
    }
  }

  async findById(id: string): Promise<EnrollmentSession | null> {
    const result = await this.query<SessionRow>(
      'SELECT ' + columns + ' FROM enrollment_sessions WHERE id = $1',
      [id],
    );
    return result.rows[0] === undefined ? null : toSession(result.rows[0]);
  }

  async listByAdminId(adminId: string): Promise<EnrollmentSession[]> {
    const result = await this.query<SessionRow>(
      'SELECT ' +
        columns +
        ' FROM enrollment_sessions WHERE admin_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100',
      [adminId],
    );
    return result.rows.map(toSession);
  }

  async cancelOwned(
    id: string,
    adminId: string,
    now: Date,
  ): Promise<EnrollmentSession | null> {
    try {
      return await this.transaction(async (client) => {
        const result = await client.query<SessionRow>(
          'SELECT ' +
            columns +
            ' FROM enrollment_sessions WHERE id = $1 AND admin_id = $2 FOR UPDATE',
          [id, adminId],
        );
        const current = result.rows[0];
        if (current === undefined) return null;

        if (
          current.status === 'PENDING' &&
          current.expires_at.getTime() <= now.getTime()
        ) {
          await client.query(
            "UPDATE enrollment_sessions SET status = 'EXPIRED', updated_at = $2 WHERE id = $1",
            [id, now],
          );
          return toSession({ ...current, status: 'EXPIRED', updated_at: now });
        }

        if (current.status !== 'PENDING') return toSession(current);

        const updated = await client.query<SessionRow>(
          "UPDATE enrollment_sessions SET status = 'CANCELLED', cancelled_at = $2, updated_at = $2 WHERE id = $1 RETURNING " +
            columns,
          [id, now],
        );
        return updated.rows[0] === undefined ? null : toSession(updated.rows[0]);
      });
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to cancel enrollment session.',
      );
    }
  }

  async consume(input: {
    id: string;
    secretHash: string;
    managedDeviceId: string;
    stableIdentifier: string;
    name: string;
    platform: string;
    now: Date;
    maxAttempts?: number;
  }): Promise<EnrollmentSession> {
    const maxAttempts = input.maxAttempts ?? 10;

    try {
      return await this.transaction(async (client) => {
        const result = await client.query<SessionRow>(
          'SELECT ' +
            columns +
            ' FROM enrollment_sessions WHERE id = $1 FOR UPDATE',
          [input.id],
        );
        const current = result.rows[0];
        if (current === undefined) {
          throw new PersistenceError(
            'NOT_FOUND',
            'Enrollment session not found.',
          );
        }

        if (
          current.status === 'PENDING' &&
          current.expires_at.getTime() <= input.now.getTime()
        ) {
          await client.query(
            "UPDATE enrollment_sessions SET status = 'EXPIRED', updated_at = $2 WHERE id = $1",
            [input.id, input.now],
          );
          throw new PersistenceError(
            'INVALID_STATE',
            'Enrollment session expired.',
          );
        }

        if (current.status !== 'PENDING') {
          throw new PersistenceError(
            'INVALID_STATE',
            'Enrollment session is not available for consumption.',
          );
        }

        const secretValid = secureHashMatches(
          current.secret_hash,
          input.secretHash,
        );
        if (!secretValid) {
          const attempts = current.verification_attempts + 1;
          const nextStatus: EnrollmentSessionStatus =
            attempts >= maxAttempts ? 'FAILED' : 'PENDING';
          await client.query(
            'UPDATE enrollment_sessions SET verification_attempts = $2, status = $3, updated_at = $4 WHERE id = $1',
            [input.id, attempts, nextStatus, input.now],
          );
          throw new PersistenceError(
            'INVALID_STATE',
            attempts >= maxAttempts
              ? 'Enrollment verification is no longer available.'
              : 'Enrollment verification failed.',
          );
        }

        const adminResult = await client.query<{
          status: 'ACTIVE' | 'DISABLED';
        }>('SELECT status FROM admins WHERE id = $1', [current.admin_id]);
        if (adminResult.rows[0]?.status !== 'ACTIVE') {
          throw new PersistenceError(
            'INVALID_STATE',
            'Enrollment authorization is no longer available.',
          );
        }

        const existingDevice = await client.query<{ id: string }>(
          'SELECT id FROM managed_devices WHERE stable_identifier = $1 FOR UPDATE',
          [input.stableIdentifier],
        );
        if (existingDevice.rows[0] !== undefined) {
          throw new PersistenceError(
            'CONFLICT',
            'The managed-device identity is already associated with a device.',
          );
        }

        const device = await client.query(
          "INSERT INTO managed_devices (id, admin_id, stable_identifier, name, platform, enrollment_status, operational_status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'ACTIVE')",
          [
            input.managedDeviceId,
            current.admin_id,
            input.stableIdentifier,
            input.name,
            input.platform,
          ],
        );

        if (device.rowCount !== 1) {
          throw new PersistenceError(
            'UNKNOWN',
            'Unable to create the managed device.',
          );
        }

        const updated = await client.query<SessionRow>(
          "UPDATE enrollment_sessions SET status = 'COMPLETED', verified_at = $2, completed_at = $2, managed_device_id = $3, updated_at = $2 WHERE id = $1 AND status = 'PENDING' RETURNING " +
            columns,
          [input.id, input.now, input.managedDeviceId],
        );

        if (updated.rows[0] === undefined) {
          throw new PersistenceError(
            'INVALID_STATE',
            'Enrollment session could not be completed.',
          );
        }

        return toSession(updated.rows[0]);
      });
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw mapPostgresPersistenceError(
        error,
        'Unable to consume enrollment session.',
      );
    }
  }

  static transitionIsValid(
    from: EnrollmentSessionStatus,
    to: EnrollmentSessionStatus,
  ): boolean {
    return isValidEnrollmentSessionTransition(from, to);
  }
}
