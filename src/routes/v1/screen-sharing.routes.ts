import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { ScreenSharingService } from '../../services/screen-sharing-service.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import { createScreenSharingController } from '../../controllers/screen-sharing.controller.js';
import { createLocationRateLimiter } from '../../middleware/location-rate-limit.js';

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

export const createScreenSharingRouter = (
  authentication: AdminAuthenticationService,
  service: ScreenSharingService,
  sessions: DeviceConnectionSessionRepository,
  rateLimitConfig: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const controller = createScreenSharingController(service);
  const adminAuth = requireAdminAuthentication(authentication);
  const limiter = createLocationRateLimiter({
    enabled: rateLimitConfig.enabled,
    windowMs: rateLimitConfig.windowMs,
    maxRequests: rateLimitConfig.maxRequests,
    identifier: 'screen-sharing-session',
  });
  const limited = limiter === undefined ? [] : [limiter];

  router.post(
    '/devices/:deviceId/screen-sessions',
    ...limited,
    adminAuth,
    requireAdminAuthorization,
    controller.create,
  );
  router.get(
    '/screen-sessions/:sessionId',
    ...limited,
    adminAuth,
    requireAdminAuthorization,
    controller.get,
  );
  router.post(
    '/screen-sessions/:sessionId/stop',
    ...limited,
    adminAuth,
    requireAdminAuthorization,
    controller.stop,
  );
  router.post(
    '/device/screen-sessions/:sessionId/started',
    ...limited,
    requireDeviceSession(sessions),
    controller.started,
  );
  router.post(
    '/device/screen-sessions/:sessionId/stopped',
    ...limited,
    requireDeviceSession(sessions),
    controller.stopped,
  );

  router.all('/devices/:deviceId/screen-sessions', methodNotAllowed('POST, OPTIONS'));
  router.all('/screen-sessions/:sessionId', methodNotAllowed('GET, OPTIONS'));
  router.all('/screen-sessions/:sessionId/stop', methodNotAllowed('POST, OPTIONS'));
  router.all('/device/screen-sessions/:sessionId/started', methodNotAllowed('POST, OPTIONS'));
  router.all('/device/screen-sessions/:sessionId/stopped', methodNotAllowed('POST, OPTIONS'));

  return router;
};
