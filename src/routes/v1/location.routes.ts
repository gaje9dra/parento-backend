import { Router, type RequestHandler } from 'express';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { LocationService } from '../../services/location-service.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import type { AppConfig } from '../../config/env.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import { createLocationRateLimiter } from '../../middleware/location-rate-limit.js';
import { createLocationController } from '../../controllers/location.controller.js';

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

export const createLocationRouter = (
  authentication: AdminAuthenticationService,
  service: LocationService,
  sessions: DeviceConnectionSessionRepository,
  rateLimitConfig: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const controller = createLocationController(service);
  const auth = requireAdminAuthentication(authentication);
  const deviceReportLimiter = createLocationRateLimiter({
    enabled: rateLimitConfig.enabled,
    windowMs: rateLimitConfig.windowMs,
    maxRequests: rateLimitConfig.maxRequests,
    identifier: 'location-device-report',
  });
  const adminRetrievalLimiter = createLocationRateLimiter({
    enabled: rateLimitConfig.enabled,
    windowMs: rateLimitConfig.windowMs,
    maxRequests: rateLimitConfig.maxRequests,
    identifier: 'location-admin-retrieval',
  });
  const limitedDeviceReport =
    deviceReportLimiter === undefined ? [] : [deviceReportLimiter];
  const limitedAdminRetrieval =
    adminRetrievalLimiter === undefined ? [] : [adminRetrievalLimiter];

  router.post(
    '/device/location',
    ...limitedDeviceReport,
    requireDeviceSession(sessions),
    controller.report,
  );
  router.get(
    '/devices/:deviceId/location',
    ...limitedAdminRetrieval,
    auth,
    requireAdminAuthorization,
    controller.get,
  );
  router.all('/device/location', methodNotAllowed('POST, OPTIONS'));
  router.all('/devices/:deviceId/location', methodNotAllowed('GET, OPTIONS'));
  return router;
};
