import { Router } from 'express';
import type { Database } from '../../db/index.js';
import { PostgresAdminRepository } from '../../repositories/postgres-admin-repository.js';
import { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import { createAdminAuthRouter } from './admin-auth.routes.js';
import { createHealthRouter } from './health.routes.js';

export const createV1Router = (database: Database): Router => {
  const router = Router();
  const adminRepository = new PostgresAdminRepository(database);
  const authentication = new AdminAuthenticationService(adminRepository);

  router.use(createHealthRouter(database));
  router.use(createAdminAuthRouter(authentication));
  return router;
};
