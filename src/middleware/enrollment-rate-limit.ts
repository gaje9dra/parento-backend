import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

export const createEnrollmentVerificationRateLimiter = (input: {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
}): RequestHandler | undefined => {
  if (!input.enabled) return undefined;

  return rateLimit({
    windowMs: input.windowMs,
    limit: input.maxRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: 'enrollment-verification',
    keyGenerator: (req) =>
      req.ip ?? req.socket.remoteAddress ?? 'unknown-client',
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message:
            'Too many enrollment verification attempts. Please try again later.',
        },
        requestId: res.locals.requestId,
      });
    },
  });
};
