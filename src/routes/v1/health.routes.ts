import { Router } from 'express';
import { createHealthController } from '../../controllers/health.controller.js';
import type { Database } from '../../db/index.js';
import { methodNotAllowedHandler } from '../../middleware/error-handler.js';

export const createHealthRouter = (database: Database): Router => {
  const router = Router();
  const controllers = createHealthController(database);

  router.get('/health', controllers.health);
  router.all('/health', methodNotAllowedHandler);

  router.get('/ready', controllers.readiness);
  router.all('/ready', methodNotAllowedHandler);

  return router;
};
