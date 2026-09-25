import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { CommandService } from '../services/command-service.js';

const createSchema = z.object({
  managedDeviceId: z.string().uuid(),
  type: z.literal('FUTURE_COMMAND'),
  schemaVersion: z.literal(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  expiresAt: z.string().datetime().optional(),
}).strict();

const idSchema = z.object({ commandId: z.string().uuid() }).strict();

export const createCommandController = (service: CommandService) => ({
  create: (async (req, res, next) => {
    const parsed = createSchema.safeParse(req.body);
    const admin = req.authenticatedAdmin;
    const idempotencyKey = req.header('idempotency-key');
    if (!parsed.success || admin === undefined || idempotencyKey === undefined) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid command request.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const command = await service.create({
        adminId: admin.id,
        managedDeviceId: parsed.data.managedDeviceId,
        type: parsed.data.type,
        schemaVersion: parsed.data.schemaVersion,
        payload: parsed.data.payload,
        idempotencyKey,
        ...(parsed.data.expiresAt === undefined ? {} : { expiresAt: new Date(parsed.data.expiresAt) }),
      });
      res.status(201).json({ data: { command: commandResponse(command) }, requestId: res.locals.requestId });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  list: (async (req, res, next) => {
    const admin = req.authenticatedAdmin;
    if (admin === undefined) { next(new Error('Authentication boundary missing.')); return; }
    try {
      const page = await service.listOwned(admin.id);
      res.status(200).json({ data: { commands: page.items.map(commandResponse), nextCursor: page.nextCursor }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  get: (async (req, res, next) => {
    const parsed = idSchema.safeParse(req.params);
    const admin = req.authenticatedAdmin;
    if (!parsed.success || admin === undefined) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid command identifier.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const command = await service.getOwned(parsed.data.commandId, admin.id);
      res.status(200).json({ data: { command: commandResponse(command) }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,

  cancel: (async (req, res, next) => {
    const parsed = idSchema.safeParse(req.params);
    const admin = req.authenticatedAdmin;
    if (!parsed.success || admin === undefined) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid command identifier.' }, requestId: res.locals.requestId });
      return;
    }
    try {
      const command = await service.cancel(parsed.data.commandId, admin.id);
      res.status(200).json({ data: { command: commandResponse(command) }, requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,
});

const commandResponse = (command: {
  id: string; managedDeviceId: string; adminId: string; type: string; schemaVersion: number;
  payload: Record<string, unknown>; status: string; createdAt: Date; expiresAt: Date;
  deliveredAt: Date | null; acknowledgedAt: Date | null; startedAt: Date | null; completedAt: Date | null;
  failureCode: string | null; correlationId: string; idempotencyKey: string; sessionId: string | null;
}) => ({
  id: command.id,
  managedDeviceId: command.managedDeviceId,
  adminId: command.adminId,
  type: command.type,
  schemaVersion: command.schemaVersion,
  payload: command.payload,
  status: command.status,
  createdAt: command.createdAt.toISOString(),
  expiresAt: command.expiresAt.toISOString(),
  deliveredAt: command.deliveredAt?.toISOString() ?? null,
  acknowledgedAt: command.acknowledgedAt?.toISOString() ?? null,
  startedAt: command.startedAt?.toISOString() ?? null,
  completedAt: command.completedAt?.toISOString() ?? null,
  failureCode: command.failureCode,
  correlationId: command.correlationId,
  idempotencyKey: command.idempotencyKey,
  sessionId: command.sessionId,
});
