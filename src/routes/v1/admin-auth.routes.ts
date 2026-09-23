import { Router, type RequestHandler } from 'express';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import { createAdminAuthController } from '../../controllers/admin-auth.controller.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { createAuthenticationRateLimiter } from '../../middleware/auth-rate-limit.js';
import type { AppConfig } from '../../config/env.js';

const methodNotAllowed = (allow: string): RequestHandler => {
  return (_req, res): void => {
    res.setHeader('Allow', allow);
    res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'HTTP method is not allowed for this endpoint.',
      },
      requestId: res.locals.requestId,
    });
  };
};

export const createAdminAuthRouter = (
  authentication: AdminAuthenticationService,
  rateLimitConfig?: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const controller = createAdminAuthController(authentication);
  const authenticationRateLimiter = rateLimitConfig
    ? createAuthenticationRateLimiter(rateLimitConfig)
    : undefined;

  if (authenticationRateLimiter !== undefined) {
    router.post('/auth/admin/login', authenticationRateLimiter, controller.login);
  } else {
    router.post('/auth/admin/login', controller.login);
  }
  if (authenticationRateLimiter !== undefined) {
    router.post('/auth/admin/refresh', authenticationRateLimiter, controller.refresh);
  } else {
    router.post('/auth/admin/refresh', controller.refresh);
  }
  router.get(
    '/auth/admin/me',
    requireAdminAuthentication(authentication),
    requireAdminAuthorization,
    controller.me,
  );
  router.post(
    '/auth/admin/logout',
    requireAdminAuthentication(authentication),
    requireAdminAuthorization,
    controller.logout,
  );

  router.all('/auth/admin/login', methodNotAllowed('POST, OPTIONS'));
  router.all('/auth/admin/refresh', methodNotAllowed('POST, OPTIONS'));
  router.all('/auth/admin/me', methodNotAllowed('GET, OPTIONS'));
  router.all('/auth/admin/logout', methodNotAllowed('POST, OPTIONS'));

  return router;
};
