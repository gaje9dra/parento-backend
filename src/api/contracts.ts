export interface ApiSuccess<T> {
  data: T;
  requestId: string;
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
      | 'METHOD_NOT_ALLOWED'
      | 'REQUEST_TOO_LARGE'
      | 'INTERNAL_SERVER_ERROR'
      | 'SERVICE_UNAVAILABLE'
      | 'NOT_FOUND';
    message: string;
    metadata?: Record<string, unknown>;
  };
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
