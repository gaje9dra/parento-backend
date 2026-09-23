import { PersistenceError } from '../domain/persistence-errors.js';
import { AppError } from '../types/errors.js';

export const databaseError = (requestId?: string): AppError =>
  new AppError(
    503,
    'DATABASE_UNAVAILABLE',
    'The database service is temporarily unavailable.',
    requestId === undefined ? undefined : { requestId },
  );

/**
 * Convert PostgreSQL implementation errors into stable persistence-domain errors.
 * The original driver error is retained only as a non-serialized cause.
 */
export const mapPostgresPersistenceError = (
  error: unknown,
  fallbackMessage: string,
): PersistenceError => {
  if (error instanceof PersistenceError) return error;

  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined;

  if (code === '23505') {
    return new PersistenceError('CONFLICT', 'The resource already exists.', error);
  }
  if (code === '23503') {
    return new PersistenceError(
      'FOREIGN_KEY',
      'The referenced resource does not exist.',
      error,
    );
  }
  if (code === '23514') {
    return new PersistenceError(
      'INVALID_STATE',
      'The resource state is invalid.',
      error,
    );
  }
  if (code === '23502' || code === '22P02') {
    return new PersistenceError(
      'INVALID_STATE',
      'The resource data is invalid.',
      error,
    );
  }
  if (
    code?.startsWith('08') ||
    code === '53300' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03'
  ) {
    return new PersistenceError(
      'DATABASE_UNAVAILABLE',
      'The database service is unavailable.',
      error,
    );
  }
  if (code === '57014' || code === '55P03') {
    return new PersistenceError(
      'DATABASE_UNAVAILABLE',
      'The database operation timed out or could not acquire a lock.',
      error,
    );
  }

  return new PersistenceError('UNKNOWN', fallbackMessage, error);
};
