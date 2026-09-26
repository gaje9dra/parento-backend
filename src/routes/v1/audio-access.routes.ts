import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { AudioAccessService } from '../../services/audio-access-service.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import { createAudioAccessController } from '../../controllers/audio-access.controller.js';
import { createAudioAccessRateLimiter } from '../../middleware/audio-access-rate-limit.js';

const methodNotAllowed =
  (allow: string): RequestHandler =>
  (_req, res) => {
    res.setHeader('Allow', allow);
    res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'HTTP method is not allowed for this endpoint.',
      },
      requestId: res.locals.requestId,
    });
  };

export const createAudioAccessRouter = (
  authentication: AdminAuthenticationService,
  service: AudioAccessService,
  sessions: DeviceConnectionSessionRepository,
  rateLimitConfig: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const controller = createAudioAccessController(service);
  const adminAuth = requireAdminAuthentication(authentication);
  const limiter = createAudioAccessRateLimiter({
    enabled: rateLimitConfig.enabled,
    windowMs: rateLimitConfig.windowMs,
    maxRequests: rateLimitConfig.maxRequests,
  });
  const limited = limiter === undefined ? [] : [limiter];

  router.post(
    '/devices/:deviceId/audio-sessions',
    ...limited,
    adminAuth,
    requireAdminAuthorization,
    controller.create,
  );
  router.get(
    '/audio-sessions/:sessionId',
    ...limited,
    adminAuth,
    requireAdminAuthorization,
    controller.get,
  );
  router.post(
    '/audio-sessions/:sessionId/stop',
    ...limited,
    adminAuth,
    requireAdminAuthorization,
    controller.stop,
  );
  router.post(
    '/device/audio-sessions/:sessionId/started',
    ...limited,
    requireDeviceSession(sessions),
    controller.started,
  );
  router.post(
    '/device/audio-sessions/:sessionId/stopped',
    ...limited,
    requireDeviceSession(sessions),
    controller.stopped,
  );

  router.all(
    '/devices/:deviceId/audio-sessions',
    methodNotAllowed('POST, OPTIONS'),
  );
  router.all('/audio-sessions/:sessionId', methodNotAllowed('GET, OPTIONS'));
  router.all(
    '/audio-sessions/:sessionId/stop',
    methodNotAllowed('POST, OPTIONS'),
  );
  router.all(
    '/device/audio-sessions/:sessionId/started',
    methodNotAllowed('POST, OPTIONS'),
  );
  router.all(
    '/device/audio-sessions/:sessionId/stopped',
    methodNotAllowed('POST, OPTIONS'),
  );

  return router;
};
