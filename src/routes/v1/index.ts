import { Router } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/index.js';
import { PostgresAdminRepository } from '../../repositories/postgres-admin-repository.js';
import { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import { createAdminAuthRouter } from './admin-auth.routes.js';
import { createHealthRouter } from './health.routes.js';

export const createV1Router = (database: Database, security: AppConfig['security']): Router => {
  const router = Router();
  const adminRepository = new PostgresAdminRepository(database);
  const authentication = new AdminAuthenticationService(
    adminRepository,
    undefined,
    security.accessTokenTtlSeconds,
    security.sessionTtlSeconds,
  );

  router.use(createHealthRouter(database));
  router.use(createAdminAuthRouter(authentication));
  return router;
};
