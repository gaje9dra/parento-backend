import { randomUUID } from 'node:crypto';
import type { AdminAuthenticationRecord } from '../domain/admin-authentication.js';
import type { AdminAuthenticationRepository } from '../repositories/admin-authentication-repository.js';
import { PasswordHasher } from '../auth/password.js';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/token.js';

export class AuthenticationFailure extends Error {
  constructor() {
    super('Invalid administrator credentials.');
    this.name = 'AuthenticationFailure';
  }
}

export class SessionFailure extends Error {
  constructor() {
    super('Authentication session is invalid or expired.');
    this.name = 'SessionFailure';
  }
}

export interface AuthenticationTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: Date;
  readonly expiresAt: Date;
}

const DUMMY_PASSWORD = 'Parento authentication timing placeholder';

export class AdminAuthenticationService {
  constructor(
    private readonly repository: AdminAuthenticationRepository,
    private readonly passwordHasher = new PasswordHasher(),
    private readonly accessTokenTtlSeconds = 900,
    private readonly sessionTtlSeconds = 86400,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{
    readonly admin: AdminAuthenticationRecord;
    readonly tokens: AuthenticationTokens;
  }> {
    await this.repository.cleanupSessions(new Date());

    const normalizedEmail = email.trim().toLowerCase();
    const record =
      await this.repository.findAuthenticationRecordByEmail(normalizedEmail);

    let passwordValid = false;
    if (record !== null && record.passwordHash !== null) {
      passwordValid = await this.passwordHasher.verify(
        password,
        record.passwordHash,
      );
    } else {
      await this.passwordHasher.hash(DUMMY_PASSWORD);
    }

    if (record === null || !passwordValid || record.status !== 'ACTIVE') {
      throw new AuthenticationFailure();
    }

    const now = new Date();
    const accessExpiresAt = new Date(
      now.getTime() + this.accessTokenTtlSeconds * 1000,
    );
    const expiresAt = new Date(now.getTime() + this.sessionTtlSeconds * 1000);
    const accessToken = generateOpaqueToken();
    const refreshToken = generateOpaqueToken();

    const session = await this.repository.createSession({
      id: randomUUID(),
      adminId: record.id,
      accessTokenHash: hashOpaqueToken(accessToken),
      refreshTokenHash: hashOpaqueToken(refreshToken),
      accessExpiresAt,
      expiresAt,
    });

    await this.repository.updateLastAuthenticatedAt(record.id, now);

    return {
      admin: { ...record, lastAuthenticatedAt: now },
      tokens: {
        accessToken,
        refreshToken,
        accessExpiresAt: session.accessExpiresAt,
        expiresAt: session.expiresAt,
      },
    };
  }

  async authenticateAccessToken(
    token: string,
  ): Promise<AdminAuthenticationRecord> {
    const session = await this.repository.findSessionByAccessTokenHash(
      hashOpaqueToken(token),
    );

    if (
      session === null ||
      session.revokedAt !== null ||
      session.accessExpiresAt.getTime() <= Date.now() ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new SessionFailure();
    }

    const admin = await this.repository.findAuthenticationRecordById(
      session.adminId,
    );

    if (
      admin === null ||
      admin.status !== 'ACTIVE' ||
      admin.passwordHash === null
    ) {
      throw new SessionFailure();
    }

    return admin;
  }

  async refresh(refreshToken: string): Promise<AuthenticationTokens> {
    await this.repository.cleanupSessions(new Date());

    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const session =
      await this.repository.findSessionByRefreshTokenHash(refreshTokenHash);

    if (
      session === null ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new SessionFailure();
    }

    const admin = await this.repository.findAuthenticationRecordById(
      session.adminId,
    );

    if (admin === null || admin.status !== 'ACTIVE') {
      throw new SessionFailure();
    }

    const accessToken = generateOpaqueToken();
    const nextRefreshToken = generateOpaqueToken();
    const accessExpiresAt = new Date(
      Math.min(
        Date.now() + this.accessTokenTtlSeconds * 1000,
        session.expiresAt.getTime(),
      ),
    );
    const rotated = await this.repository.rotateSession(session.id, {
      currentRefreshTokenHash: refreshTokenHash,
      accessTokenHash: hashOpaqueToken(accessToken),
      refreshTokenHash: hashOpaqueToken(nextRefreshToken),
      accessExpiresAt,
    });

    if (rotated === null) throw new SessionFailure();

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      accessExpiresAt: rotated.accessExpiresAt,
      expiresAt: rotated.expiresAt,
    };
  }

  async logout(accessToken: string): Promise<void> {
    const session = await this.repository.findSessionByAccessTokenHash(
      hashOpaqueToken(accessToken),
    );
    if (session === null || session.revokedAt !== null) return;
    await this.repository.revokeSession(session.id, new Date());
  }
}
