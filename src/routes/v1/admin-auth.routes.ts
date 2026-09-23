import { Router } from 'express';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import { createAdminAuthController } from '../../controllers/admin-auth.controller.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';

const methodNotAllowed = (allow: string) => {
  return (_req: Parameters<Router['all']>[1], res: any): void => {
    res.setHeader('Allow', allow);
    res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'HTTP method is not allowed for this endpoint.',
      },
      requestId: res.locals.requestId,
    });
  };
};

export const createAdminAuthRouter = (
  authentication: AdminAuthenticationService,
): Router => {
  const router = Router();
  const controller = createAdminAuthController(authentication);

  router.post('/auth/admin/login', controller.login);
  router.post('/auth/admin/refresh', controller.refresh);
  router.get(
    '/auth/admin/me',
    requireAdminAuthentication(authentication),
    controller.me,
  );
  router.post(
    '/auth/admin/logout',
    requireAdminAuthentication(authentication),
    controller.logout,
  );

  router.all('/auth/admin/login', methodNotAllowed('POST, OPTIONS'));
  router.all('/auth/admin/refresh', methodNotAllowed('POST, OPTIONS'));
  router.all('/auth/admin/me', methodNotAllowed('GET, OPTIONS'));
  router.all('/auth/admin/logout', methodNotAllowed('POST, OPTIONS'));

  return router;
};
