import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { DeviceMonitoringService } from '../services/device-monitoring-service.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';
import { AppError } from '../types/errors.js';

const monitoringSchema = z.object({
  managedDeviceId: z.string().uuid(),
  schemaVersion: z.number().int(),
  deviceCollectedAtEpochMillis: z.number().int(),
  androidVersion: z.string().min(1).max(64),
  apiLevel: z.number().int(),
  appVersion: z.string().min(1).max(64),
  appVersionCode: z.number().int().nonnegative(),
  managementMode: z.enum(['NOT_MANAGED','PROFILE_OWNER','DEVICE_OWNER','UNKNOWN']),
  batteryPercentage: z.number().int().min(0).max(100).nullable(),
  chargingState: z.enum(['CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNKNOWN']),
  batteryStatus: z.enum(['NORMAL','LOW','CRITICAL','FULL','UNKNOWN']),
  networkState: z.enum(['UNKNOWN','OFFLINE','WIFI','CELLULAR','OTHER']),
  storageTotalBytes: z.number().int().nonnegative().nullable(),
  storageAvailableBytes: z.number().int().nonnegative().nullable(),
  storageUsedBytes: z.number().int().nonnegative().nullable(),
  memoryTotalBytes: z.number().int().nonnegative().nullable(),
  memoryAvailableBytes: z.number().int().nonnegative().nullable(),
  memoryLow: z.boolean().nullable(),
  lastSuccessfulInitializationEpochMillis: z.number().int().positive().nullable(),
  lastSuccessfulCommunicationEpochMillis: z.number().int().positive().nullable(),
  lastMonitoringUpdateEpochMillis: z.number().int().positive(),
}).strict();

const toSnapshot = (snapshot: NonNullable<Awaited<ReturnType<DeviceMonitoringService['getForAdmin']>>>) =>
  snapshot === null
    ? null
    : {
        managedDeviceId: snapshot.managedDeviceId,
        schemaVersion: snapshot.schemaVersion,
        deviceCollectedAt: snapshot.deviceCollectedAt.toISOString(),
        serverReceivedAt: snapshot.serverReceivedAt.toISOString(),
        androidVersion: snapshot.androidVersion,
        apiLevel: snapshot.apiLevel,
        appVersion: snapshot.appVersion,
        appVersionCode: snapshot.appVersionCode,
        managementMode: snapshot.managementMode,
        batteryPercentage: snapshot.batteryPercentage,
        chargingState: snapshot.chargingState,
        batteryStatus: snapshot.batteryStatus,
        networkState: snapshot.networkState,
        storageTotalBytes: snapshot.storageTotalBytes,
        storageAvailableBytes: snapshot.storageAvailableBytes,
        storageUsedBytes: snapshot.storageUsedBytes,
        memoryTotalBytes: snapshot.memoryTotalBytes,
        memoryAvailableBytes: snapshot.memoryAvailableBytes,
        memoryLow: snapshot.memoryLow,
        lastSuccessfulInitializationAt: snapshot.lastSuccessfulInitializationAt?.toISOString() ?? null,
        lastSuccessfulCommunicationAt: snapshot.lastSuccessfulCommunicationAt?.toISOString() ?? null,
        lastMonitoringUpdateAt: snapshot.lastMonitoringUpdateAt.toISOString(),
      };

export const createDeviceMonitoringController = (
  monitoring: DeviceMonitoringService,
  devices: ManagedDeviceRepository,
  sessions: DeviceConnectionSessionRepository,
) => ({
  ingest: (async (req, res, next) => {
    try {
      const parsed = monitoringSchema.safeParse(req.body);
      const session = req.authenticatedDeviceSession;
      if (session === undefined) {
        res.status(401).json({
          error: {
            code: 'DEVICE_SESSION_INVALID',
            message: 'Managed-device session is required.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_MONITORING_PAYLOAD',
            message: 'Invalid monitoring payload.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }
      const result = await monitoring.ingest(session.managedDeviceId, parsed.data);
      res.status(200).json({
        data: {
          updated: result.updated,
          serverReceivedAt: result.snapshot.serverReceivedAt.toISOString(),
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  status: (async (req, res, next) => {
    try {
      if (!req.authenticatedAdmin) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Administrator authentication is required.',
          },
          requestId: res.locals.requestId,
        });
        return;
      }

      const deviceId = z.string().uuid().safeParse(req.params.deviceId);
      if (!deviceId.success) {
        throw new AppError(400, 'INVALID_REQUEST', 'Managed-device identifier is invalid.');
      }

      const device = await devices.findById(deviceId.data);
      if (device === null) {
        throw new AppError(404, 'DEVICE_NOT_FOUND', 'Managed device was not found.');
      }
      if (device.adminId !== req.authenticatedAdmin.id) {
        throw new AppError(403, 'AUTHORIZATION_DENIED', 'The administrator does not control this device.');
      }

      const [snapshot, session] = await Promise.all([
        monitoring.getForAdmin(req.authenticatedAdmin.id, device.id),
        sessions.findActiveByDeviceId(device.id),
      ]);

      const now = Date.now();
      const sessionExpired = session === null || session.expiresAt.getTime() <= now;
      const lastSeenAgeMs = session === null ? null : Math.max(0, now - session.lastSeenAt.getTime());
      const freshness = snapshot === null
        ? 'UNKNOWN'
        : now - snapshot.serverReceivedAt.getTime() <= 5 * 60_000
          ? 'FRESH'
          : 'STALE';

      res.status(200).json({
        data: {
          device: {
            id: device.id,
            name: device.name,
            platform: device.platform,
            enrollmentStatus: device.enrollmentStatus,
            operationalStatus: device.operationalStatus,
            lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
          },
          connection: {
            state: sessionExpired ? 'EXPIRED' : session?.state ?? 'DISCONNECTED',
            sessionId: sessionExpired ? null : session?.id ?? null,
            lastSeenAt: sessionExpired ? null : session?.lastSeenAt.toISOString() ?? null,
            lastSeenAgeMs,
            expiresAt: sessionExpired ? null : session?.expiresAt.toISOString() ?? null,
          },
          monitoring: {
            freshness,
            snapshot: toSnapshot(snapshot),
          },
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
});
