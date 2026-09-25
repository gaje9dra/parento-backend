import { randomUUID } from 'node:crypto';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/token.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { EnrollmentSession } from '../domain/enrollment-session.js';
import type { EnrollmentSessionRepository } from '../repositories/enrollment-session-repository.js';
import { AppError } from '../types/errors.js';

const UUID_SCHEMA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_SCHEMA = /^[A-Za-z0-9._:-]{8,128}$/;

export interface EnrollmentSessionServiceOptions {
  readonly ttlSeconds: number;
  readonly maxVerificationAttempts: number;
}

export class EnrollmentSessionService {
  constructor(
    private readonly repository: EnrollmentSessionRepository,
    private readonly options: EnrollmentSessionServiceOptions,
  ) {}

  async create(adminId: string): Promise<{
    readonly enrollment: EnrollmentSession;
    readonly authorizationSecret: string;
  }> {
    const now = new Date();
    const authorizationSecret = generateOpaqueToken();
    const enrollment = await this.repository.create({
      id: randomUUID(),
      adminId,
      secretHash: hashOpaqueToken(authorizationSecret),
      expiresAt: new Date(now.getTime() + this.options.ttlSeconds * 1000),
    });

    return { enrollment, authorizationSecret };
  }

  async getOwned(
    enrollmentId: string,
    adminId: string,
  ): Promise<EnrollmentSession> {
    this.assertUuid(enrollmentId);
    const enrollment = await this.repository.findById(enrollmentId);

    if (enrollment === null || enrollment.adminId !== adminId) {
      throw new AppError(
        404,
        'ENROLLMENT_NOT_FOUND',
        'Enrollment session was not found.',
      );
    }

    if (
      enrollment.status === 'PENDING' &&
      enrollment.expiresAt.getTime() <= Date.now()
    ) {
      throw new AppError(
        410,
        'ENROLLMENT_EXPIRED',
        'Enrollment session has expired.',
      );
    }

    return enrollment;
  }

  async listOwned(adminId: string): Promise<EnrollmentSession[]> {
    return this.repository.listByAdminId(adminId);
  }

  async cancel(
    enrollmentId: string,
    adminId: string,
  ): Promise<EnrollmentSession> {
    this.assertUuid(enrollmentId);
    const current = await this.getOwned(enrollmentId, adminId);

    if (current.status === 'COMPLETED') {
      throw new AppError(
        409,
        'ENROLLMENT_ALREADY_CONSUMED',
        'Completed enrollment sessions cannot be cancelled.',
      );
    }

    if (current.status === 'EXPIRED') {
      throw new AppError(
        410,
        'ENROLLMENT_EXPIRED',
        'Enrollment session has expired.',
      );
    }

    if (current.status === 'CANCELLED') return current;

    if (current.status !== 'PENDING') {
      throw new AppError(
        409,
        'ENROLLMENT_STATE_CONFLICT',
        'Enrollment session cannot be cancelled in its current state.',
      );
    }

    const result = await this.repository.cancelOwned(
      enrollmentId,
      adminId,
      new Date(),
    );

    if (result === null) {
      throw new AppError(
        404,
        'ENROLLMENT_NOT_FOUND',
        'Enrollment session was not found.',
      );
    }

    if (result.status === 'EXPIRED') {
      throw new AppError(
        410,
        'ENROLLMENT_EXPIRED',
        'Enrollment session has expired.',
      );
    }

    return result;
  }

  async consume(input: {
    enrollmentId: string;
    authorizationSecret: string;
    localInstallationIdentity: string;
    name: string;
    platform: string;
  }): Promise<EnrollmentSession> {
    this.assertUuid(input.enrollmentId);

    if (!IDENTIFIER_SCHEMA.test(input.localInstallationIdentity)) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Local installation identity has an invalid format.',
      );
    }

    const name = input.name.trim();
    if (name.length === 0 || name.length > 100) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Device name must be between 1 and 100 characters.',
      );
    }

    if (input.platform !== 'android') {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Only the Android managed-device platform is supported by this contract.',
      );
    }

    if (!/^[A-Za-z0-9_-]{43}$/.test(input.authorizationSecret)) {
      throw new AppError(
        401,
        'INVALID_ENROLLMENT_VERIFICATION',
        'Enrollment verification failed.',
      );
    }

    try {
      return await this.repository.consume({
        id: input.enrollmentId,
        secretHash: hashOpaqueToken(input.authorizationSecret),
        managedDeviceId: randomUUID(),
        stableIdentifier: input.localInstallationIdentity,
        name,
        platform: 'android',
        now: new Date(),
        maxAttempts: this.options.maxVerificationAttempts,
      });
    } catch (error) {
      if (error instanceof PersistenceError) {
        switch (error.code) {
          case 'NOT_FOUND':
            throw new AppError(
              404,
              'ENROLLMENT_NOT_FOUND',
              'Enrollment session was not found.',
            );
          case 'CONFLICT':
            throw new AppError(
              409,
              'DEVICE_IDENTITY_CONFLICT',
              'The managed-device identity is already associated with a device.',
            );
          case 'INVALID_STATE':
            if (error.message === 'Enrollment session expired.') {
              throw new AppError(
                410,
                'ENROLLMENT_EXPIRED',
                'Enrollment session has expired.',
              );
            }
            if (
              error.message ===
              'Enrollment verification is no longer available.'
            ) {
              throw new AppError(
                429,
                'RATE_LIMITED',
                'Enrollment verification is temporarily unavailable.',
              );
            }
            if (error.message === 'Enrollment verification failed.') {
              throw new AppError(
                401,
                'INVALID_ENROLLMENT_VERIFICATION',
                'Enrollment verification failed.',
              );
            }
            if (
              error.message ===
              'Enrollment authorization is no longer available.'
            ) {
              throw new AppError(
                403,
                'AUTHORIZATION_DENIED',
                'Enrollment authorization is no longer available.',
              );
            }
            throw new AppError(
              409,
              'ENROLLMENT_STATE_CONFLICT',
              'Enrollment session is not available for consumption.',
            );
          default:
            throw error;
        }
      }
      throw error;
    }
  }

  private assertUuid(value: string): void {
    if (!UUID_SCHEMA.test(value)) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Enrollment identifier is invalid.',
      );
    }
  }
}
