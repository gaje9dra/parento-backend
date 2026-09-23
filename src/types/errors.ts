export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata;
  }
}
