import { Router } from 'express';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import { createAdminAuthController } from '../../controllers/admin-auth.controller.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { methodNotAllowedHandler } from '../../middleware/error-handler.js';

export const createAdminAuthRouter = (
  authentication: AdminAuthenticationService,
): Router => {
  const router = Router();
  const controller = createAdminAuthController(authentication);

  router.post('/auth/admin/login', controller.login);
  router.post('/auth/admin/refresh', controller.refresh);
  router.get('/auth/admin/me', requireAdminAuthentication(authentication), controller.me);
  router.post('/auth/admin/logout', requireAdminAuthentication(authentication), controller.logout);

  router.all('/auth/admin/login', methodNotAllowedHandler);
  router.all('/auth/admin/refresh', methodNotAllowedHandler);
  router.all('/auth/admin/me', methodNotAllowedHandler);
  router.all('/auth/admin/logout', methodNotAllowedHandler);

  return router;
};
