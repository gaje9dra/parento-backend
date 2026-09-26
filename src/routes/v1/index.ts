import { Router } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/index.js';
import { PostgresAdminRepository } from '../../repositories/postgres-admin-repository.js';
import { PostgresDeviceCredentialRepository } from '../../repositories/postgres-device-credential-repository.js';
import { PostgresDeviceConnectionSessionRepository } from '../../repositories/postgres-device-connection-session-repository.js';
import { PostgresManagedDeviceRepository } from '../../repositories/postgres-managed-device-repository.js';
import { PostgresCommandRepository } from '../../repositories/postgres-command-repository.js';
import { PostgresEnrollmentSessionRepository } from '../../repositories/postgres-enrollment-session-repository.js';
import { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import { EnrollmentSessionService } from '../../services/enrollment-session-service.js';
import { createAdminAuthRouter } from './admin-auth.routes.js';
import { createEnrollmentRouter } from './enrollment.routes.js';
import { createHealthRouter } from './health.routes.js';
import { createCommandRouter } from './command.routes.js';
import { createDeviceCommunicationRouter } from './device-communication.routes.js';
import { DeviceCommunicationService } from '../../services/device-communication-service.js';
import { CommandService } from '../../services/command-service.js';
import { PostgresLocationRepository } from '../../repositories/postgres-location-repository.js';
import { LocationService } from '../../services/location-service.js';
import { createLocationRouter } from './location.routes.js';
import { createScreenSharingRouter } from './screen-sharing.routes.js';
import { InMemoryDeviceConnectionRegistry } from '../../realtime/device-connection-registry.js';
import { SseDeviceTransport } from '../../realtime/sse-device-transport.js';
import { CommandDeliveryService } from '../../services/command-delivery-service.js';
import { ScreenSharingService } from '../../services/screen-sharing-service.js';
import { PostgresScreenSharingSessionRepository } from '../../repositories/postgres-screen-sharing-session-repository.js';
  const locations = new PostgresLocationRepository(database);
  const locationService = new LocationService(locations, managedDevices);
    createLocationRouter(
import { DeviceMonitoringService } from '../../services/device-monitoring-service.js';
import { PostgresDeviceMonitoringRepository } from '../../repositories/postgres-device-monitoring-repository.js';
import { createDeviceMonitoringRouter } from './device-monitoring.routes.js';

export const createV1Router = (
  database: Database,
  security: AppConfig['security'],
  rateLimit: AppConfig['rateLimit'],
  realtime: AppConfig['realtime'] = { enabled: false },
): Router => {
  const router = Router();
  const adminRepository = new PostgresAdminRepository(database);
  const authentication = new AdminAuthenticationService(
    adminRepository,
    undefined,
    security.accessTokenTtlSeconds,
    security.sessionTtlSeconds,
  );

  router.use(createHealthRouter(database));
  router.use(createAdminAuthRouter(authentication, rateLimit));

  const enrollmentRepository = new PostgresEnrollmentSessionRepository(
    database,
  );
  const enrollmentService = new EnrollmentSessionService(enrollmentRepository, {
    ttlSeconds: security.enrollmentSessionTtlSeconds,
    maxVerificationAttempts: security.enrollmentVerificationMaxAttempts,
  });

  router.use(
    createEnrollmentRouter(authentication, enrollmentService, rateLimit),
  );

  const deviceCredentials = new PostgresDeviceCredentialRepository(database);
  const deviceSessions = new PostgresDeviceConnectionSessionRepository(
    database,
  );
  const managedDevices = new PostgresManagedDeviceRepository(database);
  const commands = new PostgresCommandRepository(database);
  const communication = new DeviceCommunicationService(
    deviceCredentials,
    deviceSessions,
    managedDevices,
    { sessionTtlSeconds: security.deviceSessionTtlSeconds },
  );
  const realtimeRegistry = new InMemoryDeviceConnectionRegistry();
  const realtimeTransport = realtime.enabled
    ? new SseDeviceTransport(realtimeRegistry)
    : undefined;
  const commandDelivery = realtimeTransport === undefined
    ? undefined
    : new CommandDeliveryService(
        commands,
        realtimeTransport,
        deviceSessions,
        realtimeRegistry,
      );
  const commandService = new CommandService(
    commands,
    managedDevices,
    {
      ttlSeconds: security.commandTtlSeconds,
      maxPayloadBytes: security.commandMaxPayloadBytes,
    },
    commandDelivery,
  );

  router.use(createCommandRouter(authentication, commandService));
const monitoringRepository = new PostgresDeviceMonitoringRepository(database);
  const monitoringService = new DeviceMonitoringService(
    monitoringRepository,
    managedDevices,
    {
      staleSeconds: security.monitoringStaleSeconds,
      veryStaleSeconds: security.monitoringVeryStaleSeconds,
      maxFutureSkewSeconds: security.monitoringMaxFutureSkewSeconds,
    },
  );

  router.use(
    createDeviceMonitoringRouter(
      monitoringService,
      authentication,
      deviceSessions,
      rateLimit,
      security.monitoringMaxPayloadBytes,
    ),
  );

  router.use(
    createDeviceCommunicationRouter(
      communication,
      commandService,
      deviceCredentials,
      deviceSessions,
      rateLimit,
    ),
  );

  const locations = new PostgresLocationRepository(database);
  const locationService = new LocationService(locations, managedDevices);
  router.use(
    createLocationRouter(
      authentication,
      locationService,
      deviceSessions,
      rateLimit,
      realtimeTransport,
      commandDelivery,
    ),
  );

  const screenSessions = new PostgresScreenSharingSessionRepository(database);
  const screenSharing = new ScreenSharingService(
    screenSessions,
    managedDevices,
    deviceSessions,
    commandService,
    { maxDurationSeconds: security.screenSharingMaxDurationSeconds },
  );
  router.use(
    createScreenSharingRouter(
      authentication,
      screenSharing,
      deviceSessions,
      rateLimit,
    ),
  );

  return router;
};
