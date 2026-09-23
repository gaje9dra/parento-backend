export type EnrollmentStatus = 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'REVOKED';

export interface Enrollment {
  readonly id: string;
  readonly enrollmentIdentifier: string;
  readonly deviceId: string;
  readonly adminId: string;
  readonly status: EnrollmentStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt: Date;
  readonly completedAt: Date | null;
}

export const isValidEnrollmentTransition = (
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): boolean => {
  if (from === to) return true;
  if (from === 'PENDING') {
    return to === 'COMPLETED' || to === 'EXPIRED' || to === 'REVOKED';
  }
  if (from === 'COMPLETED') return to === 'REVOKED';
  return false;
};
