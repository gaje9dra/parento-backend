import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import { createEnrollmentVerificationRateLimiter } from '../../middleware/enrollment-rate-limit.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { EnrollmentSessionService } from '../../services/enrollment-session-service.js';
import { createEnrollmentController } from '../../controllers/enrollment.controller.js';

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

export const createEnrollmentRouter = (
  authentication: AdminAuthenticationService,
  service: EnrollmentSessionService,
  rateLimitConfig: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const controller = createEnrollmentController(service);
  const verificationRateLimiter = createEnrollmentVerificationRateLimiter({
    enabled: rateLimitConfig.enabled,
    windowMs: rateLimitConfig.enrollmentVerificationWindowMs ?? 60_000,
    maxRequests: rateLimitConfig.enrollmentVerificationMaxRequests ?? 10,
  });

  const adminAuth = requireAdminAuthentication(authentication);
  const adminAuthorization = requireAdminAuthorization;

  router.post(
    '/devices/enrollments',
    adminAuth,
    adminAuthorization,
    controller.create,
  );
  router.get(
    '/devices/enrollments',
    adminAuth,
    adminAuthorization,
    controller.list,
  );
  router.get(
    '/devices/enrollments/:enrollmentId',
    adminAuth,
    adminAuthorization,
    controller.get,
  );
  router.post(
    '/devices/enrollments/:enrollmentId/cancel',
    adminAuth,
    adminAuthorization,
    controller.cancel,
  );

  if (verificationRateLimiter !== undefined) {
    router.post(
      '/devices/enrollments/:enrollmentId/consume',
      verificationRateLimiter,
      controller.consume,
    );
  } else {
    router.post(
      '/devices/enrollments/:enrollmentId/consume',
      controller.consume,
    );
  }

  router.all('/devices/enrollments', methodNotAllowed('GET, POST, OPTIONS'));
  router.all(
    '/devices/enrollments/:enrollmentId',
    methodNotAllowed('GET, OPTIONS'),
  );
  router.all(
    '/devices/enrollments/:enrollmentId/cancel',
    methodNotAllowed('POST, OPTIONS'),
  );
  router.all(
    '/devices/enrollments/:enrollmentId/consume',
    methodNotAllowed('POST, OPTIONS'),
  );

  return router;
};
