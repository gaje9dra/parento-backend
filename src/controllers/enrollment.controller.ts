import type { RequestHandler } from 'express';
import { z } from 'zod';
import { logger } from '../logging/logger.js';
import type { EnrollmentSessionService } from '../services/enrollment-session-service.js';

const enrollmentIdSchema = z
  .object({
    enrollmentId: z.string().uuid(),
  })
  .strict();

const consumeSchema = z
  .object({
    authorizationSecret: z.string().min(20).max(256),
    localInstallationIdentity: z.string().min(8).max(128),
    name: z.string().trim().min(1).max(100),
    platform: z.literal('android'),
  })
  .strict();

const toResponse = (enrollment: {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  managedDeviceId: string | null;
  verificationAttempts: number;
}) => ({
  id: enrollment.id,
  status: enrollment.status,
  createdAt: enrollment.createdAt.toISOString(),
  updatedAt: enrollment.updatedAt.toISOString(),
  expiresAt: enrollment.expiresAt.toISOString(),
  verifiedAt: enrollment.verifiedAt?.toISOString() ?? null,
  completedAt: enrollment.completedAt?.toISOString() ?? null,
  cancelledAt: enrollment.cancelledAt?.toISOString() ?? null,
  managedDeviceId: enrollment.managedDeviceId,
  verificationAttempts: enrollment.verificationAttempts,
});

const requireAdmin = (
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): string | null => {
  if (req.authenticatedAdmin === undefined) {
    res.status(401).json({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Administrator authentication is required.',
      },
      requestId: res.locals.requestId,
    });
    return null;
  }
  return req.authenticatedAdmin.id;
};

export const createEnrollmentController = (
  service: EnrollmentSessionService,
) => ({
  create: (async (req, res, next) => {
    const adminId = requireAdmin(req, res);
    if (adminId === null) return;

    try {
      const result = await service.create(adminId);
      logger.info(
        {
          event: 'enrollment_created',
          requestId: res.locals.requestId,
          enrollmentId: result.enrollment.id,
          adminId,
        },
        'Enrollment session created',
      );

      res.status(201).json({
        data: {
          enrollment: toResponse(result.enrollment),
          authorizationSecret: result.authorizationSecret,
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  list: (async (req, res, next) => {
    const adminId = requireAdmin(req, res);
    if (adminId === null) return;

    try {
      const enrollments = await service.listOwned(adminId);
      res.status(200).json({
        data: { enrollments: enrollments.map(toResponse) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  get: (async (req, res, next) => {
    const parsed = enrollmentIdSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid enrollment identifier.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }

    const adminId = requireAdmin(req, res);
    if (adminId === null) return;

    try {
      const enrollment = await service.getOwned(
        parsed.data.enrollmentId,
        adminId,
      );
      res.status(200).json({
        data: { enrollment: toResponse(enrollment) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  cancel: (async (req, res, next) => {
    const parsed = enrollmentIdSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid enrollment identifier.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }

    const adminId = requireAdmin(req, res);
    if (adminId === null) return;

    try {
      const enrollment = await service.cancel(
        parsed.data.enrollmentId,
        adminId,
      );
      logger.info(
        {
          event: 'enrollment_cancelled',
          requestId: res.locals.requestId,
          enrollmentId: enrollment.id,
          adminId,
        },
        'Enrollment session cancelled',
      );
      res.status(200).json({
        data: { enrollment: toResponse(enrollment) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  consume: (async (req, res, next) => {
    const parsedParams = enrollmentIdSchema.safeParse(req.params);
    const parsedBody = consumeSchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid enrollment verification request.',
        },
        requestId: res.locals.requestId,
      });
      return;
    }

    try {
      const result = await service.consume({
        enrollmentId: parsedParams.data.enrollmentId,
        ...parsedBody.data,
      });

      logger.info(
        {
          event: 'enrollment_completed',
          requestId: res.locals.requestId,
          enrollmentId: result.enrollment.id,
          adminId: result.enrollment.adminId,
          managedDeviceId: result.enrollment.managedDeviceId,
        },
        'Enrollment session completed',
      );

      res.status(200).json({
        data: {
          enrollment: toResponse(result.enrollment),
          managedDeviceId: result.enrollment.managedDeviceId,
          deviceCredential: result.deviceCredential,
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      logger.warn(
        {
          event: 'enrollment_verification_failed',
          requestId: res.locals.requestId,
          enrollmentId: parsedParams.data.enrollmentId,
        },
        'Enrollment verification failed',
      );
      next(error);
    }
  }) as RequestHandler,
});
