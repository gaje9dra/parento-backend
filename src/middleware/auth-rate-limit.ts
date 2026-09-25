import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../config/env.js';

export const createAuthenticationRateLimiter = (
  config: AppConfig['rateLimit'],
): RequestHandler | undefined => {
  if (!config.enabled) return undefined;

  return rateLimit({
    windowMs: config.windowMs,
    limit: config.maxRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: 'admin-authentication',
    keyGenerator: (req) =>
      ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown-client'),
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts. Please try again later.',
        },
        requestId: res.locals.requestId,
      });
    },
  });
};
