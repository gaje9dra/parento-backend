import type { RequestHandler } from 'express';
import { hashOpaqueToken } from '../auth/token.js';
import type { DeviceCredentialRepository } from '../repositories/device-credential-repository.js';
import { logger } from '../logging/logger.js';

declare global {
  namespace Express {
    interface Request {
      authenticatedDevice?: { id: string; managedDeviceId: string };
    }
  }
}

export const requireDeviceCredential =
  (credentials: DeviceCredentialRepository): RequestHandler =>
  async (req, res, next) => {
    const header = req.header('authorization');
    const match = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
    if (!match?.[1]) {
      res.status(401).json({
        error: {
          code: 'DEVICE_AUTHENTICATION_REQUIRED',
          message: 'Managed-device authentication is required.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }
    try {
      const credential = await credentials.authenticate(
        hashOpaqueToken(match[1]),
      );
      if (!credential) {
        res.status(401).json({
          error: {
            code: 'DEVICE_AUTHENTICATION_REQUIRED',
            message: 'Managed-device authentication is required.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      req.authenticatedDevice = {
        id: credential.id,
        managedDeviceId: credential.managedDeviceId,
      };
      next();
    } catch {
      logger.warn(
        {
          event: 'device_authentication_failure',
          requestId: res.locals.requestId,
        },
        'Managed-device authentication failed',
      );
      res.status(401).json({
        error: {
          code: 'DEVICE_AUTHENTICATION_REQUIRED',
          message: 'Managed-device authentication is required.',
        },
        requestId: res.locals.requestId,
      });
    }
  };
