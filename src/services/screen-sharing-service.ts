import { randomUUID } from 'node:crypto';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';
import type {
  ScreenSharingSession,
  ScreenSharingSessionStatus,
} from '../domain/screen-sharing-session.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';
import type { ScreenSharingSessionRepository } from '../repositories/screen-sharing-session-repository.js';
import type { CommandService } from './command-service.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import { AppError } from '../types/errors.js';

export interface ScreenSharingServiceOptions {
  readonly maxDurationSeconds: number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ScreenSharingService {
  constructor(
    private readonly sessions: ScreenSharingSessionRepository,
    private readonly devices: ManagedDeviceRepository,
    private readonly deviceSessions: DeviceConnectionSessionRepository,
    private readonly commands: CommandService,
    private readonly options: ScreenSharingServiceOptions,
  ) {}

  async request(
    adminId: string,
    deviceId: string,
    correlationId?: string | null,
  ): Promise<{ session: ScreenSharingSession; created: boolean }> {
    if (!UUID.test(deviceId)) {
      throw new AppError(400, 'INVALID_REQUEST', 'Managed-device identifier is invalid.');
    }

    const device = await this.devices.findById(deviceId);
    if (device === null) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', 'Managed device was not found.');
    }
    if (device.adminId !== adminId) {
      throw new AppError(403, 'AUTHORIZATION_DENIED', 'The administrator does not control this device.');
    }
    if (device.enrollmentStatus !== 'ACTIVE' || device.operationalStatus !== 'ACTIVE') {
      throw new AppError(409, 'DEVICE_NOT_READY', 'Managed device is not authorized for screen sharing.');
    }

    const connection = await this.deviceSessions.findActiveByDeviceId(deviceId);
    if (connection === null || connection.expiresAt.getTime() <= Date.now()) {
      throw new AppError(409, 'DEVICE_UNAVAILABLE', 'Managed device does not have a valid communication session.');
    }

    await this.expireDue();

    const now = new Date();
    const result = await this.sessions.create({
      id: randomUUID(),
      managedDeviceId: deviceId,
      adminId,
      correlationId:
        correlationId && /^[A-Za-z0-9._:-]{1,128}$/.test(correlationId)
          ? correlationId
          : randomUUID(),
      expiresAt: new Date(now.getTime() + this.options.maxDurationSeconds * 1000),
      transportState: { state: 'AUTHORIZATION_PENDING' },
    });

    if (!result.created) {
      throw new AppError(
        409,
        'SCREEN_SESSION_ALREADY_ACTIVE',
        'A screen-sharing session is already active or starting for this device.',
        { sessionId: result.session.id, status: result.session.status },
      );
    }

    let session = result.session;
    try {
      session = await this.transition(session, 'AUTHORIZED', null, {
        state: 'AUTHORIZED',
      });
      const command = await this.commands.createScreenShareCommand(adminId, {
        deviceId,
        type: 'START_SCREEN_SHARE',
        screenSessionId: session.id,
        correlationId: session.correlationId,
      });
      session = await this.transition(session, 'STARTING', null, {
        state: 'STARTING',
        startCommandId: command.command.id,
      });
      return { session, created: true };
    } catch (error) {
      await this.failBestEffort(session);
      throw error;
    }
  }

  async getOwned(id: string, adminId: string): Promise<ScreenSharingSession> {
    const session = await this.sessions.findOwned(id, adminId);
    if (session === null) {
      throw new AppError(404, 'SCREEN_SESSION_NOT_FOUND', 'Screen-sharing session was not found.');
    }
    if (session.expiresAt.getTime() <= Date.now() && !this.isTerminal(session.status)) {
      return this.expire(session);
    }
    return session;
  }

  async stop(id: string, adminId: string): Promise<ScreenSharingSession> {
    let session = await this.getOwned(id, adminId);
    if (this.isTerminal(session.status)) {
      throw new AppError(409, 'SCREEN_SESSION_STATE_CONFLICT', 'The screen-sharing session is already terminated.');
    }
    if (session.status === 'STOPPING') return session;

    session = await this.transition(session, 'STOPPING', 'ADMIN_STOP', {
      state: 'STOPPING',
    });

    try {
      await this.commands.createScreenShareCommand(adminId, {
        deviceId: session.managedDeviceId,
        type: 'STOP_SCREEN_SHARE',
        screenSessionId: session.id,
        correlationId: session.correlationId,
      });
      return session;
    } catch (error) {
      await this.failBestEffort(session);
      throw error;
    }
  }

  async markStarted(
    sessionId: string,
    deviceSession: Pick<DeviceConnectionSession, 'managedDeviceId' | 'state' | 'expiresAt'>,
    transportState: Record<string, unknown> | null,
  ): Promise<ScreenSharingSession> {
    this.assertDeviceSession(deviceSession, sessionId);
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw new AppError(404, 'SCREEN_SESSION_NOT_FOUND', 'Screen-sharing session was not found.');
    if (session.managedDeviceId !== deviceSession.managedDeviceId) {
      throw new AppError(403, 'AUTHORIZATION_DENIED', 'The screen-sharing session is not assigned to this device.');
    }
    if (session.expiresAt.getTime() <= Date.now()) return this.expire(session);
    if (session.status !== 'STARTING') {
      throw new AppError(409, 'SCREEN_SESSION_STATE_CONFLICT', 'The screen-sharing session is not starting.');
    }
    return this.transition(session, 'ACTIVE', null, transportState);
  }

  async markStopped(
    sessionId: string,
    deviceSession: Pick<DeviceConnectionSession, 'managedDeviceId' | 'state' | 'expiresAt'>,
  ): Promise<ScreenSharingSession> {
    this.assertDeviceSession(deviceSession, sessionId);
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw new AppError(404, 'SCREEN_SESSION_NOT_FOUND', 'Screen-sharing session was not found.');
    if (session.managedDeviceId !== deviceSession.managedDeviceId) {
      throw new AppError(403, 'AUTHORIZATION_DENIED', 'The screen-sharing session is not assigned to this device.');
    }
    if (this.isTerminal(session.status)) return session;
    if (session.status !== 'STOPPING') {
      throw new AppError(409, 'SCREEN_SESSION_STATE_CONFLICT', 'The screen-sharing session cannot be stopped from its current state.');
    }
    return this.transition(
      session,
      'STOPPED',
      'ADMIN_STOP',
      { state: 'STOPPED' },
    );
  }

  async expireDue(): Promise<number> {
    return this.sessions.expireDue(new Date(), 100);
  }

  private async expire(session: ScreenSharingSession): Promise<ScreenSharingSession> {
    if (this.isTerminal(session.status)) return session;
    try {
      if (['AUTHORIZED', 'STARTING', 'ACTIVE', 'STOPPING'].includes(session.status)) {
        await this.commands.createScreenShareCommand(session.adminId, {
          deviceId: session.managedDeviceId,
          type: 'STOP_SCREEN_SHARE',
          screenSessionId: session.id,
          correlationId: session.correlationId,
        });
      }
      return await this.sessions.transition({
        id: session.id,
        from: session.status,
        to: 'EXPIRED',
        now: new Date(),
        terminationReason: 'EXPIRED',
        transportState: { state: 'EXPIRED' },
      });
    } catch (error) {
      if (error instanceof PersistenceError) {
        const latest = await this.sessions.findById(session.id);
        if (latest !== null) return latest;
      }
      throw error;
    }
  }

  private async transition(
    session: ScreenSharingSession,
    to: ScreenSharingSessionStatus,
    terminationReason: ScreenSharingSession['terminationReason'],
    transportState: Record<string, unknown> | null,
  ): Promise<ScreenSharingSession> {
    try {
      return await this.sessions.transition({
        id: session.id,
        from: session.status,
        to,
        now: new Date(),
        terminationReason,
        transportState,
      });
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw new AppError(409, 'SCREEN_SESSION_STATE_CONFLICT', error.message);
      }
      throw error;
    }
  }

  private async failBestEffort(session: ScreenSharingSession): Promise<void> {
    if (this.isTerminal(session.status)) return;
    try {
      await this.sessions.transition({
        id: session.id,
        from: session.status,
        to: 'FAILED',
        now: new Date(),
        terminationReason: 'FAILED',
        transportState: { state: 'FAILED' },
      });
    } catch {
      // The original failure is authoritative.
    }
  }

  private assertDeviceSession(
    session: Pick<DeviceConnectionSession, 'managedDeviceId' | 'state' | 'expiresAt'>,
    _screenSessionId: string,
  ): void {
    if (
      session.expiresAt.getTime() <= Date.now() ||
      !['CONNECTED', 'STALE'].includes(session.state)
    ) {
      throw new AppError(401, 'DEVICE_SESSION_INVALID', 'Managed-device session is no longer valid.');
    }
  }

  private isTerminal(status: ScreenSharingSessionStatus): boolean {
    return ['STOPPED', 'EXPIRED', 'FAILED', 'REJECTED'].includes(status);
  }
}
