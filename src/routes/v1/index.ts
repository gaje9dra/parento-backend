import { Router } from 'express';
import type { Database } from '../../db/index.js';
import { createHealthRouter } from './health.routes.js';

export const createV1Router = (database: Database): Router => {
  const router = Router();
  router.use(createHealthRouter(database));
  return router;
};
