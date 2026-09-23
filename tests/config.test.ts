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
    expect(config.cors.origins).toEqual([
      'http://localhost:5173',
      'http://localhost:3000',
    ]);
    expect(config.rateLimit.enabled).toBe(false);
    expect(config.security.requestTimeoutMs).toBe(120000);
    expect(config.security.headersTimeoutMs).toBe(15000);
    expect(config.security.keepAliveTimeoutMs).toBe(5000);
  });

  it('rejects invalid configuration with variable names but no secret values', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, PORT: 'not-a-port' }),
    ).toThrowError(/PORT/);

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

  it('requires explicit production CORS configuration', () => {
    const withoutCors = Object.fromEntries(
      Object.entries(validEnvironment).filter(
        ([key]) => key !== 'CORS_ORIGINS',
      ),
    );
    expect(() =>
      loadConfig({
        ...withoutCors,
        NODE_ENV: 'production',
        DATABASE_URL: 'https://database.invalid/connection',
        JWT_ISSUER: 'https://issuer.invalid',
        JWT_AUDIENCE: 'parento',
      }),
    ).toThrowError(/CORS_ORIGINS/);
  });

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        NODE_ENV: 'production',
        DATABASE_URL: 'https://database.invalid/connection',
        CORS_ORIGINS: '*',
        JWT_ISSUER: 'https://issuer.invalid',
        JWT_AUDIENCE: 'parento',
      }),
    ).toThrowError(/CORS_ORIGINS/);
  });

  it('rejects wildcard CORS when credentials are enabled', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        CORS_ORIGINS: '*',
        CORS_CREDENTIALS: 'true',
      }),
    ).toThrowError(/CORS_CREDENTIALS/);
  });

  it('accepts PostgreSQL database configuration and pool settings', () => {
    const config = loadConfig({
      ...validEnvironment,
      DATABASE_URL: 'postgresql://user:password@localhost:5432/parento',
      DATABASE_POOL_MAX: '12',
      DATABASE_IDLE_TIMEOUT_MS: '15000',
      DATABASE_CONNECTION_TIMEOUT_MS: '7000',
      DATABASE_SSL: 'true',
    });

    expect(config.database.url).toBe(
      'postgresql://user:password@localhost:5432/parento',
    );
    expect(config.database.poolMax).toBe(12);
    expect(config.database.idleTimeoutMs).toBe(15000);
    expect(config.database.connectionTimeoutMs).toBe(7000);
    expect(config.database.ssl).toBe(true);
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        DATABASE_URL: 'https://example.invalid/database',
      }),
    ).toThrowError(/DATABASE_URL/);
  });

  it('rejects an unsafe database pool size', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        DATABASE_POOL_MAX: '51',
      }),
    ).toThrowError(/DATABASE_POOL_MAX/);
  });

  it('rejects malformed CORS origins', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        CORS_ORIGINS: 'https://allowed.invalid/path',
      }),
    ).toThrowError(/CORS_ORIGINS/);
  });

  it('rejects oversized request-body configuration', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        REQUEST_BODY_LIMIT: '20mb',
      }),
    ).toThrowError(/REQUEST_BODY_LIMIT/);
  });

  it('rejects malformed request-body limits', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        REQUEST_BODY_LIMIT: 'unlimited',
      }),
    ).toThrowError(/REQUEST_BODY_LIMIT/);
  });

  it('rejects invalid timeout configuration', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        REQUEST_TIMEOUT_MS: '0',
      }),
    ).toThrowError(/REQUEST_TIMEOUT_MS/);
  });

  it('rejects malformed external-service configuration', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        EXTERNAL_SERVICE_BASE_URLS: 'payments=not-a-url',
      }),
    ).toThrowError(/EXTERNAL_SERVICE_BASE_URLS/);
  });
});
