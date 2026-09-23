export type PersistenceErrorCode =
  | 'CONFLICT'
  | 'FOREIGN_KEY'
  | 'NOT_FOUND'
  | 'DATABASE_UNAVAILABLE'
  | 'INVALID_STATE'
  | 'UNKNOWN';

export class PersistenceError extends Error {
  constructor(
    public readonly code: PersistenceErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}
