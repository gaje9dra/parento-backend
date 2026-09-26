import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { ApplicationManagementService } from '../../services/application-management-service.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import { createApplicationManagementController } from '../../controllers/application-management.controller.js';
import { createApplicationManagementRateLimiter } from '../../middleware/application-management-rate-limit.js';

const methodNotAllowed =
  (allow: string): RequestHandler =>
  (_req,res) => {
    res.setHeader('Allow',allow);
    res.status(405).json({
      error:{code:'METHOD_NOT_ALLOWED',message:'HTTP method is not allowed for this endpoint.'},
      requestId:res.locals.requestId,
    });
  };

export const createApplicationManagementRouter = (
  authentication: AdminAuthenticationService,
  service: ApplicationManagementService,
  sessions: DeviceConnectionSessionRepository,
  rateLimitConfig: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const c = createApplicationManagementController(service);
  const admin = requireAdminAuthentication(authentication);
  const limiter = createApplicationManagementRateLimiter({
    enabled: rateLimitConfig.enabled,
    windowMs: rateLimitConfig.windowMs,
    maxRequests: rateLimitConfig.maxRequests,
    identifier:'application-management',
  });
  const limited = limiter === undefined ? [] : [limiter];

  router.post('/device/applications/inventory',...limited,requireDeviceSession(sessions),c.ingestInventory);
  router.post('/device/applications/enforcement-status',...limited,requireDeviceSession(sessions),c.reportEnforcement);

  router.get('/devices/:deviceId/applications',...limited,admin,requireAdminAuthorization,c.listInventory);
  router.get('/devices/:deviceId/applications/:packageName',...limited,admin,requireAdminAuthorization,c.getInventoryItem);
  router.post('/devices/:deviceId/applications/inventory-request',...limited,admin,requireAdminAuthorization,c.requestInventory);

  router.get('/application-policies',...limited,admin,requireAdminAuthorization,c.listPolicies);
  router.post('/application-policies',...limited,admin,requireAdminAuthorization,c.createPolicy);
  router.get('/application-policies/:policyId',...limited,admin,requireAdminAuthorization,c.getPolicy);
  router.patch('/application-policies/:policyId',...limited,admin,requireAdminAuthorization,c.updatePolicy);
  router.post('/application-policies/:policyId/disable',...limited,admin,requireAdminAuthorization,c.disablePolicy);

  router.put('/devices/:deviceId/application-policy',...limited,admin,requireAdminAuthorization,c.assignPolicy);
  router.delete('/devices/:deviceId/application-policy',...limited,admin,requireAdminAuthorization,c.removeAssignment);
  router.get('/devices/:deviceId/application-policy/effective',...limited,admin,requireAdminAuthorization,c.effectivePolicy);
  router.get('/devices/:deviceId/application-policy/enforcement',...limited,admin,requireAdminAuthorization,c.enforcementStatus);

  router.all('/device/applications/inventory',methodNotAllowed('POST, OPTIONS'));
  router.all('/device/applications/enforcement-status',methodNotAllowed('POST, OPTIONS'));
  router.all('/devices/:deviceId/applications',methodNotAllowed('GET, OPTIONS'));
  router.all('/devices/:deviceId/applications/:packageName',methodNotAllowed('GET, OPTIONS'));
  router.all('/devices/:deviceId/applications/inventory-request',methodNotAllowed('POST, OPTIONS'));
  router.all('/application-policies',methodNotAllowed('GET, POST, OPTIONS'));
  router.all('/application-policies/:policyId',methodNotAllowed('GET, PATCH, OPTIONS'));
  router.all('/application-policies/:policyId/disable',methodNotAllowed('POST, OPTIONS'));
  router.all('/devices/:deviceId/application-policy',methodNotAllowed('PUT, DELETE, OPTIONS'));
  router.all('/devices/:deviceId/application-policy/effective',methodNotAllowed('GET, OPTIONS'));
  router.all('/devices/:deviceId/application-policy/enforcement',methodNotAllowed('GET, OPTIONS'));
  return router;
};
