import { AppError } from '../types/errors.js';
import type { IdentityContext } from './index.js';

export interface AuthorizationPolicy {
  canAccessManagedDevice(
    identity: IdentityContext,
    managedDeviceId: string,
  ): Promise<boolean>;
}

export async function requireManagedDeviceAccess(
  policy: AuthorizationPolicy,
  identity: IdentityContext | undefined,
  managedDeviceId: string,
): Promise<void> {
  if (!identity) {
    throw new AppError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    );
  }

  if (identity.kind !== 'administrator') {
    throw new AppError(
      403,
      'AUTHORIZATION_DENIED',
      'The identity is not authorized for this operation.',
    );
  }

  const allowed = await policy.canAccessManagedDevice(
    identity,
    managedDeviceId,
  );
  if (!allowed) {
    throw new AppError(
      403,
      'AUTHORIZATION_DENIED',
      'Access to the managed device is denied.',
    );
  }
}
