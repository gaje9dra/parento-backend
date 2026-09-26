import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import { createDeviceCommunicationRateLimiter } from '../../middleware/device-communication-rate-limit.js';
import type { ApplicationManagementService } from '../../services/application-management-service.js';
import { createApplicationManagementController } from '../../controllers/application-management.controller.js';

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

export const createApplicationManagementRouter = (
  service: ApplicationManagementService,
  authentication: AdminAuthenticationService,
  sessions: DeviceConnectionSessionRepository,
  rateLimitConfig: AppConfig['rateLimit'],
  limits: {
    maxInventoryItems: number;
    maxPolicyRules: number;
    maxPayloadBytes: number;
  },
): Router => {
  const router = Router();
  const controller = createApplicationManagementController(service, limits);
  const adminAuth = requireAdminAuthentication(authentication);
  const limiter = createDeviceCommunicationRateLimiter({
    enabled: rateLimitConfig.enabled,
    windowMs: rateLimitConfig.windowMs,
    maxRequests: rateLimitConfig.maxRequests,
  });
  const limited = limiter ? [limiter] : [];
  const deviceAuth = [...limited, requireDeviceSession(sessions)];

  router.post('/device/applications/inventory', ...deviceAuth, controller.ingestInventory);
  router.get('/device/application-policy', ...deviceAuth, controller.getDevicePolicy);
  router.post('/device/application-policy/status', ...deviceAuth, controller.reportDeviceStatus);

  router.get('/admin/devices/:deviceId/applications', adminAuth, requireAdminAuthorization, controller.listInventory);
  router.get('/admin/devices/:deviceId/applications/:packageName', adminAuth, requireAdminAuthorization, controller.getInventoryItem);
  router.post('/admin/devices/:deviceId/applications/inventory/request', adminAuth, requireAdminAuthorization, controller.requestInventory);

  router.post('/admin/application-policies', adminAuth, requireAdminAuthorization, controller.createPolicy);
  router.get('/admin/application-policies', adminAuth, requireAdminAuthorization, controller.listPolicies);
  router.get('/admin/application-policies/:policyId', adminAuth, requireAdminAuthorization, controller.getPolicy);
  router.patch('/admin/application-policies/:policyId', adminAuth, requireAdminAuthorization, controller.updatePolicy);

  router.get('/admin/devices/:deviceId/application-policy', adminAuth, requireAdminAuthorization, controller.effectivePolicy);
  router.post('/admin/devices/:deviceId/application-policy', adminAuth, requireAdminAuthorization, controller.assignPolicy);
  router.delete('/admin/devices/:deviceId/application-policy', adminAuth, requireAdminAuthorization, controller.removePolicy);
  router.get('/admin/devices/:deviceId/application-policy/status', adminAuth, requireAdminAuthorization, controller.enforcementStatus);
  router.post('/admin/devices/:deviceId/application-policy/sync', adminAuth, requireAdminAuthorization, controller.syncPolicy);

  router.all('/device/applications/inventory', methodNotAllowed('POST, OPTIONS'));
  router.all('/device/application-policy', methodNotAllowed('GET, OPTIONS'));
  router.all('/device/application-policy/status', methodNotAllowed('POST, OPTIONS'));
  router.all('/admin/devices/:deviceId/applications', methodNotAllowed('GET, OPTIONS'));
  router.all('/admin/application-policies', methodNotAllowed('GET, POST, OPTIONS'));

  return router;
};
