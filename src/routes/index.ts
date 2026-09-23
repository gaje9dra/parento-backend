import { Router } from 'express';
import { v1Router } from './v1/index.js';

export const apiRouter = Router();

export const createApiRouter = (apiBasePath: string): Router => {
  const router = Router();
  router.use(apiBasePath, v1Router);
  return router;
};

apiRouter.use('/api/v1', v1Router);
