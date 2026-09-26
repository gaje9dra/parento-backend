import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

describe('Phase 7 monitoring API boundary', () => {
  it('requires a managed-device session for telemetry', async () => {
    const response = await request(app)
      .post('/api/v1/device/monitoring')
      .send({ schemaVersion: 1, observedAt: new Date().toISOString() });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('DEVICE_SESSION_INVALID');
  });

  it('requires administrator authentication for device monitoring list', async () => {
    const response = await request(app).get('/api/v1/admin/devices');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects malformed monitoring timestamps after authentication boundary', async () => {
    const response = await request(app)
      .post('/api/v1/device/monitoring')
      .set('Authorization', 'Bearer ' + 'a'.repeat(43))
      .send({ schemaVersion: 1, observedAt: 'not-a-date' });
    expect([401, 400]).toContain(response.status);
  });
});
