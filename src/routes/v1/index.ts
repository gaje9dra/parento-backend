import { Router } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/index.js';
import { PostgresAdminRepository } from '../../repositories/postgres-admin-repository.js';
import { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import { createAdminAuthRouter } from './admin-auth.routes.js';
import { createHealthRouter } from './health.routes.js';
import { createEnrollmentRouter } from './enrollment.routes.js';
import { PostgresEnrollmentSessionRepository } from '../../repositories/postgres-enrollment-session-repository.js';
import { EnrollmentSessionService } from '../../services/enrollment-session-service.js';

export const createV1Router = (
  database: Database,
  security: AppConfig['security'],
  rateLimit: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const adminRepository = new PostgresAdminRepository(database);
  const authentication = new AdminAuthenticationService(
    adminRepository,
    undefined,
    security.accessTokenTtlSeconds,
    security.sessionTtlSeconds,
  );

  router.use(createHealthRouter(database));
  router.use(createAdminAuthRouter(authentication, rateLimit));
  const enrollmentRepository = new PostgresEnrollmentSessionRepository(database);
  const enrollmentService = new EnrollmentSessionService(enrollmentRepository, {
    ttlSeconds: security.enrollmentSessionTtlSeconds,
    maxVerificationAttempts: security.enrollmentVerificationMaxAttempts,
  });
  router.use(createEnrollmentRouter(authentication, enrollmentService, rateLimit));
  return router;
};
