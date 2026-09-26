import { describe, expect, it, vi } from 'vitest';
import type { ManagedDevice } from '../src/domain/managed-device.js';
import type { DeviceConnectionSession } from '../src/domain/device-connection-session.js';
import type { ScreenSharingSession } from '../src/domain/screen-sharing-session.js';
import type { ScreenSharingSessionRepository } from '../src/repositories/screen-sharing-session-repository.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import type { DeviceConnectionSessionRepository } from '../src/repositories/device-connection-session-repository.js';
import type { CommandService } from '../src/services/command-service.js';
import { ScreenSharingService } from '../src/services/screen-sharing-service.js';

const device: ManagedDevice = {
  id: '11111111-1111-4111-8111-111111111111',
  adminId: '22222222-2222-4222-8222-222222222222',
  stableIdentifier: 'device-1',
  name: 'Test device',
  platform: 'android',
  enrollmentStatus: 'ACTIVE',
  operationalStatus: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSeenAt: new Date(),
};

const connection: DeviceConnectionSession = {
  id: '33333333-3333-4333-8333-333333333333',
  managedDeviceId: device.id,
  state: 'CONNECTED',
  createdAt: new Date(),
  connectedAt: new Date(),
  lastActivityAt: new Date(),
  lastSeenAt: new Date(),
  disconnectedAt: null,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
};

const makeSession = (
  status: ScreenSharingSession['status'],
): ScreenSharingSession => ({
  id: '44444444-4444-4444-8444-444444444444',
  managedDeviceId: device.id,
  adminId: device.adminId,
  status,
  createdAt: new Date(),
  authorizedAt: status === 'REQUESTED' ? null : new Date(),
  startedAt: ['ACTIVE', 'STOPPING', 'STOPPED'].includes(status)
    ? new Date()
    : null,
  stoppedAt: ['STOPPED', 'EXPIRED', 'FAILED'].includes(status)
    ? new Date()
    : null,
  expiresAt: new Date(Date.now() + 60_000),
  lastActivityAt: new Date(),
  terminationReason: null,
  correlationId: '55555555-5555-4555-8555-555555555555',
  transportState: null,
});

describe('Phase 9.1 screen-sharing service', () => {
  it('requires device ownership and an active device communication session', async () => {
    const devices = {
      findById: vi.fn().mockResolvedValue({
        ...device,
        adminId: '99999999-9999-4999-8999-999999999999',
      }),
    } as unknown as ManagedDeviceRepository;
    const sessions = {
      findActiveByDeviceId: vi.fn().mockResolvedValue(connection),
      expireDue: vi.fn().mockResolvedValue(0),
    } as unknown as DeviceConnectionSessionRepository;
    const screenSessions = {} as ScreenSharingSessionRepository;
    const commands = {} as CommandService;
    const service = new ScreenSharingService(
      screenSessions,
      devices,
      sessions,
      commands,
      { maxDurationSeconds: 900, retentionSeconds: 2592000 },
    );

    await expect(
      service.request(device.adminId, device.id),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED', statusCode: 403 });
  });

  it('rejects a device without a valid communication session', async () => {
    const devices = {
      findById: vi.fn().mockResolvedValue(device),
    } as unknown as ManagedDeviceRepository;
    const sessions = {
      findActiveByDeviceId: vi.fn().mockResolvedValue(null),
      expireDue: vi.fn().mockResolvedValue(0),
    } as unknown as DeviceConnectionSessionRepository;
    const screenSessions = {} as ScreenSharingSessionRepository;
    const commands = {} as CommandService;
    const service = new ScreenSharingService(
      screenSessions,
      devices,
      sessions,
      commands,
      { maxDurationSeconds: 900 },
    );

    await expect(
      service.request(device.adminId, device.id),
    ).rejects.toMatchObject({ code: 'DEVICE_UNAVAILABLE', statusCode: 409 });
  });

  it('does not allow an already active session to be replaced', async () => {
    const devices = {
      findById: vi.fn().mockResolvedValue(device),
    } as unknown as ManagedDeviceRepository;
    const sessions = {
      findActiveByDeviceId: vi.fn().mockResolvedValue(connection),
      expireDue: vi.fn().mockResolvedValue(0),
    } as unknown as DeviceConnectionSessionRepository;
    const existing = makeSession('ACTIVE');
    const screenSessions = {
      name: 'screen-sharing-session',
      create: vi.fn().mockResolvedValue({ session: existing, created: false }),
      expireDue: vi.fn().mockResolvedValue(0),
      deleteTerminatedBefore: vi.fn().mockResolvedValue(0),
    } as unknown as ScreenSharingSessionRepository;
    const commands = {} as CommandService;
    const service = new ScreenSharingService(
      screenSessions,
      devices,
      sessions,
      commands,
      { maxDurationSeconds: 900 },
    );

    await expect(
      service.request(device.adminId, device.id),
    ).rejects.toMatchObject({
      code: 'SCREEN_SESSION_ALREADY_ACTIVE',
      statusCode: 409,
    });
  });

  it('retries the same start request idempotently when correlation matches', async () => {
    const requested = makeSession('ACTIVE');
    const screenSessions = {
      name: 'screen-sharing-session',
      create: vi.fn().mockResolvedValue({ session: requested, created: false }),
      expireDue: vi.fn().mockResolvedValue(0),
      deleteTerminatedBefore: vi.fn().mockResolvedValue(0),
    } as unknown as ScreenSharingSessionRepository;
    const service = new ScreenSharingService(
      screenSessions,
      {
        findById: vi.fn().mockResolvedValue(device),
      } as unknown as ManagedDeviceRepository,
      {
        findActiveByDeviceId: vi.fn().mockResolvedValue(connection),
      } as unknown as DeviceConnectionSessionRepository,
      {} as CommandService,
      { maxDurationSeconds: 900 },
    );

    const result = await service.request(
      device.adminId,
      device.id,
      requested.correlationId,
    );

    expect(result.created).toBe(false);
    expect(result.session.id).toBe(requested.id);
  });

  it('treats repeated stop requests as idempotent after termination', async () => {
    const stopped = makeSession('STOPPED');
    const screenSessions = {
      name: 'screen-sharing-session',
      findOwned: vi.fn().mockResolvedValue(stopped),
    } as unknown as ScreenSharingSessionRepository;
    const service = new ScreenSharingService(
      screenSessions,
      {} as ManagedDeviceRepository,
      {} as DeviceConnectionSessionRepository,
      {} as CommandService,
      { maxDurationSeconds: 900 },
    );

    await expect(service.stop(stopped.id, stopped.adminId)).resolves.toEqual(
      stopped,
    );
  });

  it('rejects stale device sessions for managed lifecycle acknowledgements', async () => {
    const active = makeSession('STARTING');
    const screenSessions = {
      findById: vi.fn().mockResolvedValue(active),
    } as unknown as ScreenSharingSessionRepository;
    const service = new ScreenSharingService(
      screenSessions,
      {} as ManagedDeviceRepository,
      {} as DeviceConnectionSessionRepository,
      {} as CommandService,
      { maxDurationSeconds: 900 },
    );

    await expect(
      service.markStarted(
        active.id,
        {
          managedDeviceId: active.managedDeviceId,
          state: 'STALE',
          expiresAt: new Date(Date.now() + 60_000),
        },
        null,
      ),
    ).rejects.toMatchObject({
      code: 'DEVICE_SESSION_INVALID',
      statusCode: 401,
    });
  });

  it('rejects unsupported transport lifecycle metadata', async () => {
    const active = makeSession('STARTING');
    const screenSessions = {
      findById: vi.fn().mockResolvedValue(active),
    } as unknown as ScreenSharingSessionRepository;
    const service = new ScreenSharingService(
      screenSessions,
      {} as ManagedDeviceRepository,
      {} as DeviceConnectionSessionRepository,
      {} as CommandService,
      { maxDurationSeconds: 900 },
    );

    await expect(
      service.markStarted(
        active.id,
        {
          managedDeviceId: active.managedDeviceId,
          state: 'CONNECTED',
          expiresAt: new Date(Date.now() + 60_000),
        },
        { state: 'EVIL_STATE' },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      statusCode: 400,
    });
  });

  it('transitions an owned active session to STOPPING and queues a stop command', async () => {
    const active = makeSession('ACTIVE');
    const stopping = { ...active, status: 'STOPPING' as const };
    const screenSessions = {
      name: 'screen-sharing-session',
      findOwned: vi.fn().mockResolvedValue(active),
      transition: vi.fn().mockResolvedValue(stopping),
    } as unknown as ScreenSharingSessionRepository;
    const commands = {
      createScreenShareCommand: vi.fn().mockResolvedValue({
        command: { id: '66666666-6666-4666-8666-666666666666' },
        created: true,
      }),
    } as unknown as CommandService;
    const service = new ScreenSharingService(
      screenSessions,
      {} as ManagedDeviceRepository,
      {} as DeviceConnectionSessionRepository,
      commands,
      { maxDurationSeconds: 900 },
    );

    const result = await service.stop(active.id, active.adminId);

    expect(result.status).toBe('STOPPING');
    expect(commands.createScreenShareCommand).toHaveBeenCalledWith(
      active.adminId,
      expect.objectContaining({
        deviceId: active.managedDeviceId,
        type: 'STOP_SCREEN_SHARE',
        screenSessionId: active.id,
      }),
    );
  });
});
