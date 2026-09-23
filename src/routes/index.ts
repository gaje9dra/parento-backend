import { Router } from 'express';
import { v1Router } from './v1/index.js';

export const createApiRouter = (apiBasePath: string): Router => {
  const router = Router();
  router.use(apiBasePath, v1Router);
  return router;
};
