import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

export const createDeviceCommunicationRateLimiter = (input: {
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
    identifier: 'device-communication',
    keyGenerator: (req) =>
      ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown-client'),
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message:
            'Too many device communication requests. Please try again later.',
        },
        requestId: res.locals.requestId,
      }),
  });
};
