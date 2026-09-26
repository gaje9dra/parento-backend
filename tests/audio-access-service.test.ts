import { describe, expect, it, vi } from 'vitest';
import type { ManagedDevice } from '../src/domain/managed-device.js';
import type { DeviceConnectionSession } from '../src/domain/device-connection-session.js';
import type { AudioAccessSession } from '../src/domain/audio-access-session.js';
import type { AudioAccessSessionRepository } from '../src/repositories/audio-access-session-repository.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import type { DeviceConnectionSessionRepository } from '../src/repositories/device-connection-session-repository.js';
import type { CommandService } from '../src/services/command-service.js';
import { AudioAccessService } from '../src/services/audio-access-service.js';

const device: ManagedDevice = {
  id: '11111111-1111-4111-8111-111111111111',
  adminId: '22222222-2222-4222-8222-222222222222',
  stableIdentifier: 'audio-device-1',
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
  status: AudioAccessSession['status'],
): AudioAccessSession => ({
  id: '44444444-4444-4444-8444-444444444444',
  managedDeviceId: device.id,
  deviceConnectionSessionId: connection.id,
  adminId: device.adminId,
  status,
  createdAt: new Date(),
  authorizedAt: status === 'REQUESTED' ? null : new Date(),
  startedAt: ['STARTING', 'ACTIVE', 'STOPPING', 'STOPPED'].includes(status)
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

const buildService = (
  sessions: AudioAccessSessionRepository,
  devices: ManagedDeviceRepository = {
    findById: vi.fn().mockResolvedValue(device),
  } as unknown as ManagedDeviceRepository,
  deviceSessions: DeviceConnectionSessionRepository = {
    findActiveByDeviceId: vi.fn().mockResolvedValue(connection),
  } as unknown as DeviceConnectionSessionRepository,
  commands: CommandService = {} as CommandService,
) =>
  new AudioAccessService(sessions, devices, deviceSessions, commands, {
    maxDurationSeconds: 900,
    retentionSeconds: 2592000,
  });

describe('Phase 10.1 audio-access service', () => {
  it('requires Admin ownership and a connected managed-device session', async () => {
    const devices = {
      findById: vi.fn().mockResolvedValue({
        ...device,
        adminId: '99999999-9999-4999-8999-999999999999',
      }),
    } as unknown as ManagedDeviceRepository;
    const service = buildService({} as AudioAccessSessionRepository, devices);

    await expect(
      service.request(device.adminId, device.id),
    ).rejects.toMatchObject({
      code: 'AUTHORIZATION_DENIED',
      statusCode: 403,
    });

    const unavailable = buildService(
      {} as AudioAccessSessionRepository,
      {
        findById: vi.fn().mockResolvedValue(device),
      } as unknown as ManagedDeviceRepository,
      {
        findActiveByDeviceId: vi.fn().mockResolvedValue({
          ...connection,
          state: 'STALE',
        }),
      } as unknown as DeviceConnectionSessionRepository,
    );
    await expect(
      unavailable.request(device.adminId, device.id),
    ).rejects.toMatchObject({
      code: 'DEVICE_UNAVAILABLE',
      statusCode: 409,
    });
  });

  it('does not replace an active session and retries the same correlation idempotently', async () => {
    const existing = makeSession('ACTIVE');
    const sessions = {
      create: vi.fn().mockResolvedValue({ session: existing, created: false }),
      expireDue: vi.fn().mockResolvedValue(0),
      deleteTerminatedBefore: vi.fn().mockResolvedValue(0),
    } as unknown as AudioAccessSessionRepository;
    const service = buildService(sessions);

    await expect(
      service.request(device.adminId, device.id, 'different-correlation'),
    ).rejects.toMatchObject({
      code: 'AUDIO_SESSION_ALREADY_ACTIVE',
      statusCode: 409,
    });

    await expect(
      service.request(device.adminId, device.id, existing.correlationId),
    ).resolves.toMatchObject({ created: false, session: existing });
  });

  it('binds device lifecycle acknowledgements to a connected device session', async () => {
    const starting = makeSession('STARTING');
    const sessions = {
      findById: vi.fn().mockResolvedValue(starting),
      transition: vi.fn().mockResolvedValue({ ...starting, status: 'ACTIVE' }),
    } as unknown as AudioAccessSessionRepository;
    const service = buildService(sessions);

    await expect(
      service.markStarted(
        starting.id,
        {
          id: connection.id,
          managedDeviceId: starting.managedDeviceId,
          state: 'STALE',
          expiresAt: new Date(Date.now() + 60_000),
        },
        null,
      ),
    ).rejects.toMatchObject({
      code: 'DEVICE_SESSION_INVALID',
      statusCode: 401,
    });

    await expect(
      service.markStarted(
        starting.id,
        {
          id: connection.id,
          managedDeviceId: starting.managedDeviceId,
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

  it('rejects acknowledgements from a different device connection session', async () => {
    const starting = makeSession('STARTING');
    const sessions = {
      findById: vi.fn().mockResolvedValue(starting),
    } as unknown as AudioAccessSessionRepository;
    const service = buildService(sessions);

    await expect(
      service.markStarted(
        starting.id,
        {
          id: '99999999-9999-4999-8999-999999999999',
          managedDeviceId: starting.managedDeviceId,
          state: 'CONNECTED',
          expiresAt: new Date(Date.now() + 60_000),
        },
        null,
      ),
    ).rejects.toMatchObject({
      code: 'AUTHORIZATION_DENIED',
      statusCode: 403,
    });
  });

  it('rejects credential or media metadata in transport state', async () => {
    const starting = makeSession('STARTING');
    const sessions = {
      findById: vi.fn().mockResolvedValue(starting),
    } as unknown as AudioAccessSessionRepository;
    const service = buildService(sessions);

    await expect(
      service.markStarted(
        starting.id,
        {
          id: connection.id,
          managedDeviceId: starting.managedDeviceId,
          state: 'CONNECTED',
          expiresAt: new Date(Date.now() + 60_000),
        },
        { token: 'secret' },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      statusCode: 400,
    });
  });

  it('makes repeated terminal STOP requests idempotent', async () => {
    const stopped = makeSession('STOPPED');
    const sessions = {
      findOwned: vi.fn().mockResolvedValue(stopped),
    } as unknown as AudioAccessSessionRepository;
    const service = buildService(sessions);

    await expect(service.stop(stopped.id, stopped.adminId)).resolves.toEqual(
      stopped,
    );
  });

  it('queues a bound stop command before returning STOPPING', async () => {
    const active = makeSession('ACTIVE');
    const stopping = { ...active, status: 'STOPPING' as const };
    const sessions = {
      findOwned: vi.fn().mockResolvedValue(active),
      transition: vi.fn().mockResolvedValue(stopping),
    } as unknown as AudioAccessSessionRepository;
    const commands = {
      createAudioAccessCommand: vi.fn().mockResolvedValue({
        command: { id: '66666666-6666-4666-8666-666666666666' },
        created: true,
      }),
    } as unknown as CommandService;
    const service = buildService(sessions, undefined, undefined, commands);

    const result = await service.stop(active.id, active.adminId);

    expect(result.status).toBe('STOPPING');
    expect(commands.createAudioAccessCommand).toHaveBeenCalledWith(
      active.adminId,
      expect.objectContaining({
        deviceId: active.managedDeviceId,
        type: 'STOP_AUDIO_ACCESS',
        audioSessionId: active.id,
      }),
    );
  });
});
