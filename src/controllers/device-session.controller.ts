import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { DeviceSessionService } from '../services/device-session-service.js';

const sessionResponse = (session: {
  id: string;
  managedDeviceId: string;
  state: string;
  createdAt: Date;
  lastActivityAt: Date;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  expiresAt: Date;
}) => ({
  id: session.id,
  managedDeviceId: session.managedDeviceId,
  state: session.state,
  createdAt: session.createdAt.toISOString(),
  lastActivityAt: session.lastActivityAt.toISOString(),
  connectedAt: session.connectedAt?.toISOString() ?? null,
  disconnectedAt: session.disconnectedAt?.toISOString() ?? null,
  expiresAt: session.expiresAt.toISOString(),
});

const idSchema = z.object({ sessionId: z.string().uuid() }).strict();

export const createDeviceSessionController = (
  service: DeviceSessionService,
) => ({
  connect: (async (req, res, next) => {
    const credential = req.header('x-device-credential');
    if (credential === undefined) {
      res.status(401).json({
        error: { code: 'AUTHENTICATION_REQUIRED', message: 'Device authentication is required.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    try {
      const session = await service.connect(credential);
      res.status(201).json({ data: { session: sessionResponse(session) }, requestId: res.locals.requestId });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  disconnect: (async (req, res, next) => {
    const parsed = idSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'Invalid session identifier.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    try {
      const session = await service.disconnect(parsed.data.sessionId);
      if (session === null) {
        res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Device session was not found.' }, requestId: res.locals.requestId });
        return;
      }
      res.status(200).json({ data: { session: sessionResponse(session) }, requestId: res.locals.requestId });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
});
