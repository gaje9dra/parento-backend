export type EnrollmentSessionStatus =
  | 'CREATED'
  | 'PENDING'
  | 'VERIFIED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REVOKED'
  | 'FAILED';

export interface EnrollmentSession {
  readonly id: string;
  readonly adminId: string;
  readonly status: EnrollmentSessionStatus;
  readonly secretHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly managedDeviceId: string | null;
  readonly verificationAttempts: number;
}

export const isValidEnrollmentSessionTransition = (
  from: EnrollmentSessionStatus,
  to: EnrollmentSessionStatus,
): boolean => {
  if (from === to) return true;
  if (from === 'CREATED') return to === 'PENDING' || to === 'FAILED';
  if (from === 'PENDING') {
    return (
      to === 'VERIFIED' ||
      to === 'COMPLETED' ||
      to === 'EXPIRED' ||
      to === 'CANCELLED' ||
      to === 'REVOKED' ||
      to === 'FAILED'
    );
  }
  if (from === 'VERIFIED') {
    return to === 'COMPLETED' || to === 'EXPIRED' || to === 'CANCELLED' || to === 'REVOKED';
  }
  return false;
};
