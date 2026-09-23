import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../types/errors.js';
import { logger } from '../logging/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
    },
    requestId: res.locals.requestId,
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const isMalformedJson =
    error instanceof SyntaxError &&
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 400;

  const appError = isMalformedJson
    ? new AppError(400, 'INVALID_REQUEST', 'Request body contains invalid JSON.')
    : error instanceof AppError
      ? error
      : new AppError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error.');

  logger.error(
    {
      err: error,
      method: req.method,
      path: req.originalUrl,
      requestId: res.locals.requestId,
      statusCode: appError.statusCode,
    },
    'Request failed',
  );

  const body: {
    error: { code: string; message: string; metadata?: Record<string, unknown> };
    requestId?: string;
  } = {
    error: {
      code: appError.code,
      message: appError.message,
    },
  };

  if (appError.metadata !== undefined && appError.statusCode < 500) {
    body.error.metadata = appError.metadata;
  }

  if (res.locals.requestId) {
    body.requestId = res.locals.requestId;
  }

  res.status(appError.statusCode).json(body);
};
