import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { LocationService } from '../services/location-service.js';

const reportSchema = z.object({
  reportId: z.string().uuid(),
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  accuracyMeters: z.number().finite().nullable().optional(),
  observedAt: z.string().datetime({ offset: true }),
}).strict();

const deviceIdSchema = z.object({ deviceId: z.string().uuid() }).strict();

const serialize = (location: Awaited<ReturnType<LocationService['getForAdmin']>>) => ({
  location: location.location === null ? null : {
    managedDeviceId: location.location.managedDeviceId,
    availability: location.location.availability,
    latitude: location.location.latitude,
    longitude: location.location.longitude,
    accuracyMeters: location.location.accuracyMeters,
    observedAt: location.location.observedAt.toISOString(),
    receivedAt: location.location.receivedAt.toISOString(),
    reportId: location.location.reportId,
  },
  freshness: location.freshness,
});

export const createLocationController = (service: LocationService) => ({
  report: (async (req, res, next) => {
    try {
      if (!req.authenticatedDeviceSession) {
        res.status(401).json({ error: { code: 'DEVICE_SESSION_INVALID', message: 'Managed-device session is required.' }, requestId: res.locals.requestId });
        return;
      }
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid location report.' }, requestId: res.locals.requestId });
        return;
      }
      const result = await service.report(req.authenticatedDeviceSession, {
        reportId: parsed.data.reportId,
        availability: parsed.data.availability,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
        accuracyMeters: parsed.data.accuracyMeters ?? null,
        observedAt: new Date(parsed.data.observedAt),
      });
      res.status(result.applied ? 202 : 200).json({
        data: {
          accepted: result.applied,
          location: serialize(result).location,
          freshness: result.freshness,
        },
        requestId: res.locals.requestId,
      });
    } catch (error) { next(error); }
  }) as RequestHandler,
  get: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) {
        res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Administrator authentication is required.' }, requestId: res.locals.requestId });
        return;
      }
      const parsed = deviceIdSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid managed-device identifier.' }, requestId: res.locals.requestId });
        return;
      }
      const result = await service.getForAdmin(req.authenticatedAdmin.id, parsed.data.deviceId);
      res.status(200).json({ data: serialize(result), requestId: res.locals.requestId });
    } catch (error) { next(error); }
  }) as RequestHandler,
});
