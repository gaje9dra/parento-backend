import { randomUUID } from 'node:crypto';
import type { Enrollment, EnrollmentStatus } from '../domain/enrollment.js';
import type {
  EnrollmentPage,
  EnrollmentPageRequest,
  EnrollmentRepository,
} from '../repositories/enrollment-repository.js';

export class EnrollmentPersistenceService {
  constructor(private readonly repository: EnrollmentRepository) {}

  create(input: {
    enrollmentIdentifier: string;
    deviceId: string;
    adminId: string;
    expiresAt: Date;
  }): Promise<Enrollment> {
    const identifier = input.enrollmentIdentifier.trim();
    if (identifier === '') {
      throw new Error('Enrollment identifier is required.');
    }
    if (input.expiresAt.getTime() <= Date.now()) {
      throw new Error('Enrollment expiration must be in the future.');
    }
    return this.repository.create({
      id: randomUUID(),
      enrollmentIdentifier: identifier,
      deviceId: input.deviceId,
      adminId: input.adminId,
      expiresAt: input.expiresAt,
    });
  }

  findById(id: string): Promise<Enrollment | null> {
    return this.repository.findById(id);
  }

  findByIdentifier(identifier: string): Promise<Enrollment | null> {
    return this.repository.findByIdentifier(identifier.trim());
  }

  listByAdminId(
    adminId: string,
    page?: EnrollmentPageRequest,
  ): Promise<EnrollmentPage> {
    return this.repository.listByAdminId(adminId, page);
  }

  listByDeviceId(
    deviceId: string,
    page?: EnrollmentPageRequest,
  ): Promise<EnrollmentPage> {
    return this.repository.listByDeviceId(deviceId, page);
  }

  updateStatus(
    id: string,
    status: EnrollmentStatus,
    completedAt?: Date | null,
  ): Promise<Enrollment | null> {
    return this.repository.updateStatus(id, status, completedAt);
  }
}
