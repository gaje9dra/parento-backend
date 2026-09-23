export interface ApiSuccess<T> {
  data: T;
  requestId?: string;
}

export interface ApiError {
  error: {
    code:
      | 'AUTHENTICATION_REQUIRED'
      | 'AUTHORIZATION_DENIED'
      | 'INVALID_REQUEST'
      | 'RESOURCE_NOT_FOUND'
      | 'CONFLICT'
      | 'RATE_LIMITED'
      | 'INTERNAL_SERVER_ERROR'
      | 'NOT_FOUND';
    message: string;
    metadata?: Record<string, unknown>;
  };
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
