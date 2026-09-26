import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { DeviceMonitoringService } from '../services/device-monitoring-service.js';
import { AppError } from '../types/errors.js';
import type { DeviceMonitoringSnapshot } from '../domain/device-monitoring.js';

const monitoringSchema = z
  .object({
    managedDeviceId: z.string().uuid(),
    schemaVersion: z.literal(1),
    deviceCollectedAtEpochMillis: z.number().int().safe(),
    androidVersion: z.string().min(1).max(64),
    apiLevel: z.number().int().min(1).max(1000),
    appVersion: z.string().min(1).max(64),
    appVersionCode: z.number().int().nonnegative().safe(),
    managementMode: z.enum([
      'NOT_MANAGED',
      'PROFILE_OWNER',
      'DEVICE_OWNER',
      'UNKNOWN',
    ]),
    batteryPercentage: z.number().int().min(0).max(100).nullable(),
    chargingState: z.enum([
      'CHARGING',
      'DISCHARGING',
      'FULL',
      'NOT_CHARGING',
      'UNKNOWN',
    ]),
    batteryStatus: z.enum(['NORMAL', 'LOW', 'CRITICAL', 'FULL', 'UNKNOWN']),
    networkState: z.enum(['UNKNOWN', 'OFFLINE', 'WIFI', 'CELLULAR', 'OTHER']),
    storageTotalBytes: z.number().int().nonnegative().safe().nullable(),
    storageAvailableBytes: z.number().int().nonnegative().safe().nullable(),
    storageUsedBytes: z.number().int().nonnegative().safe().nullable(),
    memoryTotalBytes: z.number().int().nonnegative().safe().nullable(),
    memoryAvailableBytes: z.number().int().nonnegative().safe().nullable(),
    memoryLow: z.boolean().nullable(),
    lastSuccessfulInitializationEpochMillis: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable(),
    lastSuccessfulCommunicationEpochMillis: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable(),
    lastMonitoringUpdateEpochMillis: z.number().int().positive().safe(),
  })
  .strict();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(512).optional(),
  enrollmentStatus: z.enum(['PENDING', 'ACTIVE', 'REVOKED']).optional(),
  communicationState: z
    .enum(['CONNECTING', 'CONNECTED', 'STALE', 'DISCONNECTED', 'EXPIRED'])
    .optional(),
  managementMode: z
    .enum(['NOT_MANAGED', 'PROFILE_OWNER', 'DEVICE_OWNER', 'UNKNOWN'])
    .optional(),
  freshness: z
    .enum([
      'FRESH',
      'STALE',
      'VERY_STALE',
      'NEVER_REPORTED',
      'DISCONNECTED',
      'REVOKED',
    ])
    .optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const toSnapshot = (snapshot: DeviceMonitoringSnapshot | null) =>
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
        lastSuccessfulInitializationAt:
          snapshot.lastSuccessfulInitializationAt?.toISOString() ?? null,
        lastSuccessfulCommunicationAt:
          snapshot.lastSuccessfulCommunicationAt?.toISOString() ?? null,
        lastMonitoringUpdateAt: snapshot.lastMonitoringUpdateAt.toISOString(),
      };

const toSession = (
  session: {
    id: string;
    managedDeviceId: string;
    state: string;
    createdAt: Date;
    connectedAt: Date | null;
    lastActivityAt: Date;
    disconnectedAt: Date | null;
    expiresAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
  } | null,
) =>
  session === null
    ? null
    : {
        id: session.id,
        managedDeviceId: session.managedDeviceId,
        state: session.state,
        createdAt: session.createdAt.toISOString(),
        connectedAt: session.connectedAt?.toISOString() ?? null,
        lastActivityAt: session.lastActivityAt.toISOString(),
        disconnectedAt: session.disconnectedAt?.toISOString() ?? null,
        expiresAt: session.expiresAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString() ?? null,
      };

export const createDeviceMonitoringController = (
  monitoring: DeviceMonitoringService,
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
      const result = await monitoring.ingest(
        session.managedDeviceId,
        parsed.data,
        {
          id: session.id,
          expiresAt: session.expiresAt,
        },
      );
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
        throw new AppError(
          400,
          'INVALID_REQUEST',
          'Managed-device identifier is invalid.',
        );
      }

      const status = await monitoring.getStatusForAdmin(
        req.authenticatedAdmin.id,
        deviceId.data,
      );
      res.status(200).json({
        data: {
          device: {
            id: status.device.id,
            name: status.device.name,
            stableIdentifier: status.device.stableIdentifier,
            platform: status.device.platform,
            enrollmentStatus: status.device.enrollmentStatus,
            operationalStatus: status.device.operationalStatus,
            firstEnrolledAt: status.device.createdAt.toISOString(),
            lastSeenAt: status.device.lastSeenAt?.toISOString() ?? null,
          },
          connection: {
            state: status.connection.state,
            session: toSession(status.connection.session),
            lastConnectedAt:
              status.connection.session?.connectedAt?.toISOString() ?? null,
          },
          monitoring: {
            freshness: status.monitoring.freshness,
            ageMs: status.monitoring.ageMs,
            snapshot: toSnapshot(status.monitoring.snapshot),
          },
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  list: (async (req, res, next) => {
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
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(
          400,
          'INVALID_REQUEST',
          'Device monitoring query parameters are invalid.',
        );
      }

      const result = await monitoring.listForAdmin(
        req.authenticatedAdmin.id,
        parsed.data,
      );
      res.status(200).json({
        data: {
          items: result.items.map((item) => ({
            device: {
              id: item.device.id,
              name: item.device.name,
              stableIdentifier: item.device.stableIdentifier,
              platform: item.device.platform,
              enrollmentStatus: item.device.enrollmentStatus,
              operationalStatus: item.device.operationalStatus,
              firstEnrolledAt: item.device.createdAt.toISOString(),
              lastSeenAt: item.device.lastSeenAt?.toISOString() ?? null,
            },
            connection: {
              state: item.session?.state ?? 'DISCONNECTED',
              lastSeenAt: item.session?.lastSeenAt.toISOString() ?? null,
              expiresAt: item.session?.expiresAt.toISOString() ?? null,
            },
            monitoring: {
              freshness: item.freshness,
              ageMs: item.ageMs,
              managementMode: item.snapshot?.managementMode ?? 'UNKNOWN',
              androidVersion: item.snapshot?.androidVersion ?? null,
              apiLevel: item.snapshot?.apiLevel ?? null,
              appVersion: item.snapshot?.appVersion ?? null,
              batteryPercentage: item.snapshot?.batteryPercentage ?? null,
              chargingState: item.snapshot?.chargingState ?? null,
              networkState: item.snapshot?.networkState ?? null,
              storageAvailableBytes:
                item.snapshot?.storageAvailableBytes ?? null,
              memoryAvailableBytes: item.snapshot?.memoryAvailableBytes ?? null,
              lastTelemetryAt:
                item.snapshot?.lastMonitoringUpdateAt.toISOString() ?? null,
            },
          })),
          nextCursor: result.nextCursor,
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
});
