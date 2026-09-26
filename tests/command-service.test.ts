import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CommandService } from '../src/services/command-service.js';
import type { ManagedDevice } from '../src/domain/managed-device.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import type { Command } from '../src/domain/command.js';
import type { CommandRepository } from '../src/repositories/command-repository.js';
import type { ScreenSharingSessionRepository } from '../src/repositories/screen-sharing-session-repository.js';

const device = (adminId: string): ManagedDevice => ({
  id: randomUUID(),
  adminId,
  stableIdentifier: 'managed-installation-test',
  name: 'Test Device',
  platform: 'android',
  enrollmentStatus: 'ACTIVE',
  operationalStatus: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSeenAt: null,
});
class FakeDevices implements ManagedDeviceRepository {
  readonly name = 'fake-devices';
  item: ManagedDevice | null = null;
  async create(): Promise<ManagedDevice> {
    throw new Error('unused');
  }
  async findById(): Promise<ManagedDevice | null> {
    return this.item;
  }
  async findByStableIdentifier(): Promise<ManagedDevice | null> {
    return null;
  }
  async list() {
    return { items: [], nextCursor: null };
  }
  async listByAdminId() {
    return { items: [], nextCursor: null };
  }
  async updateStatus() {
    return null;
  }
}
class FakeCommands implements CommandRepository {
  readonly name = 'fake-commands';
  command: Command | null = null;
  async create(input: Parameters<CommandRepository['create']>[0]) {
    const command: Command = {
      id: input.id,
      managedDeviceId: input.managedDeviceId,
      adminId: input.adminId,
      type: 'FUTURE_COMMAND',
      version: 1,
      status: 'CREATED',
      payload: input.payload,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      deliveryAt: null,
      acknowledgedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      failureCode: null,
      errorCategory: null,
      resultCode: null,
      resultMetadata: null,
    };
    this.command = command;
    return { command, created: true };
  }
  async findById() {
    return this.command;
  }
  async findOwned() {
    return this.command;
  }
  async cancelOwned() {
    if (!this.command) throw new Error('unused');
    return this.command;
  }
  async transition(input: Parameters<CommandRepository['transition']>[0]) {
    if (!this.command) throw new Error('unused');
    this.command = { ...this.command, status: input.to };
    return this.command;
  }
}
describe('Phase 6.1 command authorization', () => {
  it('binds command creation to the authenticated administrator ownership', async () => {
    const owner = randomUUID(),
      other = randomUUID(),
      devices = new FakeDevices();
    devices.item = device(owner);
    const service = new CommandService(new FakeCommands(), devices, {
      ttlSeconds: 300,
      maxPayloadBytes: 4096,
    });
    await expect(
      service.create(other, {
        deviceId: devices.item.id,
        type: 'FUTURE_COMMAND',
        version: 1,
        payload: {},
        idempotencyKey: null,
        correlationId: null,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'AUTHORIZATION_DENIED' });
  });
  it('rejects arbitrary payload content in the neutral command registry', async () => {
    const owner = randomUUID(),
      devices = new FakeDevices();
    devices.item = device(owner);
    const service = new CommandService(new FakeCommands(), devices, {
      ttlSeconds: 300,
      maxPayloadBytes: 4096,
    });
    await expect(
      service.create(owner, {
        deviceId: devices.item.id,
        type: 'FUTURE_COMMAND',
        version: 1,
        payload: { command: 'shell' },
        idempotencyKey: null,
        correlationId: null,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_COMMAND_PAYLOAD',
    });
  });
});

describe('Phase 9.4 screen-sharing command binding', () => {
  it('rejects a screen command whose session belongs to another device', async () => {
    const owner = randomUUID();
    const managed = device(owner);
    const foreignDevice = randomUUID();
    const sessionId = randomUUID();
    const screenSessions = {
      findById: async () => ({
        id: sessionId,
        managedDeviceId: foreignDevice,
        adminId: owner,
        status: 'AUTHORIZED',
      }),
    } as unknown as ScreenSharingSessionRepository;
    const devices = new FakeDevices();
    devices.item = managed;
    const service = new CommandService(
      new FakeCommands(),
      devices,
      { ttlSeconds: 300, maxPayloadBytes: 4096 },
      undefined,
      screenSessions,
    );

    await expect(
      service.createScreenShareCommand(owner, {
        deviceId: managed.id,
        type: 'START_SCREEN_SHARE',
        screenSessionId: sessionId,
        correlationId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'SCREEN_SESSION_NOT_FOUND',
    });
  });

  it('rejects replayed screen start against an ACTIVE session', async () => {
    const owner = randomUUID();
    const managed = device(owner);
    const sessionId = randomUUID();
    const screenSessions = {
      findById: async () => ({
        id: sessionId,
        managedDeviceId: managed.id,
        adminId: owner,
        status: 'ACTIVE',
      }),
    } as unknown as ScreenSharingSessionRepository;
    const devices = new FakeDevices();
    devices.item = managed;
    const service = new CommandService(
      new FakeCommands(),
      devices,
      { ttlSeconds: 300, maxPayloadBytes: 4096 },
      undefined,
      screenSessions,
    );

    await expect(
      service.createScreenShareCommand(owner, {
        deviceId: managed.id,
        type: 'START_SCREEN_SHARE',
        screenSessionId: sessionId,
        correlationId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'SCREEN_SESSION_STATE_CONFLICT',
    });
  });
});

describe('Phase 10.1 audio-access command binding', () => {
  it('rejects an audio command whose session belongs to another device', async () => {
    const owner = randomUUID();
    const managed = device(owner);
    const audioSessionId = randomUUID();
    const audioSessions = {
      findById: async () => ({
        id: audioSessionId,
        managedDeviceId: randomUUID(),
        adminId: owner,
        status: 'AUTHORIZED',
      }),
    } as unknown as import('../src/repositories/audio-access-session-repository.js').AudioAccessSessionRepository;
    const devices = new FakeDevices();
    devices.item = managed;
    const service = new CommandService(
      new FakeCommands(),
      devices,
      { ttlSeconds: 300, maxPayloadBytes: 4096 },
      undefined,
      undefined,
      audioSessions,
    );

    await expect(
      service.createAudioAccessCommand(owner, {
        deviceId: managed.id,
        type: 'START_AUDIO_ACCESS',
        audioSessionId,
        correlationId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'AUDIO_SESSION_NOT_FOUND',
    });
  });

  it('rejects replayed audio start against an ACTIVE session', async () => {
    const owner = randomUUID();
    const managed = device(owner);
    const audioSessionId = randomUUID();
    const audioSessions = {
      findById: async () => ({
        id: audioSessionId,
        managedDeviceId: managed.id,
        adminId: owner,
        status: 'ACTIVE',
      }),
    } as unknown as import('../src/repositories/audio-access-session-repository.js').AudioAccessSessionRepository;
    const devices = new FakeDevices();
    devices.item = managed;
    const service = new CommandService(
      new FakeCommands(),
      devices,
      { ttlSeconds: 300, maxPayloadBytes: 4096 },
      undefined,
      undefined,
      audioSessions,
    );

    await expect(
      service.createAudioAccessCommand(owner, {
        deviceId: managed.id,
        type: 'START_AUDIO_ACCESS',
        audioSessionId,
        correlationId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'AUDIO_SESSION_STATE_CONFLICT',
    });
  });
  it('creates only the allowlisted application policy command payload', async () => {
    const owner = randomUUID();
    const devices = new FakeDevices();
    devices.item = device(owner);
    const service = new CommandService(new FakeCommands(), devices, {
      ttlSeconds: 300,
      maxPayloadBytes: 4096,
    });

    await expect(
      service.createApplicationPolicyCommand(owner, {
        deviceId: devices.item.id,
        policyId: randomUUID(),
        policyVersion: 3,
        correlationId: 'policy-sync-test',
      }),
    ).resolves.toMatchObject({ created: true });

    await expect(
      service.create(owner, {
        deviceId: devices.item.id,
        type: 'SYNC_APPLICATION_POLICY',
        version: 1,
        payload: { arbitrary: 'code' },
        idempotencyKey: 'bad',
        correlationId: null,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_COMMAND_PAYLOAD' });
  });

  it('creates a bounded inventory-request command', async () => {
    const owner = randomUUID();
    const devices = new FakeDevices();
    devices.item = device(owner);
    const service = new CommandService(new FakeCommands(), devices, {
      ttlSeconds: 300,
      maxPayloadBytes: 4096,
    });

    await expect(
      service.createApplicationInventoryRequest(owner, {
        deviceId: devices.item.id,
        correlationId: 'inventory-test',
      }),
    ).resolves.toMatchObject({ created: true });
  });
});
Post job cleanup.
(node:2346) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
Post job cleanup.
[command]/usr/bin/git version
git version 2.55.0
Temporarily overriding HOME='/home/runner/work/_temp/e10b3868-31a5-407b-8847-8b75dea1f11f' before making global git config changes
Adding repository directory to the temporary git global config as a safe directory
[command]/usr/bin/git config --global --add safe.directory /home/runner/work/parento-backend/parento-backend
[command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
[command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
[command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
http.https://github.com/.extraheader
[command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
[command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
[command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
[command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Cleaning up orphan processes
##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
