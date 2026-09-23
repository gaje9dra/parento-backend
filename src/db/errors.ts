import { AppError } from '../types/errors.js';

export const databaseError = (requestId?: string): AppError =>
  new AppError(
    503,
    'DATABASE_UNAVAILABLE',
    'The database service is temporarily unavailable.',
    requestId === undefined ? undefined : { requestId },
  );
