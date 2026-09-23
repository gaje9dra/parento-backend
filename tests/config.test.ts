import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from '../src/config/env.js';

const validEnvironment = {
  NODE_ENV: 'test',
  APP_NAME: 'parento-backend-test',
  HOST: '127.0.0.1',
  PORT: '3100',
  API_BASE_PATH: '/api/v1',
  LOG_LEVEL: 'info',
  LOG_PRETTY: 'false',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:3000',
  CORS_CREDENTIALS: 'false',
  JWT_ACCESS_TOKEN_TTL_SECONDS: '900',
  SESSION_TTL_SECONDS: '86400',
  REQUEST_BODY_LIMIT: '100kb',
  TRUST_PROXY: 'false',
  RATE_LIMIT_ENABLED: 'false',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX_REQUESTS: '100',
  REALTIME_ENABLED: 'false',
  EXTERNAL_SERVICE_BASE_URLS: '',
};

describe('configuration', () => {
  it('accepts valid configuration and builds categorized settings', () => {
    const config = loadConfig(validEnvironment);
    expect(config.app.environment).toBe('test');
    expect(config.server.apiBasePath).toBe('/api/v1');
    expect(config.cors.origins).toEqual(['http://localhost:5173', 'http://localhost:3000']);
    expect(config.rateLimit.enabled).toBe(false);
  });

  it('rejects invalid configuration with variable names but no secret values', () => {
    expect(() => loadConfig({ ...validEnvironment, PORT: 'not-a-port' })).toThrowError(/PORT/);

    try {
      loadConfig({
        ...validEnvironment,
        PORT: 'not-a-port',
        DATABASE_URL: 'super-secret-password',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(String(error)).not.toContain('super-secret-password');
    }
  });

  it('requires explicit production security configuration', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        NODE_ENV: 'production',
        DATABASE_URL: 'https://database.invalid/connection',
      }),
    ).toThrowError(/JWT_ISSUER/);
  });

  it('rejects malformed external-service configuration', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, EXTERNAL_SERVICE_BASE_URLS: 'payments=not-a-url' }),
    ).toThrowError(/EXTERNAL_SERVICE_BASE_URLS/);
  });
});
