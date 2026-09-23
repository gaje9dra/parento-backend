import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const rawEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_NAME: z.string().min(1).default('parento-backend'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_BASE_PATH: z
    .string()
    .regex(/^\/api\/v\d+$/)
    .default('/api/v1'),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  DATABASE_SSL: booleanString.default(false),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_PRETTY: booleanString.default(false),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  CORS_CREDENTIALS: booleanString.default(false),
  JWT_ISSUER: z.string().min(1).optional(),
  JWT_AUDIENCE: z.string().min(1).optional(),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  REQUEST_BODY_LIMIT: z.string().min(1).default('100kb'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  TRUST_PROXY: booleanString.default(false),
  RATE_LIMIT_ENABLED: booleanString.default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(1000).default(10),
  REALTIME_ENABLED: booleanString.default(false),
  EXTERNAL_SERVICE_BASE_URLS: z.string().default(''),
});

const productionRequirements = (env: Record<string, unknown>) => {
  const issues: { path: string[]; message: string }[] = [];

  if (env.NODE_ENV === 'production') {
    if (typeof env.DATABASE_URL !== 'string' || env.DATABASE_URL.length === 0) {
      issues.push({
        path: ['DATABASE_URL'],
        message: 'Required in production.',
      });
    }
    if (
      typeof env.CORS_ORIGINS !== 'string' ||
      env.CORS_ORIGINS.trim().length === 0
    ) {
      issues.push({
        path: ['CORS_ORIGINS'],
        message: 'Required in production.',
      });
    }
    if (env.RATE_LIMIT_ENABLED !== 'true') {
      issues.push({
        path: ['RATE_LIMIT_ENABLED'],
        message: 'Authentication rate limiting must be enabled in production.',
      });
    }
  }

  return issues;
};

export class ConfigurationError extends Error {
  public readonly issues: ReadonlyArray<{ variable: string; message: string }>;

  constructor(issues: ReadonlyArray<{ variable: string; message: string }>) {
    super(
      'Invalid backend configuration: ' +
        issues.map((issue) => issue.variable + ': ' + issue.message).join('; '),
    );
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}

export interface AppConfig {
  readonly app: {
    readonly name: string;
    readonly environment: 'development' | 'test' | 'production';
  };
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly apiBasePath: string;
  };
  readonly database: {
    readonly url?: string;
    readonly poolMax: number;
    readonly idleTimeoutMs: number;
    readonly connectionTimeoutMs: number;
    readonly ssl: boolean;
  };
  readonly logging: {
    readonly level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    readonly pretty: boolean;
  };
  readonly cors: {
    readonly origins: readonly string[];
    readonly credentials: boolean;
  };
  readonly security: {
    readonly jwtIssuer?: string;
    readonly jwtAudience?: string;
    readonly accessTokenTtlSeconds: number;
    readonly sessionTtlSeconds: number;
    readonly requestBodyLimit: string;
    readonly requestTimeoutMs: number;
    readonly headersTimeoutMs: number;
    readonly keepAliveTimeoutMs: number;
    readonly trustProxy: boolean;
  };
  readonly rateLimit: {
    readonly enabled: boolean;
    readonly windowMs: number;
    readonly maxRequests: number;
  };
  readonly realtime: { readonly enabled: boolean };
  readonly externalServices: {
    readonly baseUrls: Readonly<Record<string, string>>;
  };
}

const parseOrigins = (value: string): string[] => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === '*') continue;

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ConfigurationError([
        {
          variable: 'CORS_ORIGINS',
          message: 'Origins must be valid HTTP(S) origins.',
        },
      ]);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigurationError([
        {
          variable: 'CORS_ORIGINS',
          message: 'Origins must use HTTP or HTTPS.',
        },
      ]);
    }

    if (
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== '' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      throw new ConfigurationError([
        {
          variable: 'CORS_ORIGINS',
          message: 'Origins must contain only scheme, host, and optional port.',
        },
      ]);
    }
  }

  return origins;
};

const validateRequestBodyLimit = (value: string): void => {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(value.trim());
  if (match === null) {
    throw new ConfigurationError([
      {
        variable: 'REQUEST_BODY_LIMIT',
        message: 'Expected a size such as 100kb or 1mb.',
      },
    ]);
  }

  const amountText = match[1];
  const unitText = match[2];
  if (amountText === undefined || unitText === undefined) {
    throw new ConfigurationError([
      {
        variable: 'REQUEST_BODY_LIMIT',
        message: 'Expected a size such as 100kb or 1mb.',
      },
    ]);
  }

  const amount = Number(amountText);
  const unit = unitText.toLowerCase();
  const multiplier =
    unit === 'b'
      ? 1
      : unit === 'kb'
        ? 1024
        : unit === 'mb'
          ? 1024 ** 2
          : 1024 ** 3;

  if (!Number.isFinite(amount) || amount * multiplier > 10 * 1024 * 1024) {
    throw new ConfigurationError([
      {
        variable: 'REQUEST_BODY_LIMIT',
        message: 'Request body limit must not exceed 10mb.',
      },
    ]);
  }
};

const parseExternalServices = (value: string): Record<string, string> => {
  if (value.trim() === '') return {};

  const result: Record<string, string> = {};
  for (const entry of value.split(',').map((item) => item.trim())) {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      throw new ConfigurationError([
        {
          variable: 'EXTERNAL_SERVICE_BASE_URLS',
          message: 'Expected comma-separated name=url entries.',
        },
      ]);
    }

    const name = entry.slice(0, separator).trim();
    const url = entry.slice(separator + 1).trim();

    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      throw new ConfigurationError([
        {
          variable: 'EXTERNAL_SERVICE_BASE_URLS',
          message: 'Service names must use letters, numbers, and underscores.',
        },
      ]);
    }

    if (!z.string().url().safeParse(url).success) {
      throw new ConfigurationError([
        {
          variable: 'EXTERNAL_SERVICE_BASE_URLS',
          message: 'Invalid service URL.',
        },
      ]);
    }

    result[name] = url;
  }

  return result;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (
    env.NODE_ENV === 'production' &&
    (env.CORS_ORIGINS === undefined || env.CORS_ORIGINS.trim() === '')
  ) {
    throw new ConfigurationError([
      {
        variable: 'CORS_ORIGINS',
        message: 'Required in production configuration.',
      },
    ]);
  }

  const parsed = rawEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => ({
        variable: issue.path.join('.') || 'environment',
        message: issue.message,
      })),
    );
  }

  if (parsed.data.DATABASE_URL !== undefined) {
    const databaseUrl = new URL(parsed.data.DATABASE_URL);
    if (
      databaseUrl.protocol !== 'postgres:' &&
      databaseUrl.protocol !== 'postgresql:'
    ) {
      throw new ConfigurationError([
        {
          variable: 'DATABASE_URL',
          message: 'Database URL must use PostgreSQL.',
        },
      ]);
    }
  }

  if (parsed.data.AUTH_ACCESS_TOKEN_TTL_SECONDS > parsed.data.SESSION_TTL_SECONDS) {
    throw new ConfigurationError([
      {
        variable: 'AUTH_ACCESS_TOKEN_TTL_SECONDS',
        message: 'Access-token lifetime cannot exceed session lifetime.',
      },
    ]);
  }

  const productionIssues = productionRequirements(parsed.data);
  if (productionIssues.length > 0) {
    throw new ConfigurationError(
      productionIssues.map((issue) => ({
        variable: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const corsOrigins = parseOrigins(parsed.data.CORS_ORIGINS);
  validateRequestBodyLimit(parsed.data.REQUEST_BODY_LIMIT);

  if (parsed.data.CORS_CREDENTIALS && corsOrigins.includes('*')) {
    throw new ConfigurationError([
      {
        variable: 'CORS_CREDENTIALS',
        message: 'Credentials cannot be enabled with a wildcard CORS origin.',
      },
    ]);
  }

  if (parsed.data.NODE_ENV === 'production') {
    if (corsOrigins.length === 0) {
      throw new ConfigurationError([
        {
          variable: 'CORS_ORIGINS',
          message: 'At least one explicit origin is required in production.',
        },
      ]);
    }

    if (corsOrigins.includes('*')) {
      throw new ConfigurationError([
        {
          variable: 'CORS_ORIGINS',
          message: 'Wildcard origin is not allowed in production.',
        },
      ]);
    }
  }

  return {
    app: {
      name: parsed.data.APP_NAME,
      environment: parsed.data.NODE_ENV,
    },
    server: {
      host: parsed.data.HOST,
      port: parsed.data.PORT,
      apiBasePath: parsed.data.API_BASE_PATH,
    },
    database: {
      ...(parsed.data.DATABASE_URL === undefined
        ? {}
        : { url: parsed.data.DATABASE_URL }),
      poolMax: parsed.data.DATABASE_POOL_MAX,
      idleTimeoutMs: parsed.data.DATABASE_IDLE_TIMEOUT_MS,
      connectionTimeoutMs: parsed.data.DATABASE_CONNECTION_TIMEOUT_MS,
      ssl: parsed.data.DATABASE_SSL,
    },
    logging: {
      level: parsed.data.LOG_LEVEL,
      pretty: parsed.data.LOG_PRETTY,
    },
    cors: {
      origins: corsOrigins,
      credentials: parsed.data.CORS_CREDENTIALS,
    },
    security: {
      ...(parsed.data.JWT_ISSUER === undefined
        ? {}
        : { jwtIssuer: parsed.data.JWT_ISSUER }),
      ...(parsed.data.JWT_AUDIENCE === undefined
        ? {}
        : { jwtAudience: parsed.data.JWT_AUDIENCE }),
      accessTokenTtlSeconds: parsed.data.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      sessionTtlSeconds: parsed.data.SESSION_TTL_SECONDS,
      requestBodyLimit: parsed.data.REQUEST_BODY_LIMIT,
      requestTimeoutMs: parsed.data.REQUEST_TIMEOUT_MS,
      headersTimeoutMs: parsed.data.HEADERS_TIMEOUT_MS,
      keepAliveTimeoutMs: parsed.data.KEEP_ALIVE_TIMEOUT_MS,
      trustProxy: parsed.data.TRUST_PROXY,
    },
    rateLimit: {
      enabled: parsed.data.RATE_LIMIT_ENABLED,
      windowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
      maxRequests: parsed.data.RATE_LIMIT_MAX_REQUESTS,
    },
    realtime: { enabled: parsed.data.REALTIME_ENABLED },
    externalServices: {
      baseUrls: parseExternalServices(parsed.data.EXTERNAL_SERVICE_BASE_URLS),
    },
  };
}
