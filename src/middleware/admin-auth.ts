import type { RequestHandler } from 'express';
import { logger } from '../logging/logger.js';
import type { AdminAuthenticationService } from '../services/admin-authentication-service.js';

declare global {
  namespace Express {
    interface Request {
      authenticatedAdmin?: {
        id: string;
        email: string;
        status: 'ACTIVE' | 'DISABLED';
        lastAuthenticatedAt: Date | null;
      };
    }
  }
}

export const requireAdminAuthentication = (
  authentication: AdminAuthenticationService,
): RequestHandler => {
  return async (req, res, next) => {
    const header = req.header('authorization');
    const match = header?.match(/^Bearer ([A-Za-z0-9_-]{20,256})$/);

    if (match?.[1] === undefined) {
      logger.warn(
        {
          event: 'admin_authentication_failure',
          requestId: res.locals.requestId,
        },
        'Administrator authentication failed',
      );
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Administrator authentication is required.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }

    try {
      const admin = await authentication.authenticateAccessToken(match[1]);
      req.authenticatedAdmin = {
        id: admin.id,
        email: admin.email,
        status: admin.status,
        lastAuthenticatedAt: admin.lastAuthenticatedAt,
      };
      next();
    } catch {
      logger.warn(
        { event: 'admin_authentication_failure', requestId: res.locals.requestId },
        'Administrator authentication failed',
      );
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Administrator authentication is required.',
        },
        requestId: res.locals.requestId,
      });
    }
  };
};
