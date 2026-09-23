import type { RequestHandler } from 'express';

export const requireAdminAuthorization: RequestHandler = (req, res, next) => {
  const admin = req.authenticatedAdmin;

  if (admin === undefined) {
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
