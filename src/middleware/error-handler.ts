import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../types/errors.js';
import { logger } from '../logging/logger.js';

const isHttpError = (
  error: unknown,
): error is Error & { status?: number; type?: string } =>
  error instanceof Error && typeof error === 'object';

export const methodNotAllowedHandler: RequestHandler = (req, res) => {
  res.setHeader('Allow', 'GET, HEAD, OPTIONS');
  res.status(405).json({
    success: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'HTTP method is not allowed for this endpoint.',
    },
    requestId: res.locals.requestId,
  });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
    },
    requestId: res.locals.requestId,
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const malformedJson =
    isHttpError(error) &&
    error.status === 400 &&
    error.type === 'entity.parse.failed';

  const requestTooLarge =
    isHttpError(error) &&
    error.status === 413 &&
    error.type === 'entity.too.large';

  const appError = malformedJson
    ? new AppError(400, 'INVALID_REQUEST', 'Request body contains invalid JSON.')
    : requestTooLarge
      ? new AppError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds the configured size limit.')
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
    success: false;
    error: { code: string; message: string; metadata?: Record<string, unknown> };
    requestId: string;
  } = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
    },
    requestId: res.locals.requestId,
  };

  if (appError.metadata !== undefined && appError.statusCode < 500) {
    body.error.metadata = appError.metadata;
  }

  res.status(appError.statusCode).json(body);
};
