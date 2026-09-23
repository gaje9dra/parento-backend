/**
 * Security boundary for future identity and authorization modules.
 *
 * Administrator identity and managed-device identity are intentionally separate
 * concepts. Phase 1.1 does not authenticate either identity.
 */
export type IdentityKind = 'administrator' | 'managed-device';

export interface IdentityContext {
  readonly kind: IdentityKind;
  readonly subjectId: string;
}
