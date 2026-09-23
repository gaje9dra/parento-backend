export interface AdminAuthenticationRecord {
  readonly id: string;
  readonly email: string;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly passwordHash: string | null;
  readonly lastAuthenticatedAt: Date | null;
}

export interface AdminSession {
  readonly id: string;
  readonly adminId: string;
  readonly accessTokenHash: string;
  readonly refreshTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}
