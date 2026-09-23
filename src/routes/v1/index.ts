import { Router } from 'express';
import { healthRouter } from './health.routes.js';

export const v1Router = Router();

v1Router.use(healthRouter);
