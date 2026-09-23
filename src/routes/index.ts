import { Router } from 'express';
import type { Database } from '../db/index.js';
import { createV1Router } from './v1/index.js';

export const createApiRouter = (
  apiBasePath: string,
  database: Database,
): Router => {
  const router = Router();
  router.use(apiBasePath, createV1Router(database));
  return router;
};
