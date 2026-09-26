import { Router } from 'express';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/index.js';
import { createV1Router } from './v1/index.js';

export const createApiRouter = (
  apiBasePath: string,
  database: Database,
  security: AppConfig['security'],
  rateLimit: AppConfig['rateLimit'],
  realtime: AppConfig['realtime'] = { enabled: false },
): Router => {
  const router = Router();
  router.use(
    apiBasePath,
    createV1Router(database, security, rateLimit, realtime),
  );
  return router;
};
