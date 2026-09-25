import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

describe('Phase 5.1 enrollment API boundary', () => {
  it('rejects enrollment creation without administrator authentication', async () => {
    const response = await request(app).post('/api/v1/devices/enrollments');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects malformed enrollment consumption before persistence', async () => {
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
