import type { RequestHandler } from 'express';
import { logger } from '../logging/logger.js';

export const requireAdminAuthorization: RequestHandler = (req, res, next) => {
  const admin = req.authenticatedAdmin;

  if (admin === undefined) {
    logger.warn(
      { event: 'admin_authorization_failure', requestId: res.locals.requestId },
      'Administrator authorization failed',
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

  if (admin.status !== 'ACTIVE') {
    logger.warn(
      {
        event: 'admin_authorization_failure',
        requestId: res.locals.requestId,
        adminId: admin.id,
      },
      'Administrator authorization failed',
    );
    res.status(403).json({
      error: {
        code: 'AUTHORIZATION_DENIED',
        message: 'Administrator authorization is required.',
      },
      requestId: res.locals.requestId,
    });
    return;
  }

  next();
};
