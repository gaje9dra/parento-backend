import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('error contract', () => {
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

it('sanitizes unexpected errors without exposing the original message or stack', async () => {
  const testApp = express();
  testApp.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    requestContext(req, res, next);
  });
  testApp.get('/boom', () => {
    throw new Error('database password should never reach the client');
  });
  testApp.use(errorHandler);

  const response = await request(testApp).get('/boom');

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error.',
    },
    requestId: response.body.requestId,
  });
  expect(response.text).not.toContain('database password');
  expect(response.text).not.toContain('Error:');
  expect(response.text).not.toContain('at ');
});
    expect(response.body).not.toHaveProperty('stack');
  });
});
