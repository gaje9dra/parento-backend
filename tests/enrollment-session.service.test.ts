import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  EnrollmentSession,
  EnrollmentSessionStatus,
} from '../src/domain/enrollment-session.js';
import type { EnrollmentSessionRepository } from '../src/repositories/enrollment-session-repository.js';
import { EnrollmentSessionService } from '../src/services/enrollment-session-service.js';

class FakeEnrollmentRepository implements EnrollmentSessionRepository {
  readonly name = 'fake-enrollment-session';

  private sessions = new Map<string, EnrollmentSession>();

  async create(input: {
    id: string;
    adminId: string;
    secretHash: string;
    expiresAt: Date;
  }): Promise<EnrollmentSession> {
    const now = new Date();
    const session: EnrollmentSession = {
      id: input.id,
      adminId: input.adminId,
      status: 'PENDING',
      secretHash: input.secretHash,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      verifiedAt: null,
      completedAt: null,
      cancelledAt: null,
      managedDeviceId: null,
      verificationAttempts: 0,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<EnrollmentSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async listByAdminId(adminId: string): Promise<EnrollmentSession[]> {
    return [...this.sessions.values()].filter((item) => item.adminId === adminId);
  }

  async cancelOwned(id: string, adminId: string, now: Date): Promise<EnrollmentSession | null> {
    const current = this.sessions.get(id);
    if (current === undefined || current.adminId !== adminId) return null;
    if (current.status !== 'PENDING') return current;
    const next = { ...current, status: 'CANCELLED' as const, cancelledAt: now, updatedAt: now };
    this.sessions.set(id, next);
    return next;
  }

  async consume(input: {
    id: string;
    secretHash: string;
    managedDeviceId: string;
    stableIdentifier: string;
    name: string;
    platform: string;
    now: Date;
  }): Promise<EnrollmentSession> {
    const current = this.sessions.get(input.id);
    if (current === undefined) throw new Error('Enrollment session not found.');
    if (current.expiresAt <= input.now) throw new Error('Enrollment session expired.');
    if (current.secretHash !== input.secretHash) throw new Error('Enrollment verification failed.');
    if (current.status !== 'PENDING') throw new Error('Enrollment verification is no longer available.');

    const next: EnrollmentSession = {
      ...current,
      status: 'COMPLETED',
      verifiedAt: input.now,
      completedAt: input.now,
      managedDeviceId: input.managedDeviceId,
      updatedAt: input.now,
    };
    this.sessions.set(input.id, next);
    return next;
  }
}

describe('EnrollmentSessionService', () => {
  it('creates short-lived enrollment authorization material without exposing its hash', async () => {
    const repository = new FakeEnrollmentRepository();
    const service = new EnrollmentSessionService(repository, {
      ttlSeconds: 900,
      maxVerificationAttempts: 10,
    });

    const result = await service.create(randomUUID());

    expect(result.authorizationSecret).toHaveLength(43);
    expect(result.enrollment.secretHash).not.toBe(result.authorizationSecret);
    expect(result.enrollment.status).toBe('PENDING');
    expect(result.enrollment.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('enforces ownership for enrollment status and cancellation', async () => {
    const repository = new FakeEnrollmentRepository();
    const service = new EnrollmentSessionService(repository, {
      ttlSeconds: 900,
      maxVerificationAttempts: 10,
    });
    const result = await service.create(randomUUID());

    await expect(service.getOwned(result.enrollment.id, randomUUID())).rejects.toMatchObject({
      statusCode: 404,
      code: 'ENROLLMENT_NOT_FOUND',
    });

    await expect(service.cancel(result.enrollment.id, randomUUID())).rejects.toMatchObject({
      statusCode: 404,
      code: 'ENROLLMENT_NOT_FOUND',
    });
  });

  it('does not permit completed enrollment cancellation', async () => {
    const repository = new FakeEnrollmentRepository();
    const service = new EnrollmentSessionService(repository, {
      ttlSeconds: 900,
      maxVerificationAttempts: 10,
    });
    const adminId = randomUUID();
    const result = await service.create(adminId);

    const completed = await repository.consume({
      id: result.enrollment.id,
      secretHash: result.enrollment.secretHash,
      managedDeviceId: randomUUID(),
      stableIdentifier: 'managed-installation-1',
      name: 'Child',
      platform: 'android',
      now: new Date(),
    });

    expect(completed.status).toBe('COMPLETED');
    await expect(service.cancel(result.enrollment.id, adminId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ENROLLMENT_ALREADY_CONSUMED',
    });
  });

  it('rejects malformed local installation identities before persistence', async () => {
    const repository = new FakeEnrollmentRepository();
    const service = new EnrollmentSessionService(repository, {
      ttlSeconds: 900,
      maxVerificationAttempts: 10,
    });

    await expect(
      service.consume({
        enrollmentId: randomUUID(),
        authorizationSecret: 'A'.repeat(43),
        localInstallationIdentity: 'x',
        name: 'Child',
        platform: 'android',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REQUEST' });
  });

  it('supports only the managed Android platform contract', async () => {
    const repository = new FakeEnrollmentRepository();
    const service = new EnrollmentSessionService(repository, {
      ttlSeconds: 900,
      maxVerificationAttempts: 10,
    });

    await expect(
      service.consume({
        enrollmentId: randomUUID(),
        authorizationSecret: 'A'.repeat(43),
        localInstallationIdentity: 'managed-installation-1',
        name: 'Child',
        platform: 'ios',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REQUEST' });
  });

  it('validates the documented enrollment state transition graph', async () => {
    const { isValidEnrollmentSessionTransition } = await import(
      '../src/domain/enrollment-session.js'
    );
    const valid: [EnrollmentSessionStatus, EnrollmentSessionStatus][] = [
      ['CREATED', 'PENDING'],
      ['PENDING', 'VERIFIED'],
      ['VERIFIED', 'COMPLETED'],
      ['PENDING', 'EXPIRED'],
      ['PENDING', 'CANCELLED'],
      ['PENDING', 'REVOKED'],
    ];
    for (const [from, to] of valid) {
      expect(isValidEnrollmentSessionTransition(from, to)).toBe(true);
    }
    expect(isValidEnrollmentSessionTransition('COMPLETED', 'PENDING')).toBe(false);
    expect(isValidEnrollmentSessionTransition('CANCELLED', 'PENDING')).toBe(false);
    expect(isValidEnrollmentSessionTransition('REVOKED', 'COMPLETED')).toBe(false);
  });
});
