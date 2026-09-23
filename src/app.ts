import express, { type RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { createApiRouter } from './routes/index.js';
import { logger } from './logging/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestContext } from './api/request-context.js';
import { loadConfig } from './config/env.js';
import { AppError } from './types/errors.js';
import { createDatabase } from './db/index.js';

const config = loadConfig();
export const database = createDatabase(config);

const corsMiddleware: RequestHandler = (req, res, next) => {
  const requestOrigin = req.header('origin');
  if (requestOrigin === undefined) {
    next();
    return;
  }

  const originAllowed =
    config.app.environment !== 'production'
      ? config.cors.origins.includes(requestOrigin) ||
        config.cors.origins.includes('*')
      : config.cors.origins.includes(requestOrigin);

  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
    if (config.cors.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  if (req.method === 'OPTIONS') {
    if (!originAllowed) {
      next(
        new AppError(
          403,
          'AUTHORIZATION_DENIED',
          'CORS origin is not allowed.',
        ),
      );
      return;
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Request-Id',
    );
    res.status(204).end();
    return;
  }

  next();
};

const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  next();
};

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.security.trustProxy);

app.use(
  pinoHttp({
    logger,
    autoLogging: true,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' &&
        /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)
        ? incoming
        : randomUUID();
    },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  }),
);

app.use(requestContext);
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(express.json({ limit: config.security.requestBodyLimit }));

app.use(
  createApiRouter(config.server.apiBasePath, database, config.security),
);
app.use(notFoundHandler);
app.use(errorHandler);
