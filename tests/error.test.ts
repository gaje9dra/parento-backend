import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { mapPostgresPersistenceError } from '../src/db/errors.js';
import { requestContext } from '../src/api/request-context.js';

describe('error contract', () => {
  it('maps PostgreSQL failures to stable persistence errors', () => {
    expect(
      mapPostgresPersistenceError({ code: '23505' }, 'fallback'),
    ).toMatchObject({
      code: 'CONFLICT',
      message: 'The resource already exists.',
    });
    expect(
      mapPostgresPersistenceError({ code: '23503' }, 'fallback'),
    ).toMatchObject({
      code: 'FOREIGN_KEY',
      message: 'The referenced resource does not exist.',
    });
    expect(
      mapPostgresPersistenceError({ code: '57P01' }, 'fallback'),
    ).toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database service is unavailable.',
    });
  });
  it('returns a stable not-found error without internals', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
      requestId: response.headers['x-request-id'],
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('sanitizes unexpected errors without exposing the original message or stack', async () => {
    const testApp = express();
    testApp.use(requestContext);
    testApp.get('/boom', () => {
      throw new Error('database password should never reach the client');
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error.',
    });
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.text).not.toContain('database password');
    expect(response.text).not.toContain('Error:');
    expect(response.text).not.toContain('at ');
  });
});
