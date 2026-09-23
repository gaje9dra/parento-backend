import { Router } from 'express';
import { v1Router } from './v1/index.js';

export const apiRouter = Router();

apiRouter.use('/api/v1', v1Router);
