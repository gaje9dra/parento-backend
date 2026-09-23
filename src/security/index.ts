/**
 * Security boundary for future identity and authorization modules.
 *
 * Administrator identity and managed-device identity are separate concepts.
 * Authentication and enrollment are intentionally not implemented in Phase 1.2.
 */
export type IdentityKind = 'administrator' | 'managed-device';

export interface IdentityContext {
  readonly kind: IdentityKind;
  readonly subjectId: string;
}

export interface Authenticator {
  authenticate(): Promise<IdentityContext | undefined>;
}

/**
 * Placeholder boundary. Future authentication middleware must populate identity
 * from a verified credential rather than trusting arbitrary client identifiers.
 */
export const authenticator: Authenticator = {
  async authenticate() {
    return undefined;
  },
};
