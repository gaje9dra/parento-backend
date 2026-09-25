import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateOpaqueToken, hashOpaqueToken } from '../src/auth/token.js';
import { app, database } from '../src/app.js';
import { resetMigrations, runMigrations } from '../src/db/migrate.js';
import { PostgresAdminRepository } from '../src/repositories/postgres-admin-repository.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('Phase 5.1 enrollment API', () => {
  const admins = new PostgresAdminRepository(database);

  beforeAll(async () => {
    await resetMigrations(database);
    await runMigrations(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('rejects enrollment creation without administrator authentication', async () => {
    const response = await request(app).post('/api/v1/devices/enrollments');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('creates an owned enrollment and prevents another administrator from reading it', async () => {
    const owner = await admins.create({
      id: randomUUID(),
      email: 'enrollment-api-owner@example.com',
      displayName: 'Owner',
    });
    const otherAdmin = await admins.create({
      id: randomUUID(),
      email: 'enrollment-api-other@example.com',
      displayName: 'Other',
    });

    const ownerToken = generateOpaqueToken();
    const otherToken = generateOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000);

    await admins.createSession({
      id: randomUUID(),
      adminId: owner.id,
      accessTokenHash: hashOpaqueToken(ownerToken),
      refreshTokenHash: hashOpaqueToken(generateOpaqueToken()),
      accessExpiresAt: expiresAt,
      expiresAt,
    });
    await admins.createSession({
      id: randomUUID(),
      adminId: otherAdmin.id,
      accessTokenHash: hashOpaqueToken(otherToken),
      refreshTokenHash: hashOpaqueToken(generateOpaqueToken()),
      accessExpiresAt: expiresAt,
      expiresAt,
    });

    const created = await request(app)
      .post('/api/v1/devices/enrollments')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(created.status).toBe(201);
    expect(created.body.data.authorizationSecret).toHaveLength(43);

    const enrollmentId = created.body.data.enrollment.id as string;

    const ownStatus = await request(app)
      .get(`/api/v1/devices/enrollments/${enrollmentId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownStatus.status).toBe(200);
    expect(ownStatus.body.data.enrollment.id).toBe(enrollmentId);

    const foreignStatus = await request(app)
      .get(`/api/v1/devices/enrollments/${enrollmentId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(foreignStatus.status).toBe(404);
    expect(foreignStatus.body.error.code).toBe('ENROLLMENT_NOT_FOUND');
  });

  it('rejects malformed enrollment consumption without touching persistence', async () => {
    const response = await request(app)
      .post(`/api/v1/devices/enrollments/${randomUUID()}/consume`)
      .send({
        authorizationSecret: 'invalid',
        localInstallationIdentity: 'x',
        name: '',
        platform: 'android',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });
});
