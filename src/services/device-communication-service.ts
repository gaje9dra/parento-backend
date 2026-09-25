import { randomUUID } from 'node:crypto';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/token.js';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';
import type { DeviceCredentialRepository } from '../repositories/device-credential-repository.js';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import { AppError } from '../types/errors.js';

export interface DeviceCommunicationServiceOptions {
  readonly sessionTtlSeconds: number;
}

export class DeviceCommunicationService {
  constructor(
    private readonly credentials: DeviceCredentialRepository,
    private readonly sessions: DeviceConnectionSessionRepository,
    private readonly devices: ManagedDeviceRepository,
    private readonly options: DeviceCommunicationServiceOptions,
  ) {}

  async connect(credential: string): Promise<{ session: DeviceConnectionSession; sessionToken: string }> {
    const deviceCredential = await this.credentials.authenticate(hashOpaqueToken(credential));
    if (deviceCredential === null) {
      throw new AppError(401, 'DEVICE_AUTHENTICATION_REQUIRED', 'Managed-device authentication is required.');
    }
    const device = await this.devices.findById(deviceCredential.managedDeviceId);
    if (device === null || device.enrollmentStatus !== 'ACTIVE' || device.operationalStatus !== 'ACTIVE') {
      throw new AppError(403, 'DEVICE_AUTHORIZATION_DENIED', 'Managed-device communication is not authorized.');
    }
    const sessionToken = generateOpaqueToken();
    const now = new Date();
    const created = await this.sessions.create({
      id: randomUUID(),
      managedDeviceId: device.id,
      sessionTokenHash: hashOpaqueToken(sessionToken),
      expiresAt: new Date(now.getTime() + this.options.sessionTtlSeconds * 1000),
    });
    const connected = await this.sessions.touchConnected(
      created.id,
      now,
      new Date(now.getTime() + this.options.sessionTtlSeconds * 1000),
    );
    if (connected === null) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Device session could not be established.');
    return { session: connected, sessionToken };
  }

  async heartbeat(session: DeviceConnectionSession): Promise<DeviceConnectionSession> {
    this.assertLive(session);
    const now = new Date();
    const updated = await this.sessions.touchConnected(
      session.id,
      now,
      new Date(now.getTime() + this.options.sessionTtlSeconds * 1000),
    );
    if (updated === null) throw new AppError(401, 'DEVICE_SESSION_INVALID', 'Device session is no longer valid.');
    return updated;
  }

  async disconnect(session: DeviceConnectionSession): Promise<DeviceConnectionSession> {
    this.assertLive(session);
    const updated = await this.sessions.disconnect(session.id, new Date(), 'DISCONNECTED');
    if (updated === null) throw new AppError(401, 'DEVICE_SESSION_INVALID', 'Device session is no longer valid.');
    return updated;
  }

  private assertLive(session: DeviceConnectionSession): void {
    if (session.expiresAt.getTime() <= Date.now() || ['DISCONNECTED', 'EXPIRED'].includes(session.state)) {
      throw new AppError(401, 'DEVICE_SESSION_INVALID', 'Device session is no longer valid.');
    }
  }
}
