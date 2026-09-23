import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type {
  AdminAuthenticationRecord,
  AdminSession,
} from '../src/domain/admin-authentication.js';
import type { AdminAuthenticationRepository } from '../src/repositories/admin-authentication-repository.js';
import { PasswordHasher } from '../src/auth/password.js';
import { hashOpaqueToken } from '../src/auth/token.js';
import { AdminAuthenticationService } from '../src/services/admin-authentication-service.js';
import { createAdminAuthRouter } from '../src/routes/v1/admin-auth.routes.js';

class FakePasswordHasher extends PasswordHasher {
  override async hash(password: string): Promise<string> {
    return `test-hash:${password}`;
  }

  override async verify(
    password: string,
    encodedHash: string,
  ): Promise<boolean> {
    return encodedHash === `test-hash:${password}`;
  }
}

class FakeAdminAuthRepository implements AdminAuthenticationRepository {
  readonly admins = new Map<string, AdminAuthenticationRecord>();
  readonly sessions = new Map<string, AdminSession>();

  async findAuthenticationRecordByEmail(email: string) {
    return (
      [...this.admins.values()].find(
        (admin) => admin.email.toLowerCase() === email.toLowerCase(),
      ) ?? null
    );
  }

  async findAuthenticationRecordById(id: string) {
    return this.admins.get(id) ?? null;
  }

  async setPasswordHash(adminId: string, passwordHash: string) {
    const admin = this.admins.get(adminId);
    if (admin === undefined) return false;
    this.admins.set(adminId, { ...admin, passwordHash });
    return true;
  }

  async updateLastAuthenticatedAt(
    adminId: string,
    authenticatedAt: Date,
  ) {
    const admin = this.admins.get(adminId);
    if (admin === undefined) return false;
    this.admins.set(adminId, {
      ...admin,
      lastAuthenticatedAt: authenticatedAt,
    });
    return true;
  }

  async createSession(input: {
    id: string;
    adminId: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    accessExpiresAt: Date;
    expiresAt: Date;
  }) {
    const session: AdminSession = { ...input, revokedAt: null };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessionByAccessTokenHash(hash: string) {
    return (
      [...this.sessions.values()].find(
        (session) => session.accessTokenHash === hash,
      ) ?? null
    );
  }

  async findSessionByRefreshTokenHash(hash: string) {
    return (
      [...this.sessions.values()].find(
        (session) => session.refreshTokenHash === hash,
      ) ?? null
    );
  }

  async rotateSession(
    sessionId: string,
    input: {
      currentRefreshTokenHash: string;
      accessTokenHash: string;
      refreshTokenHash: string;
      accessExpiresAt: Date;
    },
  ) {
    const session = this.sessions.get(sessionId);
    if (
      session === undefined ||
      session.refreshTokenHash !== input.currentRefreshTokenHash ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    const rotated = {
      ...session,
      accessTokenHash: input.accessTokenHash,
      refreshTokenHash: input.refreshTokenHash,
      accessExpiresAt: input.accessExpiresAt,
    };
    this.sessions.set(sessionId, rotated);
    return rotated;
  }

  async revokeSession(sessionId: string, revokedAt: Date) {
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.revokedAt !== null) return false;
    this.sessions.set(sessionId, { ...session, revokedAt });
    return true;
  }
}

const createFixture = (rateLimit = { enabled: false, windowMs: 60_000, maxRequests: 10 }) => {
  const repository = new FakeAdminAuthRepository();
  repository.admins.set('admin-1', {
    id: 'admin-1',
    email: 'admin@example.com',
    status: 'ACTIVE',
    passwordHash: 'test-hash:correct horse battery staple',
    lastAuthenticatedAt: null,
  });
  repository.admins.set('admin-2', {
    id: 'admin-2',
    email: 'disabled@example.com',
    status: 'DISABLED',
    passwordHash: 'test-hash:correct horse battery staple',
    lastAuthenticatedAt: null,
  });

  const service = new AdminAuthenticationService(
    repository,
    new FakePasswordHasher(),
    900,
    3600,
  );

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.requestId = 'test-request';
    next();
  });
  app.use('/api/v1', createAdminAuthRouter(service, rateLimit));

  return { repository, service, app };
};

describe('Phase 3.1 admin authentication', () => {
  it('authenticates valid active-admin credentials without returning password hashes', async () => {
    const { app } = createFixture();

    const response = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'ADMIN@example.com',
        password: 'correct horse battery staple',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.admin).toEqual({
      id: 'admin-1',
      email: 'admin@example.com',
      status: 'ACTIVE',
      lastAuthenticatedAt: expect.any(String),
    });
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.admin.passwordHash).toBeUndefined();
  });

  it('uses the same credential failure contract for unknown and wrong-password accounts', async () => {
    const { app } = createFixture();

    const unknown = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({ email: 'missing@example.com', password: 'wrong administrator password' });

    const wrong = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'admin@example.com',
        password: 'wrong administrator password',
      });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rejects disabled administrators', async () => {
    const { app } = createFixture();

    const response = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'disabled@example.com',
        password: 'correct horse battery staple',
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('protects the current-admin endpoint and supports logout revocation', async () => {
    const { app } = createFixture();
    const login = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'admin@example.com',
        password: 'correct horse battery staple',
      });
    const token = login.body.data.accessToken as string;

    const current = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', `Bearer ${token}`);
    expect(current.status).toBe(200);
    expect(current.body.data.admin.id).toBe('admin-1');

    const logout = await request(app)
      .post('/api/v1/auth/admin/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(204);

    const afterLogout = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', `Bearer ${token}`);
    expect(afterLogout.status).toBe(401);
  });

  it('rotates refresh credentials and rejects refresh-token replay', async () => {
    const { app } = createFixture();
    const login = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'admin@example.com',
        password: 'correct horse battery staple',
      });
    const refreshToken = login.body.data.refreshToken as string;

    const refreshed = await request(app)
      .post('/api/v1/auth/admin/refresh')
      .send({ refreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.refreshToken).not.toBe(refreshToken);

    const replay = await request(app)
      .post('/api/v1/auth/admin/refresh')
      .send({ refreshToken });
    expect(replay.status).toBe(401);
  });

  it('rejects missing or malformed authorization credentials', async () => {
    const { app } = createFixture();

    const missing = await request(app).get('/api/v1/auth/admin/me');
    expect(missing.status).toBe(401);

    const malformed = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', 'Basic secret');
    expect(malformed.status).toBe(401);
  });


  it('rejects unexpected authentication request fields', async () => {
    const { app } = createFixture();

    const response = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'admin@example.com',
        password: 'correct horse battery staple',
        adminId: 'admin-2',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('applies the configured authentication rate limit by network peer', async () => {
    const { app } = createFixture({
      enabled: true,
      windowMs: 60_000,
      maxRequests: 2,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: 'admin@example.com',
          password: 'wrong administrator password',
        });
      expect(response.status).toBe(401);
    }

    const limited = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'admin@example.com',
        password: 'wrong administrator password',
      });

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.error.message).not.toContain('admin@example.com');
  });

  it('stores only token hashes in session persistence', async () => {
    const { repository, service } = createFixture();
    const result = await service.login(
      'admin@example.com',
      'correct horse battery staple',
    );
    const session = [...repository.sessions.values()][0]!;

    expect(session.accessTokenHash).toBe(
      hashOpaqueToken(result.tokens.accessToken),
    );
    expect(session.refreshTokenHash).toBe(
      hashOpaqueToken(result.tokens.refreshToken),
    );
    expect(session.accessTokenHash).not.toBe(result.tokens.accessToken);
    expect(session.refreshTokenHash).not.toBe(result.tokens.refreshToken);
  });
});

describe('PasswordHasher', () => {
  it('hashes with a unique salt and verifies without storing plaintext', async () => {
    const hasher = new PasswordHasher();
    const first = await hasher.hash(
      'a sufficiently long administrator password',
    );
    const second = await hasher.hash(
      'a sufficiently long administrator password',
    );

    expect(first).not.toBe(second);
    expect(first).not.toContain('a sufficiently long administrator password');
    expect(
      await hasher.verify(
        'a sufficiently long administrator password',
        first,
      ),
    ).toBe(true);
    expect(await hasher.verify('wrong administrator password', first)).toBe(false);
  });

  it('rejects passwords outside the configured length policy', async () => {
    const hasher = new PasswordHasher();
    await expect(hasher.hash('short')).rejects.toThrow(/between 15 and 256/);
    await expect(hasher.hash('x'.repeat(257))).rejects.toThrow(/between 15 and 256/);
  });
});
