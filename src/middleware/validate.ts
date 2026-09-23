import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../types/errors.js';
import { validationErrorMetadata } from '../validation/index.js';

export const validateBody = <T extends z.ZodType>(
  schema: T,
): RequestHandler => {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(
          new AppError(
            400,
            'INVALID_REQUEST',
            'Request validation failed.',
            validationErrorMetadata(error),
          ),
        );
        return;
      }
      next(error);
    }
  };
};
