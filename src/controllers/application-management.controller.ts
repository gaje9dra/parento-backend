import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { ApplicationManagementService } from '../services/application-management-service.js';

const packageName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/);
const policyRules = z
  .array(
    z
      .object({
        packageName,
        action: z.enum(['ALLOW', 'BLOCK']),
      })
      .strict(),
  )
  .max(500);
const policyBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().default(null),
    rules: policyRules,
  })
  .strict();
const policyId = z.object({ policyId: z.string().uuid() }).strict();
const deviceId = z.object({ deviceId: z.string().uuid() }).strict();
const inventoryBody = z
  .object({
    schemaVersion: z.literal(1),
    synchronizationId: z.string().uuid(),
    observedAt: z.string().datetime({ offset: true }),
    applications: z
      .array(
        z
          .object({
            packageName,
            label: z.string().trim().max(255).nullable().default(null),
            versionName: z.string().trim().max(128).nullable().default(null),
            versionCode: z
              .number()
              .int()
              .nonnegative()
              .safe()
              .nullable()
              .default(null),
            installState: z
              .enum(['INSTALLED', 'UNINSTALLED', 'UNKNOWN'])
              .default('INSTALLED'),
            enabled: z.boolean().nullable().default(null),
            category: z.string().trim().max(128).nullable().default(null),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
const enforcementBody = z
  .object({
    policyId: z.string().uuid().nullable(),
    policyVersion: z.number().int().positive().nullable(),
    status: z.enum([
      'UNKNOWN',
      'PENDING',
      'APPLIED',
      'PARTIALLY_APPLIED',
      'FAILED',
      'STALE',
    ]),
    failureCode: z.string().trim().max(100).nullable().default(null),
  })
  .strict();

const invalid = (res: any, message: string) =>
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message },
    requestId: res.locals.requestId,
  });
const adminRequired = (res: any) =>
  res.status(401).json({
    error: {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Administrator authentication is required.',
    },
    requestId: res.locals.requestId,
  });

const serializeDates = (value: any): any => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeDates);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value))
      result[key] = serializeDates(item);
    return result;
  }
  return value;
};

export const createApplicationManagementController = (
  service: ApplicationManagementService,
) => ({
  ingestInventory: (async (req, res, next) => {
    try {
      const session = req.authenticatedDeviceSession;
      if (!session)
        return res.status(401).json({
          error: {
            code: 'DEVICE_SESSION_INVALID',
            message: 'Managed-device session is required.',
          },
          requestId: res.locals.requestId,
        });
      const parsed = inventoryBody.safeParse(req.body);
      if (!parsed.success)
        return invalid(res, 'Invalid application inventory payload.');
      const result = await service.submitInventory(session, {
        schemaVersion: parsed.data.schemaVersion,
        synchronizationId: parsed.data.synchronizationId,
        observedAt: new Date(parsed.data.observedAt),
        applications: parsed.data.applications,
      });
      return res.status(result.applied ? 202 : 200).json({
        data: {
          accepted: result.applied,
          synchronization: serializeDates(result.state),
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  reportEnforcement: (async (req, res, next) => {
    try {
      const session = req.authenticatedDeviceSession;
      if (!session)
        return res.status(401).json({
          error: {
            code: 'DEVICE_SESSION_INVALID',
            message: 'Managed-device session is required.',
          },
          requestId: res.locals.requestId,
        });
      const parsed = enforcementBody.safeParse(req.body);
      if (!parsed.success)
        return invalid(res, 'Invalid application enforcement status.');
      const result = await service.reportEnforcement(session, parsed.data);
      return res.status(200).json({
        data: { enforcement: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listInventory: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const parsed = deviceId.safeParse(req.params);
      if (!parsed.success)
        return invalid(res, 'Invalid managed-device identifier.');
      const limitRaw = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;
      const cursorRaw = Array.isArray(req.query.cursor)
        ? req.query.cursor[0]
        : req.query.cursor;
      const limit = limitRaw === undefined ? undefined : Number(limitRaw);
      if (
        limit !== undefined &&
        (!Number.isInteger(limit) || limit < 1 || limit > 100)
      )
        return invalid(
          res,
          'Application page limit must be between 1 and 100.',
        );
      if (cursorRaw !== undefined && typeof cursorRaw !== 'string')
        return invalid(res, 'Invalid application page cursor.');
      const result = await service.listInventory(
        req.authenticatedAdmin.id,
        parsed.data.deviceId,
        { limit, cursor: cursorRaw },
      );
      return res.status(200).json({
        data: {
          applications: serializeDates(result.items),
          freshness: result.freshness,
          synchronization: serializeDates(result.synchronization),
          nextCursor: result.nextCursor,
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  getInventoryItem: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const parsed = z
        .object({ deviceId: z.string().uuid(), packageName })
        .safeParse(req.params);
      if (!parsed.success)
        return invalid(res, 'Invalid application identifier.');
      const result = await service.getInventoryItem(
        req.authenticatedAdmin.id,
        parsed.data.deviceId,
        parsed.data.packageName,
      );
      return res.status(200).json({
        data: { application: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listPolicies: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const result = await service.listPolicies(req.authenticatedAdmin.id);
      return res.status(200).json({
        data: { policies: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  createPolicy: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const parsed = policyBody.safeParse(req.body);
      if (!parsed.success) return invalid(res, 'Invalid application policy.');
      const result = await service.createPolicy(
        req.authenticatedAdmin.id,
        parsed.data,
      );
      return res.status(201).json({
        data: { policy: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  getPolicy: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const parsed = policyId.safeParse(req.params);
      if (!parsed.success)
        return invalid(res, 'Invalid application policy identifier.');
      const result = await service.getPolicy(
        req.authenticatedAdmin.id,
        parsed.data.policyId,
      );
      return res.status(200).json({
        data: { policy: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  updatePolicy: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const p = policyId.safeParse(req.params);
      const b = policyBody.safeParse(req.body);
      if (!p.success || !b.success)
        return invalid(res, 'Invalid application policy.');
      const result = await service.updatePolicy(
        req.authenticatedAdmin.id,
        p.data.policyId,
        b.data,
      );
      return res.status(200).json({
        data: { policy: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  disablePolicy: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const parsed = policyId.safeParse(req.params);
      if (!parsed.success)
        return invalid(res, 'Invalid application policy identifier.');
      const result = await service.disablePolicy(
        req.authenticatedAdmin.id,
        parsed.data.policyId,
      );
      return res.status(200).json({
        data: { policy: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  assignPolicy: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const p = deviceId.safeParse(req.params);
      const b = z
        .object({ policyId: z.string().uuid() })
        .strict()
        .safeParse(req.body);
      if (!p.success || !b.success)
        return invalid(res, 'Invalid application policy assignment.');
      const result = await service.assignPolicy(
        req.authenticatedAdmin.id,
        p.data.deviceId,
        b.data.policyId,
      );
      return res.status(200).json({
        data: { assignment: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  removeAssignment: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const p = deviceId.safeParse(req.params);
      if (!p.success) return invalid(res, 'Invalid managed-device identifier.');
      const result = await service.removeAssignment(
        req.authenticatedAdmin.id,
        p.data.deviceId,
      );
      return res
        .status(200)
        .json({ data: result, requestId: res.locals.requestId });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  effectivePolicy: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const p = deviceId.safeParse(req.params);
      if (!p.success) return invalid(res, 'Invalid managed-device identifier.');
      const result = await service.getEffectivePolicy(
        req.authenticatedAdmin.id,
        p.data.deviceId,
      );
      return res.status(200).json({
        data: { policy: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  enforcementStatus: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const p = deviceId.safeParse(req.params);
      if (!p.success) return invalid(res, 'Invalid managed-device identifier.');
      const result = await service.getEnforcementStatus(
        req.authenticatedAdmin.id,
        p.data.deviceId,
      );
      return res.status(200).json({
        data: { enforcement: serializeDates(result) },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  requestInventory: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) return adminRequired(res);
      const p = deviceId.safeParse(req.params);
      if (!p.success) return invalid(res, 'Invalid managed-device identifier.');
      const result = await service.requestInventory(
        req.authenticatedAdmin.id,
        p.data.deviceId,
      );
      return res.status(result.created ? 201 : 200).json({
        data: {
          command: serializeDates(result.command),
          created: result.created,
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
});
