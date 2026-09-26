import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)(
  'Phase 11.1 application-management database',
  () => {
    const database = createDatabase(loadConfig());

    beforeAll(async () => {
      await runMigrations(database);
    });

    afterAll(async () => {
      await database.close();
    });

    it('creates the application-management tables and indexes', async () => {
      const tables = await database.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('application_inventory','application_policies','application_policy_rules','application_policy_assignments','application_policy_sync_state','application_management_events') ORDER BY tablename",
      );
      expect(tables.rows.map((row) => row.tablename)).toEqual([
        'application_inventory',
        'application_management_events',
        'application_policies',
        'application_policy_assignments',
        'application_policy_rules',
        'application_policy_sync_state',
      ]);

      const indexes = await database.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('application_inventory_package_idx','application_inventory_device_observed_idx','application_policy_admin_name_idx','application_policy_assignment_policy_idx','application_sync_status_idx') ORDER BY indexname",
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        'application_inventory_device_observed_idx',
        'application_inventory_package_idx',
        'application_policy_admin_name_idx',
        'application_policy_assignment_policy_idx',
        'application_sync_status_idx',
      ]);
    });

    it('extends the existing command allowlist without creating a second command table', async () => {
      const result = await database.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='commands'::regclass AND conname='commands_type_check'",
      );
      expect(result.rows[0]?.definition).toContain('SYNC_APPLICATION_POLICY');
      expect(result.rows[0]?.definition).toContain(
        'REQUEST_APPLICATION_INVENTORY',
      );

      const commandTables = await database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%command%'",
      );
      expect(Number(commandTables.rows[0]?.count ?? '0')).toBe(2);
    });
  },
);
===== tests/application-management-service.test.ts =====
import { describe, expect, it, vi } from 'vitest';
import { ApplicationManagementService } from '../src/services/application-management-service.js';
import type { ApplicationInventoryRepository } from '../src/repositories/application-inventory-repository.js';
import type { ApplicationPolicyRepository } from '../src/repositories/application-policy-repository.js';
import type { ApplicationManagementEventRepository } from '../src/repositories/application-management-event-repository.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import type { CommandService } from '../src/services/command-service.js';
import type {
  ApplicationPolicy,
  ApplicationPolicyAssignment,
  ApplicationPolicySyncState,
} from '../src/domain/application-management.js';
import type { ManagedDevice } from '../src/domain/managed-device.js';
import { PersistenceError } from '../src/domain/persistence-errors.js';

const adminId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const policyId = '33333333-3333-4333-8333-333333333333';

const device: ManagedDevice = {
  id: deviceId,
  adminId,
  stableIdentifier: 'installation-1',
  name: 'Test device',
  platform: 'android',
  enrollmentStatus: 'ACTIVE',
  operationalStatus: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  lastSeenAt: new Date(),
};

const policy = (version = 1): ApplicationPolicy => ({
  id: policyId,
  adminId,
  name: 'Default',
  description: null,
  status: 'ACTIVE',
  version,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  createdBy: adminId,
  updatedBy: adminId,
  rules: [{ policyId, packageName: 'com.example.blocked', action: 'BLOCK' }],
});

class InventoryFake implements ApplicationInventoryRepository {
  readonly name = 'inventory';
  async replaceForDevice() {
    return { applied: true, receivedAt: new Date() };
  }
  async listForAdmin() {
    return { items: [], nextCursor: null, observedAt: null, receivedAt: null };
  }
  async findForAdmin() {
    return null;
  }
}

class PolicyFake implements ApplicationPolicyRepository {
  readonly name = 'policy';
  assignment: ApplicationPolicyAssignment | null = null;
  sync: ApplicationPolicySyncState | null = null;
  async create() {
    return policy();
  }
  async findOwned() {
    return policy();
  }
  async listOwned() {
    return { items: [policy()], nextCursor: null };
  }
  async updateOwned(input: { expectedVersion: number }) {
    if (input.expectedVersion !== 1)
      throw new PersistenceError('CONFLICT', 'stale');
    return policy(2);
  }
  async disableOwned() {
    return policy(2);
  }
  async listAssignmentsForPolicy() {
    return this.assignment ? [this.assignment] : [];
  }
  async assign(input: {
    managedDeviceId: string;
    policyId: string;
    policyVersion: number;
    assignedBy: string;
  }) {
    this.assignment = {
      ...input,
      assignedAt: new Date(),
      updatedAt: new Date(),
    };
    return this.assignment;
  }
  async removeAssignment() {
    this.assignment = null;
  }
  async findAssignment() {
    return this.assignment;
  }
  async findSyncState() {
    return this.sync;
  }
  async setSyncRequested(input: {
    managedDeviceId: string;
    policyId: string | null;
    policyVersion: number | null;
    requestedAt: Date;
  }) {
    this.sync = {
      managedDeviceId: input.managedDeviceId,
      desiredPolicyId: input.policyId,
      desiredPolicyVersion: input.policyVersion,
      reportedPolicyId: null,
      reportedPolicyVersion: null,
      status: 'PENDING',
      lastRequestedAt: input.requestedAt,
      lastReportedAt: null,
      lastErrorCode: null,
      updatedAt: input.requestedAt,
    };
    return this.sync;
  }
  async reportSync(input: {
    managedDeviceId: string;
    policyId: string | null;
    policyVersion: number | null;
    status: ApplicationPolicySyncState['status'];
    reportedAt: Date;
    errorCode: string | null;
  }) {
    this.sync = {
      managedDeviceId: input.managedDeviceId,
      desiredPolicyId: this.sync?.desiredPolicyId ?? null,
      desiredPolicyVersion: this.sync?.desiredPolicyVersion ?? null,
      reportedPolicyId: input.policyId,
      reportedPolicyVersion: input.policyVersion,
      status: input.status,
      lastRequestedAt: this.sync?.lastRequestedAt ?? null,
      lastReportedAt: input.reportedAt,
      lastErrorCode: input.errorCode,
      updatedAt: input.reportedAt,
    };
    return this.sync;
  }
}

class DeviceFake implements ManagedDeviceRepository {
  readonly name = 'devices';
  async create() {
    return device;
  }
  async findById() {
    return device;
  }
  async findByStableIdentifier() {
    return device;
  }
  async list() {
    return { items: [device], nextCursor: null };
  }
  async listByAdminId() {
    return { items: [device], nextCursor: null };
  }
  async updateStatus() {
    return device;
  }
}

const createService = () => {
  const policies = new PolicyFake();
  const commands = {
    createApplicationPolicyCommand: vi.fn(async () => ({
      command: { id: '44444444-4444-4444-8444-444444444444' },
      created: true,
    })),
    createApplicationInventoryRequest: vi.fn(async () => ({
      command: { id: '55555555-5555-4555-8555-555555555555' },
      created: true,
    })),
  } as unknown as CommandService;
  const events = {
    name: 'events',
    record: vi.fn(async () => undefined),
  } as unknown as ApplicationManagementEventRepository;
  return {
    policies,
    service: new ApplicationManagementService(
      new InventoryFake(),
      policies,
      new DeviceFake(),
      commands,
      events,
      {
        maxInventoryItems: 500,
        maxPolicyRules: 500,
        maxFutureSkewSeconds: 300,
        staleSeconds: 300,
        veryStaleSeconds: 86400,
      },
    ),
  };
};

describe('application management service', () => {
  it('rejects duplicate inventory package names', async () => {
    const { service } = createService();
    await expect(
      service.reportInventory({
        managedDeviceId: deviceId,
        observedAt: new Date(),
        receivedAt: new Date(),
        items: [
          {
            packageName: 'com.example.app',
            label: null,
            versionName: null,
            versionCode: null,
            installState: 'INSTALLED',
            enabled: true,
            sourceCategory: null,
          },
          {
            packageName: 'com.example.app',
            label: null,
            versionName: null,
            versionCode: null,
            installState: 'INSTALLED',
            enabled: true,
            sourceCategory: null,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('calculates an owned effective policy deterministically', async () => {
    const { service, policies } = createService();
    await policies.assign({
      managedDeviceId: deviceId,
      policyId,
      policyVersion: 1,
      assignedBy: adminId,
    });
    const effective = await service.getEffectivePolicy(adminId, deviceId);
    expect(effective.policy?.id).toBe(policyId);
    expect(effective.policy?.version).toBe(1);
    expect(effective.synchronizationRequired).toBe(false);
  });

  it('rejects stale policy updates', async () => {
    const { service } = createService();
    await expect(
      service.updatePolicy({
        adminId,
        policyId,
        name: 'Changed',
        description: null,
        status: 'ACTIVE',
        expectedVersion: 9,
        rules: [{ packageName: 'com.example.blocked', action: 'BLOCK' }],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
===== tests/command-service.test.ts =====
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
