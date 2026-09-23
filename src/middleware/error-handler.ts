import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../types/errors.js';
import { logger } from '../logging/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
    },
    path: req.originalUrl,
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error.');

  logger.error(
    {
      err: error,
      method: req.method,
      path: req.originalUrl,
      statusCode: appError.statusCode,
    },
    'Request failed',
  );

  const body: {
    error: { code: string; message: string; metadata?: Record<string, unknown> };
  } = {
    error: {
      code: appError.code,
      message: appError.message,
    },
  };

  if (appError.metadata !== undefined && appError.statusCode < 500) {
    body.error.metadata = appError.metadata;
  }

  res.status(appError.statusCode).json(body);
};
