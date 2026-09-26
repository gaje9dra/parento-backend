import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

export const createApplicationManagementRateLimiter = (input: {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  identifier: string;
}): RequestHandler | undefined => {
  if (!input.enabled) return undefined;
  return rateLimit({
    windowMs: input.windowMs,
    limit: input.maxRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: input.identifier,
    keyGenerator: (req) =>
      ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown-client'),
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message:
            'Too many application-management requests. Please try again later.',
        },
        requestId: res.locals.requestId,
      }),
  });
};
