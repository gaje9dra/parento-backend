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
  rules: [
    { policyId, packageName: 'com.example.blocked', action: 'BLOCK' },
  ],
});

class InventoryFake implements ApplicationInventoryRepository {
  readonly name = 'inventory';
  async replaceForDevice() { return { applied: true, receivedAt: new Date() }; }
  async listForAdmin() { return { items: [], nextCursor: null, observedAt: null, receivedAt: null }; }
  async findForAdmin() { return null; }
}

class PolicyFake implements ApplicationPolicyRepository {
  readonly name = 'policy';
  assignment: ApplicationPolicyAssignment | null = null;
  sync: ApplicationPolicySyncState | null = null;
  async create() { return policy(); }
  async findOwned() { return policy(); }
  async listOwned() { return { items: [policy()], nextCursor: null }; }
  async updateOwned(input: { expectedVersion: number }) {
    if (input.expectedVersion !== 1) throw new PersistenceError('CONFLICT', 'stale');
    return policy(2);
  }
  async disableOwned() { return policy(2); }
  async listAssignmentsForPolicy() { return this.assignment ? [this.assignment] : []; }
  async assign(input: { managedDeviceId: string; policyId: string; policyVersion: number; assignedBy: string }) {
    this.assignment = {
      ...input,
      assignedAt: new Date(),
      updatedAt: new Date(),
    };
    return this.assignment;
  }
  async removeAssignment() { this.assignment = null; }
  async findAssignment() { return this.assignment; }
  async findSyncState() { return this.sync; }
  async setSyncRequested(input: { managedDeviceId: string; policyId: string | null; policyVersion: number | null; requestedAt: Date }) {
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
  async reportSync(input: { managedDeviceId: string; policyId: string | null; policyVersion: number | null; status: ApplicationPolicySyncState['status']; reportedAt: Date; errorCode: string | null }) {
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
  async create() { return device; }
  async findById() { return device; }
  async findByStableIdentifier() { return device; }
  async list() { return { items: [device], nextCursor: null }; }
  async listByAdminId() { return { items: [device], nextCursor: null }; }
  async updateStatus() { return device; }
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
