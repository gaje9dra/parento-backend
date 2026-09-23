import express, { type RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import { apiRouter } from './routes/index.js';
import { logger } from './logging/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestContext } from './api/request-context.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();

const corsMiddleware: RequestHandler = (req, res, next) => {
  const requestOrigin = req.header('origin');
  if (requestOrigin === undefined) {
    next();
    return;
  }

  const originAllowed =
    config.app.environment !== 'production'
      ? config.cors.origins.includes(requestOrigin) || config.cors.origins.includes('*')
      : config.cors.origins.includes(requestOrigin);

  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
    if (config.cors.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    if (!originAllowed) {
      res.status(403).end();
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
    res.status(204).end();
    return;
  }

  next();
};

const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
};

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.security.trustProxy);
app.use(requestContext);
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(express.json({ limit: config.security.requestBodyLimit }));
app.use(
  pinoHttp({
    logger,
    autoLogging: true,
    redact: { req: { headers: ['authorization', 'cookie'] } },
  }),
);

app.use(apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
