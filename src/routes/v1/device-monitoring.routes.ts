import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import type { ManagedDeviceRepository } from '../../repositories/managed-device-repository.js';
import type { DeviceMonitoringService } from '../../services/device-monitoring-service.js';
import { createDeviceCommunicationRateLimiter } from '../../middleware/device-communication-rate-limit.js';
import { createDeviceMonitoringController } from '../../controllers/device-monitoring.controller.js';

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

export const createDeviceMonitoringRouter = (
  monitoring: DeviceMonitoringService,
  devices: ManagedDeviceRepository,
  sessions: DeviceConnectionSessionRepository,
  authentication: import('../../services/admin-authentication-service.js').AdminAuthenticationService,
  rateLimitConfig: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const controller = createDeviceMonitoringController(
    monitoring,
    devices,
    sessions,
  );
  const adminAuth = requireAdminAuthentication(authentication);
  const limiter = createDeviceCommunicationRateLimiter({
    enabled: rateLimitConfig.enabled,
    windowMs: rateLimitConfig.windowMs,
    maxRequests: rateLimitConfig.maxRequests,
  });
  const limited = limiter === undefined ? [] : [limiter];

  router.post(
    '/device/monitoring',
    ...limited,
    requireDeviceSession(sessions),
    controller.ingest,
  );
  router.get(
    '/devices/:deviceId/status',
    ...limited,
    adminAuth,
    requireAdminAuthorization,
    controller.status,
  );

  router.all('/device/monitoring', methodNotAllowed('POST, OPTIONS'));
  router.all('/devices/:deviceId/status', methodNotAllowed('GET, OPTIONS'));
  return router;
};
