export type EnrollmentStatus = 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'REVOKED';

export interface Enrollment {
  readonly id: string;
  readonly enrollmentIdentifier: string;
  readonly deviceId: string;
  readonly adminId: string;
  readonly status: EnrollmentStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly completedAt: Date | null;
}
