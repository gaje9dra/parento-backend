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
import { PostgresDeviceMonitoringRepository } from '../../repositories/postgres-device-monitoring-repository.js';
import { DeviceMonitoringService } from '../../services/device-monitoring-service.js';
import { createDeviceMonitoringRouter } from './device-monitoring.routes.js';
import { InMemoryDeviceConnectionRegistry } from '../../realtime/device-connection-registry.js';
import { SseDeviceTransport } from '../../realtime/sse-device-transport.js';
import { CommandDeliveryService } from '../../services/command-delivery-service.js';

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
  const registry = new InMemoryDeviceConnectionRegistry();
  const transport = realtime.enabled
    ? new SseDeviceTransport(registry)
    : undefined;
  const delivery =
    realtime.enabled && transport !== undefined
      ? new CommandDeliveryService(
          commands,
          transport,
          deviceSessions,
          registry,
        )
      : undefined;
  const commandService = new CommandService(
    commands,
    managedDevices,
    {
      ttlSeconds: security.commandTtlSeconds,
      maxPayloadBytes: security.commandMaxPayloadBytes,
    },
    delivery,
  );
  const monitoringRepository = new PostgresDeviceMonitoringRepository(database);
  const monitoring = new DeviceMonitoringService(
    monitoringRepository,
    managedDevices,
  );

  router.use(createCommandRouter(authentication, commandService));
  router.use(
    createDeviceCommunicationRouter(
      communication,
      commandService,
      deviceCredentials,
      deviceSessions,
      rateLimit,
      transport,
      delivery,
    ),
  );
  router.use(
    createDeviceMonitoringRouter(
      monitoring,
      managedDevices,
      deviceSessions,
      authentication,
      rateLimit,
      security,
      realtime,
    ),
  );

  return router;
};
