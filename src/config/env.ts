import 'dotenv/config';
import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('parento-backend'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_BASE_PATH: z.string().regex(/^\/api\/v\d+$/).default('/api/v1'),
  DATABASE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: booleanString.default('false'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  CORS_CREDENTIALS: booleanString.default('false'),
  JWT_ISSUER: z.string().min(1).optional(),
  JWT_AUDIENCE: z.string().min(1).optional(),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  REQUEST_BODY_LIMIT: z.string().min(1).default('100kb'),
  TRUST_PROXY: booleanString.default('false'),
  RATE_LIMIT_ENABLED: booleanString.default('false'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  REALTIME_ENABLED: booleanString.default('false'),
  EXTERNAL_SERVICE_BASE_URLS: z.string().default(''),
});

const productionRequirements = (env: Record<string, unknown>) => {
  const issues: { path: string[]; message: string }[] = [];
  if (env.NODE_ENV === 'production') {
    if (typeof env.DATABASE_URL !== 'string' || env.DATABASE_URL.length === 0) issues.push({ path: ['DATABASE_URL'], message: 'Required in production.' });
    if (typeof env.CORS_ORIGINS !== 'string' || env.CORS_ORIGINS.trim().length === 0) issues.push({ path: ['CORS_ORIGINS'], message: 'Required in production.' });
    if (typeof env.JWT_ISSUER !== 'string' || env.JWT_ISSUER.length === 0) issues.push({ path: ['JWT_ISSUER'], message: 'Required in production configuration.' });
    if (typeof env.JWT_AUDIENCE !== 'string' || env.JWT_AUDIENCE.length === 0) issues.push({ path: ['JWT_AUDIENCE'], message: 'Required in production configuration.' });
  }
  return issues;
};

export class ConfigurationError extends Error {
  public readonly issues: ReadonlyArray<{ variable: string; message: string }>;
  constructor(issues: ReadonlyArray<{ variable: string; message: string }>) {
    super('Invalid backend configuration: ' + issues.map((issue) => issue.variable + ': ' + issue.message).join('; '));
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}

export interface AppConfig {
  readonly app: { readonly name: string; readonly environment: 'development' | 'test' | 'production' };
  readonly server: { readonly host: string; readonly port: number; readonly apiBasePath: string };
  readonly database: { readonly url?: string };
  readonly logging: { readonly level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'; readonly pretty: boolean };
  readonly cors: { readonly origins: readonly string[]; readonly credentials: boolean };
  readonly security: { readonly jwtIssuer?: string; readonly jwtAudience?: string; readonly accessTokenTtlSeconds: number; readonly sessionTtlSeconds: number; readonly requestBodyLimit: string; readonly trustProxy: boolean };
  readonly rateLimit: { readonly enabled: boolean; readonly windowMs: number; readonly maxRequests: number };
  readonly realtime: { readonly enabled: boolean };
  readonly externalServices: { readonly baseUrls: Readonly<Record<string, string>> };
};

const parseOrigins = (value: string): string[] => value.split(',').map((origin) => origin.trim()).filter(Boolean);

const parseExternalServices = (value: string): Record<string, string> => {
  if (value.trim() === '') return {};
  const result: Record<string, string> = {};
  for (const entry of value.split(',').map((item) => item.trim())) {
    const separator = entry.indexOf('=');
    if (separator <= 0) throw new ConfigurationError([{ variable: 'EXTERNAL_SERVICE_BASE_URLS', message: 'Expected comma-separated name=url entries.' }]);
    const name = entry.slice(0, separator).trim();
    const url = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new ConfigurationError([{ variable: 'EXTERNAL_SERVICE_BASE_URLS', message: 'Service names must use letters, numbers, and underscores.' }]);
    if (!z.string().url().safeParse(url).success) throw new ConfigurationError([{ variable: 'EXTERNAL_SERVICE_BASE_URLS', message: 'Invalid service URL.' }]);
    result[name] = url;
  }
  return result;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawEnvSchema.safeParse(env);
  if (!parsed.success) throw new ConfigurationError(parsed.error.issues.map((issue) => ({ variable: issue.path.join('.') || 'environment', message: issue.message })));
  const productionIssues = productionRequirements(parsed.data);
  if (productionIssues.length > 0) throw new ConfigurationError(productionIssues.map((issue) => ({ variable: issue.path.join('.'), message: issue.message })));
  const corsOrigins = parseOrigins(parsed.data.CORS_ORIGINS);
  if (parsed.data.NODE_ENV === 'production' && corsOrigins.length === 0) throw new ConfigurationError([{ variable: 'CORS_ORIGINS', message: 'At least one explicit origin is required in production.' }]);
  return {
    app: { name: parsed.data.APP_NAME, environment: parsed.data.NODE_ENV },
    server: { host: parsed.data.HOST, port: parsed.data.PORT, apiBasePath: parsed.data.API_BASE_PATH },
    database: parsed.data.DATABASE_URL === undefined ? {} : { url: parsed.data.DATABASE_URL },
    logging: { level: parsed.data.LOG_LEVEL, pretty: parsed.data.LOG_PRETTY },
    cors: { origins: corsOrigins, credentials: parsed.data.CORS_CREDENTIALS },
    security: {
      ...(parsed.data.JWT_ISSUER === undefined ? {} : { jwtIssuer: parsed.data.JWT_ISSUER }),
      ...(parsed.data.JWT_AUDIENCE === undefined ? {} : { jwtAudience: parsed.data.JWT_AUDIENCE }),
      accessTokenTtlSeconds: parsed.data.JWT_ACCESS_TOKEN_TTL_SECONDS, sessionTtlSeconds: parsed.data.SESSION_TTL_SECONDS,
      requestBodyLimit: parsed.data.REQUEST_BODY_LIMIT, trustProxy: parsed.data.TRUST_PROXY,
    },
    rateLimit: { enabled: parsed.data.RATE_LIMIT_ENABLED, windowMs: parsed.data.RATE_LIMIT_WINDOW_MS, maxRequests: parsed.data.RATE_LIMIT_MAX_REQUESTS },
    realtime: { enabled: parsed.data.REALTIME_ENABLED },
    externalServices: { baseUrls: parseExternalServices(parsed.data.EXTERNAL_SERVICE_BASE_URLS) },
  };
}