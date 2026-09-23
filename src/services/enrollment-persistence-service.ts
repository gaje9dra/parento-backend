import { randomUUID } from 'node:crypto';
import type { Enrollment } from '../domain/enrollment.js';
import type { EnrollmentRepository } from '../repositories/enrollment-repository.js';

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
}
