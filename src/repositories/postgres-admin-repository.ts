import type { Admin, AdminStatus } from '../domain/admin.js';
import type {
  AdminAuthenticationRecord,
  AdminSession,
} from '../domain/admin-authentication.js';
import { mapPostgresPersistenceError } from '../db/errors.js';
import type { AdminAuthenticationRepository } from './admin-authentication-repository.js';
import type { AdminRepository } from './admin-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface AdminRow {
  id: string;
  email: string;
  display_name: string | null;
  status: AdminStatus;
  created_at: Date;
  updated_at: Date;
  password_hash?: string | null;
  last_authenticated_at?: Date | null;
}

interface SessionRow {
  id: string;
  admin_id: string;
  access_token_hash: string;
  refresh_token_hash: string;
  access_expires_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

const toAdmin = (row: AdminRow): Admin => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAuthenticationRecord = (row: AdminRow): AdminAuthenticationRecord => ({
  id: row.id,
  email: row.email,
  status: row.status,
  passwordHash: row.password_hash ?? null,
  lastAuthenticatedAt: row.last_authenticated_at ?? null,
});

const toSession = (row: SessionRow): AdminSession => ({
  id: row.id,
  adminId: row.admin_id,
  accessTokenHash: row.access_token_hash,
  refreshTokenHash: row.refresh_token_hash,
  accessExpiresAt: row.access_expires_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
});

export class PostgresAdminRepository
  extends PostgresRepository
  implements AdminRepository, AdminAuthenticationRepository
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
      throw mapPostgresPersistenceError(
        error,
        'Unable to create administrator.',
      );
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

  async findAuthenticationRecordByEmail(
    email: string,
  ): Promise<AdminAuthenticationRecord | null> {
    const result = await this.query<AdminRow>(
      'SELECT id, email, status, password_hash, last_authenticated_at FROM admins WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    return result.rows[0] === undefined
      ? null
      : toAuthenticationRecord(result.rows[0]);
  }

  async findAuthenticationRecordById(
    id: string,
  ): Promise<AdminAuthenticationRecord | null> {
    const result = await this.query<AdminRow>(
      'SELECT id, email, status, password_hash, last_authenticated_at FROM admins WHERE id = $1',
      [id],
    );
    return result.rows[0] === undefined
      ? null
      : toAuthenticationRecord(result.rows[0]);
  }

  async setPasswordHash(
    adminId: string,
    passwordHash: string,
  ): Promise<boolean> {
    const result = await this.query(
      'UPDATE admins SET password_hash = $2, updated_at = NOW() WHERE id = $1',
      [adminId, passwordHash],
    );
    return result.rowCount === 1;
  }

  async updateLastAuthenticatedAt(
    adminId: string,
    authenticatedAt: Date,
  ): Promise<boolean> {
    const result = await this.query(
      'UPDATE admins SET last_authenticated_at = $2, updated_at = NOW() WHERE id = $1',
      [adminId, authenticatedAt],
    );
    return result.rowCount === 1;
  }

  async createSession(input: {
    id: string;
    adminId: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    accessExpiresAt: Date;
    expiresAt: Date;
  }): Promise<AdminSession> {
    try {
      const result = await this.query<SessionRow>(
        'INSERT INTO admin_sessions (id, admin_id, access_token_hash, refresh_token_hash, access_expires_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, admin_id, access_token_hash, refresh_token_hash, access_expires_at, expires_at, revoked_at',
        [
          input.id,
          input.adminId,
          input.accessTokenHash,
          input.refreshTokenHash,
          input.accessExpiresAt,
          input.expiresAt,
        ],
      );
      return toSession(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to create authentication session.',
      );
    }
  }

  async findSessionByAccessTokenHash(
    hash: string,
  ): Promise<AdminSession | null> {
    const result = await this.query<SessionRow>(
      'SELECT id, admin_id, access_token_hash, refresh_token_hash, access_expires_at, expires_at, revoked_at FROM admin_sessions WHERE access_token_hash = $1',
      [hash],
    );
    return result.rows[0] === undefined ? null : toSession(result.rows[0]);
  }

  async findSessionByRefreshTokenHash(
    hash: string,
  ): Promise<AdminSession | null> {
    const result = await this.query<SessionRow>(
      'SELECT id, admin_id, access_token_hash, refresh_token_hash, access_expires_at, expires_at, revoked_at FROM admin_sessions WHERE refresh_token_hash = $1',
      [hash],
    );
    return result.rows[0] === undefined ? null : toSession(result.rows[0]);
  }

  async rotateSession(
    sessionId: string,
    input: {
      currentRefreshTokenHash: string;
      accessTokenHash: string;
      refreshTokenHash: string;
      accessExpiresAt: Date;
    },
  ): Promise<AdminSession | null> {
    const result = await this.query<SessionRow>(
      'UPDATE admin_sessions SET access_token_hash = $3, refresh_token_hash = $4, access_expires_at = $5, updated_at = NOW() WHERE id = $1 AND refresh_token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW() RETURNING id, admin_id, access_token_hash, refresh_token_hash, access_expires_at, expires_at, revoked_at',
      [
        sessionId,
        input.currentRefreshTokenHash,
        input.accessTokenHash,
        input.refreshTokenHash,
        input.accessExpiresAt,
      ],
    );
    return result.rows[0] === undefined ? null : toSession(result.rows[0]);
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<boolean> {
    const result = await this.query(
      'UPDATE admin_sessions SET revoked_at = $2, updated_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
      [sessionId, revokedAt],
    );
    return result.rowCount === 1;
  }

  async cleanupSessions(now: Date): Promise<number> {
    try {
      const result = await this.query(
        'DELETE FROM admin_sessions WHERE expires_at <= $1 OR (revoked_at IS NOT NULL AND revoked_at <= $1 - INTERVAL \'1 day\')',
        [now],
      );
      return result.rowCount ?? 0;
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to clean up authentication sessions.',
      );
    }
  }
}
