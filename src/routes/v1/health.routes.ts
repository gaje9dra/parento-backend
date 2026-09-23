import { Router } from 'express';
import {
  healthController,
  readinessController,
} from '../../controllers/health.controller.js';
import { methodNotAllowedHandler } from '../../middleware/error-handler.js';

export const healthRouter = Router();

healthRouter.get('/health', healthController);
healthRouter.all('/health', methodNotAllowedHandler);

healthRouter.get('/ready', readinessController);
healthRouter.all('/ready', methodNotAllowedHandler);
