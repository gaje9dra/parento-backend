import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('error contract', () => {
  it('returns a stable not-found error without internals', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    });
    expect(response.body).not.toHaveProperty('stack');
  });
});
