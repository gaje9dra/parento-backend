import { Router, type RequestHandler } from 'express';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { CommandService } from '../../services/command-service.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { createCommandController } from '../../controllers/command.controller.js';
const methodNotAllowed =
  (allow: string): RequestHandler =>
  (_req, res) => {
    res.setHeader('Allow', allow);
    res
      .status(405)
      .json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'HTTP method is not allowed for this endpoint.',
        },
        requestId: res.locals.requestId,
      });
  };
export const createCommandRouter = (
  authentication: AdminAuthenticationService,
  service: CommandService,
): Router => {
  const router = Router();
  const c = createCommandController(service);
  const auth = requireAdminAuthentication(authentication);
  router.post(
    '/devices/:deviceId/commands',
    auth,
    requireAdminAuthorization,
    (req, res, next) => {
      req.body = { ...req.body, deviceId: req.params.deviceId };
      return c.create(req, res, next);
    },
  );
  router.get(
    '/devices/:deviceId/commands/:commandId',
    auth,
    requireAdminAuthorization,
    c.get,
  );
  router.post(
    '/devices/:deviceId/commands/:commandId/cancel',
    auth,
    requireAdminAuthorization,
    c.cancel,
  );
  router.all('/devices/:deviceId/commands', methodNotAllowed('POST, OPTIONS'));
  router.all(
    '/devices/:deviceId/commands/:commandId',
    methodNotAllowed('GET, OPTIONS'),
  );
  router.all(
    '/devices/:deviceId/commands/:commandId/cancel',
    methodNotAllowed('POST, OPTIONS'),
  );
  return router;
};
