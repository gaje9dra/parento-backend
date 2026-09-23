import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

describe('API foundation', () => {
  it('returns the standardized health response', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.body).toEqual({
      data: {
        status: 'ok',
        service: 'parento-backend',
        version: '1',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('returns the standardized readiness response', async () => {
    const response = await request(app).get('/api/v1/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        status: 'ready',
        service: 'parento-backend',
        version: '1',
        database: 'not_configured',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('returns 404 for an unknown route', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('returns 405 for a known route with an unsupported method', async () => {
    const response = await request(app).post('/api/v1/health');

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET, HEAD, OPTIONS');
    expect(response.body).toMatchObject({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'HTTP method is not allowed for this endpoint.',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('generates a request ID when none is supplied and preserves a safe incoming ID', async () => {
    const generated = await request(app).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toBeTruthy();

    const supplied = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'test-request-123');

    expect(supplied.headers['x-request-id']).toBe('test-request-123');
    expect(supplied.body.requestId).toBe('test-request-123');
  });

  it('rejects malformed JSON through the standardized error contract', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body contains invalid JSON.',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('rejects request bodies above the configured limit', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ payload: 'x'.repeat(120_000) }));

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      error: {
        code: 'REQUEST_TOO_LARGE',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('handles CORS for configured development origins', async () => {
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects disallowed CORS origins through the standard error contract', async () => {
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://not-allowed.invalid');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: 'AUTHORIZATION_DENIED',
        message: 'CORS origin is not allowed.',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('does not expose sensitive headers or request bodies through the API response', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Authorization', 'Bearer very-secret-token');

    expect(response.text).not.toContain('very-secret-token');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
    expect(response.headers['x-download-options']).toBe('noopen');
  });
});
