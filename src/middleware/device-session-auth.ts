import type { RequestHandler } from 'express';
import { hashOpaqueToken } from '../auth/token.js';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';

declare global {
  namespace Express {
    interface Request {
      authenticatedDeviceSession?: {
        id: string;
        managedDeviceId: string;
        state: string;
        expiresAt: Date;
      };
    }
  }
}

export const requireDeviceSession =
  (sessions: DeviceConnectionSessionRepository): RequestHandler =>
  async (req, res, next) => {
    const header = req.header('authorization');
    const match = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
    if (!match?.[1]) {
      res.status(401).json({
        error: {
          code: 'DEVICE_SESSION_INVALID',
          message: 'Managed-device session is required.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }
    const session = await sessions.findByTokenHash(hashOpaqueToken(match[1]));
    if (session && session.expiresAt.getTime() <= Date.now()) {
      await sessions
        .disconnect(session.id, new Date(), 'EXPIRED')
        .catch(() => undefined);
    }
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      !['CONNECTED', 'STALE'].includes(session.state)
    ) {
      res.status(401).json({
        error: {
          code: 'DEVICE_SESSION_INVALID',
          message: 'Managed-device session is no longer valid.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }
    req.authenticatedDeviceSession = {
      id: session.id,
      managedDeviceId: session.managedDeviceId,
      state: session.state,
      expiresAt: session.expiresAt,
    };
    next();
  };
