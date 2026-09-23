import type {
  AdminAuthenticationRecord,
  AdminSession,
} from '../domain/admin-authentication.js';

export interface AdminAuthenticationRepository {
  findAuthenticationRecordByEmail(
    email: string,
  ): Promise<AdminAuthenticationRecord | null>;
  findAuthenticationRecordById(
    id: string,
  ): Promise<AdminAuthenticationRecord | null>;
  setPasswordHash(adminId: string, passwordHash: string): Promise<boolean>;
  updateLastAuthenticatedAt(
    adminId: string,
    authenticatedAt: Date,
  ): Promise<boolean>;
  createSession(input: {
    id: string;
    adminId: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    accessExpiresAt: Date;
    expiresAt: Date;
  }): Promise<AdminSession>;
  findSessionByAccessTokenHash(hash: string): Promise<AdminSession | null>;
  findSessionByRefreshTokenHash(hash: string): Promise<AdminSession | null>;
  rotateSession(
    sessionId: string,
    input: {
      currentRefreshTokenHash: string;
      accessTokenHash: string;
      refreshTokenHash: string;
      accessExpiresAt: Date;
    },
  ): Promise<AdminSession | null>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<boolean>;
}
