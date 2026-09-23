import type { Enrollment, EnrollmentStatus } from '../domain/enrollment.js';
import type { Repository } from './repository.js';

export interface EnrollmentRepository extends Repository {
  create(input: {
    id: string;
    enrollmentIdentifier: string;
    deviceId: string;
    adminId: string;
    expiresAt: Date;
  }): Promise<Enrollment>;
  findById(id: string): Promise<Enrollment | null>;
  findByIdentifier(identifier: string): Promise<Enrollment | null>;
  listByAdminId(adminId: string): Promise<Enrollment[]>;
  listByDeviceId(deviceId: string): Promise<Enrollment[]>;
  updateStatus(
    id: string,
    status: EnrollmentStatus,
    completedAt?: Date | null,
  ): Promise<Enrollment | null>;
}
