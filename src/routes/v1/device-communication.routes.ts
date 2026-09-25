import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { DeviceSessionService } from '../../services/device-session-service.js';
import type { CommandService } from '../../services/command-service.js';
import { createDeviceSessionController } from '../../controllers/device-session.controller.js';
import { createCommandController } from '../../controllers/command.controller.js';

const methodNotAllowed = (allow: string): RequestHandler => (_req, res) => {
  res.setHeader('Allow', allow);
  res.status(405).json({
    error: { code: 'METHOD_NOT_ALLOWED', message: 'HTTP method is not allowed for this endpoint.' },
    requestId: res.locals.requestId,
  });
};

export const createDeviceCommunicationRouter = (
  authentication: AdminAuthenticationService,
  sessions: DeviceSessionService,
  commands: CommandService,
  _config: AppConfig['rateLimit'],
): Router => {
  const router = Router();
  const adminAuth = requireAdminAuthentication(authentication);
  const adminAuthorization = requireAdminAuthorization;
  const sessionController = createDeviceSessionController(sessions);
  const commandController = createCommandController(commands);

  router.post('/devices/sessions', sessionController.connect);
  router.post('/devices/sessions/:sessionId/disconnect', sessionController.disconnect);

  router.post('/devices/commands', adminAuth, adminAuthorization, commandController.create);
  router.get('/devices/commands', adminAuth, adminAuthorization, commandController.list);
  router.get('/devices/commands/:commandId', adminAuth, adminAuthorization, commandController.get);
  router.post('/devices/commands/:commandId/cancel', adminAuth, adminAuthorization, commandController.cancel);

  router.all('/devices/sessions', methodNotAllowed('POST, OPTIONS'));
  router.all('/devices/sessions/:sessionId/disconnect', methodNotAllowed('POST, OPTIONS'));
  router.all('/devices/commands', methodNotAllowed('GET, POST, OPTIONS'));
  router.all('/devices/commands/:commandId', methodNotAllowed('GET, OPTIONS'));
  router.all('/devices/commands/:commandId/cancel', methodNotAllowed('POST, OPTIONS'));
  return router;
};
