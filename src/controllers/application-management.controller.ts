import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { ApplicationManagementService } from '../services/application-management-service.js';

const packageName = z
  .string()
  .trim()
  .min(3)
  .max(255)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/);
const dateField = z.string().datetime({ offset: true }).transform((v) => new Date(v));
const policyId = z.string().uuid();
const rule = z.object({ packageName, action: z.enum(['ALLOW', 'BLOCK']) }).strict();
const inventoryItem = z
  .object({
    packageName,
    label: z.string().trim().max(512).nullable().optional(),
    versionName: z.string().trim().max(128).nullable().optional(),
    versionCode: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    installState: z.enum(['INSTALLED', 'UPDATED', 'UNINSTALLED', 'UNKNOWN']),
    enabled: z.boolean().nullable().optional(),
    sourceCategory: z.string().trim().max(128).nullable().optional(),
  })
  .strict();

const deviceParam = z.object({ deviceId: z.string().uuid() }).strict();
const policyParam = z.object({ policyId }).strict();
const applicationParam = z.object({ deviceId: z.string().uuid(), packageName }).strict();

const toPolicy = (policy: any) => ({
  ...policy,
  createdAt: policy.createdAt.toISOString(),
  updatedAt: policy.updatedAt.toISOString(),
});

const toInventory = (item: any) => ({
  ...item,
  firstObservedAt: item.firstObservedAt.toISOString(),
  lastObservedAt: item.lastObservedAt.toISOString(),
  lastReceivedAt: item.lastReceivedAt.toISOString(),
});

const toAssignment = (assignment: any) => ({
  ...assignment,
  assignedAt: assignment.assignedAt.toISOString(),
  updatedAt: assignment.updatedAt.toISOString(),
});

const toSync = (sync: any) =>
  sync === null
    ? null
    : {
        ...sync,
        lastRequestedAt: sync.lastRequestedAt?.toISOString() ?? null,
        lastReportedAt: sync.lastReportedAt?.toISOString() ?? null,
        updatedAt: sync.updatedAt.toISOString(),
      };

export const createApplicationManagementController = (
  service: ApplicationManagementService,
  limits: { maxInventoryItems: number; maxPolicyRules: number; maxPayloadBytes: number },
) => ({
  ingestInventory: (async (req, res, next) => {
    const schema = z.object({
      schemaVersion: z.literal(1),
      observedAt: dateField,
      applications: z.array(inventoryItem).max(limits.maxInventoryItems),
    }).strict();
    const parsed = schema.safeParse(req.body);
    const session = req.authenticatedDeviceSession;
    if (!session) {
      res.status(401).json({
        error: { code: 'DEVICE_SESSION_INVALID', message: 'Managed-device session is required.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'Invalid application inventory payload.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    try {
      const result = await service.reportInventory({
        managedDeviceId: session.managedDeviceId,
        observedAt: parsed.data.observedAt,
        receivedAt: new Date(),
        items: parsed.data.applications.map((item) => ({
          packageName: item.packageName,
          label: item.label ?? null,
          versionName: item.versionName ?? null,
          versionCode: item.versionCode ?? null,
          installState: item.installState,
          enabled: item.enabled ?? null,
          sourceCategory: item.sourceCategory ?? null,
        })),
      });
      res.status(200).json({
        data: { accepted: result.applied, receivedAt: result.receivedAt.toISOString() },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  getDevicePolicy: (async (req, res, next) => {
    if (!req.authenticatedDeviceSession) {
      res.status(401).json({
        error: { code: 'DEVICE_SESSION_INVALID', message: 'Managed-device session is required.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    try {
      const result = await service.getDevicePolicy(req.authenticatedDeviceSession.managedDeviceId);
      res.status(200).json({ data: result, requestId: res.locals.requestId });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  reportDeviceStatus: (async (req, res, next) => {
    const schema = z.object({
      policyId: policyId.nullable(),
      policyVersion: z.number().int().positive().nullable(),
      status: z.enum(['UNKNOWN','PENDING','APPLIED','PARTIALLY_APPLIED','FAILED','STALE']),
      reportedAt: dateField,
      errorCode: z.string().trim().max(128).nullable(),
    }).strict();
    const parsed = schema.safeParse(req.body);
    const session = req.authenticatedDeviceSession;
    if (!session) {
      res.status(401).json({
        error: { code: 'DEVICE_SESSION_INVALID', message: 'Managed-device session is required.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'Invalid application policy status payload.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    try {
      const result = await service.reportDeviceStatus({
        deviceId: session.managedDeviceId,
        ...parsed.data,
      });
      res.status(200).json({ data: { synchronization: toSync(result) }, requestId: res.locals.requestId });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listInventory: (async (req, res, next) => {
    const p = deviceParam.safeParse(req.params);
    if (!p.success || !req.authenticatedAdmin) {
      res.status(p.success ? 401 : 400).json({
        error: { code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success ? 'Administrator authentication is required.' : 'Invalid device identifier.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    try {
      const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const cursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
      const limit = limitRaw === undefined ? undefined : Number(limitRaw);
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Application page limit must be between 1 and 100.' }, requestId: res.locals.requestId });
        return;
      }
      const result = await service.listInventory(req.authenticatedAdmin.id, p.data.deviceId, { limit, cursor: typeof cursor === 'string' ? cursor : null });
      res.status(200).json({
        data: {
          applications: result.items.map(toInventory),
          nextCursor: result.nextCursor,
          observedAt: result.observedAt?.toISOString() ?? null,
          receivedAt: result.receivedAt?.toISOString() ?? null,
          freshness: result.freshness,
        },
        requestId: res.locals.requestId,
      });
    } catch (error) { next(error); }
  }) as RequestHandler,

  getInventoryItem: (async (req, res, next) => {
    const p = applicationParam.safeParse(req.params);
    if (!p.success || !req.authenticatedAdmin) {
      res.status(p.success ? 401 : 400).json({
        error: { code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success ? 'Administrator authentication is required.' : 'Invalid application identifier.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    try {
      const item = await service.getInventoryItem(req.authenticatedAdmin.id, p.data.deviceId, p.data.packageName);
      if (!item) {
        res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Application inventory item was not found.' }, requestId: res.locals.requestId });
        return;
      }
      res.status(200).json({ data: { application: toInventory(item) }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  requestInventory: (async (req, res, next) => {
    const p = deviceParam.safeParse(req.params);
    if (!p.success || !req.authenticatedAdmin) {
      res.status(p.success ? 401 : 400).json({ error: { code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success ? 'Administrator authentication is required.' : 'Invalid device identifier.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const result = await service.requestInventory(req.authenticatedAdmin.id, p.data.deviceId);
      res.status(result.created ? 201 : 200).json({ data: { command: result.command, created: result.created }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  createPolicy: (async (req, res, next) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(160),
      description: z.string().trim().max(2000).nullable().optional(),
      rules: z.array(rule).max(limits.maxPolicyRules),
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success || !req.authenticatedAdmin) {
      res.status(parsed.success ? 401 : 400).json({ error: { code: parsed.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: parsed.success ? 'Administrator authentication is required.' : 'Invalid application policy payload.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const policy = await service.createPolicy({ adminId: req.authenticatedAdmin.id, name: parsed.data.name, description: parsed.data.description ?? null, rules: parsed.data.rules });
      res.status(201).json({ data: { policy: toPolicy(policy) }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  listPolicies: (async (req, res, next) => {
    if (!req.authenticatedAdmin) {
      res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Administrator authentication is required.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const cursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
      const result = await service.listPolicies(req.authenticatedAdmin.id, { cursor: typeof cursor === 'string' ? cursor : null });
      res.status(200).json({ data: { policies: result.items.map(toPolicy), nextCursor: result.nextCursor }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  getPolicy: (async (req, res, next) => {
    const p = policyParam.safeParse(req.params);
    if (!p.success || !req.authenticatedAdmin) {
      res.status(p.success ? 401 : 400).json({ error: { code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success ? 'Administrator authentication is required.' : 'Invalid policy identifier.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const policy = await service.getPolicy(req.authenticatedAdmin.id, p.data.policyId);
      res.status(200).json({ data: { policy: toPolicy(policy) }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  updatePolicy: (async (req, res, next) => {
    const p = policyParam.safeParse(req.params);
    const schema = z.object({
      name: z.string().trim().min(1).max(160),
      description: z.string().trim().max(2000).nullable().optional(),
      status: z.enum(['ACTIVE','DISABLED']),
      expectedVersion: z.number().int().positive(),
      rules: z.array(rule).max(limits.maxPolicyRules),
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!p.success || !parsed.success || !req.authenticatedAdmin) {
      res.status(p.success && parsed.success ? 401 : 400).json({ error: { code: p.success && parsed.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success && parsed.success ? 'Administrator authentication is required.' : 'Invalid application policy update.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const policy = await service.updatePolicy({ adminId: req.authenticatedAdmin.id, policyId: p.data.policyId, name: parsed.data.name, description: parsed.data.description ?? null, status: parsed.data.status, expectedVersion: parsed.data.expectedVersion, rules: parsed.data.rules });
      res.status(200).json({ data: { policy: toPolicy(policy) }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  assignPolicy: (async (req, res, next) => {
    const p = deviceParam.safeParse(req.params);
    const b = z.object({ policyId }).strict().safeParse(req.body);
    if (!p.success || !b.success || !req.authenticatedAdmin) {
      res.status(p.success && b.success ? 401 : 400).json({ error: { code: p.success && b.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success && b.success ? 'Administrator authentication is required.' : 'Invalid policy assignment.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const result = await service.assignPolicy(req.authenticatedAdmin.id, p.data.deviceId, b.data.policyId);
      res.status(200).json({ data: { assignment: toAssignment(result.assignment), synchronization: { command: result.sync.command, state: toSync(result.sync.sync) } }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  removePolicy: (async (req, res, next) => {
    const p = deviceParam.safeParse(req.params);
    const b = z.object({ policyId }).strict().safeParse(req.body);
    if (!p.success || !b.success || !req.authenticatedAdmin) {
      res.status(p.success && b.success ? 401 : 400).json({ error: { code: p.success && b.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success && b.success ? 'Administrator authentication is required.' : 'Invalid policy removal.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const result = await service.removePolicy(req.authenticatedAdmin.id, p.data.deviceId, b.data.policyId);
      res.status(200).json({ data: { removed: result.removed, synchronization: { command: result.sync.command, state: toSync(result.sync.sync) } }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  effectivePolicy: (async (req, res, next) => {
    const p = deviceParam.safeParse(req.params);
    if (!p.success || !req.authenticatedAdmin) {
      res.status(p.success ? 401 : 400).json({ error: { code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success ? 'Administrator authentication is required.' : 'Invalid device identifier.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      res.status(200).json({ data: await service.getEffectivePolicy(req.authenticatedAdmin.id, p.data.deviceId), requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  enforcementStatus: (async (req, res, next) => {
    const p = deviceParam.safeParse(req.params);
    if (!p.success || !req.authenticatedAdmin) {
      res.status(p.success ? 401 : 400).json({ error: { code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success ? 'Administrator authentication is required.' : 'Invalid device identifier.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      res.status(200).json({ data: { synchronization: toSync(await service.getEnforcementStatus(req.authenticatedAdmin.id, p.data.deviceId)) }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  syncPolicy: (async (req, res, next) => {
    const p = deviceParam.safeParse(req.params);
    if (!p.success || !req.authenticatedAdmin) {
      res.status(p.success ? 401 : 400).json({ error: { code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST', message: p.success ? 'Administrator authentication is required.' : 'Invalid device identifier.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const effective = await service.getEffectivePolicy(req.authenticatedAdmin.id, p.data.deviceId);
      const result = await service.requestPolicySync(
        req.authenticatedAdmin.id,
        p.data.deviceId,
        effective.policy?.id ?? null,
        effective.policy?.version ?? null,
      );
      res.status(result.command.created ? 201 : 200).json({ data: { command: result.command.command, synchronization: toSync(result.sync) }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,
});
