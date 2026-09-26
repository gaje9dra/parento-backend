import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { ScreenSharingService } from '../services/screen-sharing-service.js';

const deviceParam = z.object({ deviceId: z.string().uuid() }).strict();
const sessionParam = z.object({ sessionId: z.string().uuid() }).strict();
const requestBody = z
  .object({
    correlationId: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();
const startedBody = z
  .object({
    transportState: z.record(z.string(), z.unknown()).nullable().default(null),
  })
  .strict();

const toSession = (session: {
  id: string;
  managedDeviceId: string;
  adminId: string;
  status: string;
  createdAt: Date;
  authorizedAt: Date | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
  expiresAt: Date;
  lastActivityAt: Date;
  terminationReason: string | null;
  correlationId: string;
  transportState: Record<string, unknown> | null;
}) => ({
  sessionId: session.id,
  deviceId: session.managedDeviceId,
  status: session.status,
  createdAt: session.createdAt.toISOString(),
  authorizedAt: session.authorizedAt?.toISOString() ?? null,
  startedAt: session.startedAt?.toISOString() ?? null,
  expiresAt: session.expiresAt.toISOString(),
  stoppedAt: session.stoppedAt?.toISOString() ?? null,
  lastActivityAt: session.lastActivityAt.toISOString(),
  terminationReason: session.terminationReason,
  correlationId: session.correlationId,
  transportState: session.transportState,
});

export const createScreenSharingController = (
  service: ScreenSharingService,
) => ({
  create: (async (req, res, next) => {
    try {
      const p = deviceParam.safeParse(req.params);
      const b = requestBody.safeParse(req.body);
      if (!p.success || !b.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid screen-sharing request.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      if (!req.authenticatedAdmin) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Administrator authentication is required.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      const result = await service.request(
        req.authenticatedAdmin.id,
        p.data.deviceId,
        b.data.correlationId ?? res.locals.requestId,
      );
      res.status(result.created ? 201 : 200).json({
        data: { session: toSession(result.session), created: result.created },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  get: (async (req, res, next) => {
    try {
      const p = sessionParam.safeParse(req.params);
      if (!p.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid screen session identifier.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      if (!req.authenticatedAdmin) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Administrator authentication is required.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      const session = await service.getOwned(
        p.data.sessionId,
        req.authenticatedAdmin.id,
      );
      res
        .status(200)
        .json({
          data: { session: toSession(session) },
          requestId: res.locals.requestId,
        });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  stop: (async (req, res, next) => {
    try {
      const p = sessionParam.safeParse(req.params);
      if (!p.success || !req.authenticatedAdmin) {
        res.status(p.success ? 401 : 400).json({
          error: {
            code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST',
            message: p.success
              ? 'Administrator authentication is required.'
              : 'Invalid screen session identifier.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      const session = await service.stop(
        p.data.sessionId,
        req.authenticatedAdmin.id,
      );
      res
        .status(200)
        .json({
          data: { session: toSession(session) },
          requestId: res.locals.requestId,
        });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  started: (async (req, res, next) => {
    try {
      const p = sessionParam.safeParse(req.params);
      const b = startedBody.safeParse(req.body);
      const deviceSession = req.authenticatedDeviceSession;
      if (!p.success || !b.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid screen session state update.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      if (!deviceSession) {
        res.status(401).json({
          error: {
            code: 'DEVICE_SESSION_INVALID',
            message: 'Managed-device session is required.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      const session = await service.markStarted(
        p.data.sessionId,
        {
          managedDeviceId: deviceSession.managedDeviceId,
          state: deviceSession.state as 'CONNECTED',
          expiresAt: deviceSession.expiresAt,
        },
        b.data.transportState,
      );
      res
        .status(200)
        .json({
          data: { session: toSession(session) },
          requestId: res.locals.requestId,
        });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  stopped: (async (req, res, next) => {
    try {
      const p = sessionParam.safeParse(req.params);
      const deviceSession = req.authenticatedDeviceSession;
      if (!p.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid screen session identifier.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      if (!deviceSession) {
        res.status(401).json({
          error: {
            code: 'DEVICE_SESSION_INVALID',
            message: 'Managed-device session is required.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      const session = await service.markStopped(p.data.sessionId, {
        managedDeviceId: deviceSession.managedDeviceId,
        state: deviceSession.state as 'CONNECTED',
        expiresAt: deviceSession.expiresAt,
      });
      res
        .status(200)
        .json({
          data: { session: toSession(session) },
          requestId: res.locals.requestId,
        });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
});
