import type { RequestHandler } from 'express';
import { z } from 'zod';
import { logger } from '../logging/logger.js';
import {
  AdminAuthenticationService,
  AuthenticationFailure,
  SessionFailure,
} from '../services/admin-authentication-service.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(256),
});

const toAdminResponse = (admin: {
  id: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED';
  lastAuthenticatedAt: Date | null;
}) => ({
  id: admin.id,
  email: admin.email,
  status: admin.status,
  lastAuthenticatedAt: admin.lastAuthenticatedAt?.toISOString() ?? null,
});

const handleAuthenticationError = (
  error: unknown,
  res: Parameters<RequestHandler>[1],
): void => {
  if (error instanceof AuthenticationFailure) {
    logger.warn(
      { event: 'admin_login_failure', requestId: res.locals.requestId },
      'Administrator login failed',
    );
    res.status(401).json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid administrator credentials.',
      },
      requestId: res.locals.requestId,
    });
    return;
  }

  throw error;
};

export const createAdminAuthController = (
  authentication: AdminAuthenticationService,
) => ({
  login: (async (req, res, next) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid authentication request.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }

    try {
      const result = await authentication.login(
        parsed.data.email,
        parsed.data.password,
      );
      logger.info(
        { event: 'admin_login_success', requestId: res.locals.requestId, adminId: result.admin.id },
        'Administrator login succeeded',
      );
      res.status(200).json({
        data: {
          admin: toAdminResponse(result.admin),
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresAt: result.tokens.accessExpiresAt.toISOString(),
          sessionExpiresAt: result.tokens.expiresAt.toISOString(),
          tokenType: 'Bearer',
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      try {
        handleAuthenticationError(error, res);
      } catch (nextError) {
        next(nextError);
      }
    }
  }) as RequestHandler,

  me: (async (req, res, next) => {
    try {
      if (req.authenticatedAdmin === undefined) {
        throw new SessionFailure();
      }
      const admin = await authentication.authenticateAccessToken(
        req.header('authorization')!.slice('Bearer '.length),
      );
      res.status(200).json({
        data: { admin: toAdminResponse(admin) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  refresh: (async (req, res, next) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid refresh request.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }

    try {
      const tokens = await authentication.refresh(parsed.data.refreshToken);
      res.status(200).json({
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiresAt: tokens.accessExpiresAt.toISOString(),
          sessionExpiresAt: tokens.expiresAt.toISOString(),
          tokenType: 'Bearer',
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      if (error instanceof SessionFailure) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication session is invalid or expired.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      next(error);
    }
  }) as RequestHandler,

  logout: (async (req, res, next) => {
    try {
      const header = req.header('authorization');
      if (header === undefined) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Administrator authentication is required.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      await authentication.logout(header.slice('Bearer '.length));
      logger.info(
        { event: 'admin_logout', requestId: res.locals.requestId, adminId: req.authenticatedAdmin?.id },
        'Administrator logout completed',
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
});
