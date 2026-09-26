import { describe, expect, it, vi } from 'vitest';
import { ApplicationManagementService } from '../src/services/application-management-service.js';
import { AppError } from '../src/types/errors.js';

const device = {
  id: '00000000-0000-4000-8000-000000000001',
  adminId: '00000000-0000-4000-8000-000000000002',
  stableIdentifier: 'device-1',
  name: 'Test device',
  platform: 'android',
  enrollmentStatus: 'ACTIVE' as const,
  operationalStatus: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSeenAt: new Date(),
};
const policy = {
  id: '00000000-0000-4000-8000-000000000003',
  adminId: device.adminId,
  name: 'Default',
  description: null,
  status: 'ACTIVE' as const,
  version: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: device.adminId,
  updatedBy: device.adminId,
  rules: [],
};

const makeService = (overrides: Record<string, unknown> = {}) => {
  const repository: any = {
    replaceInventory: vi.fn(async (input: any) => ({
      applied: true,
      state: {
        managedDeviceId: input.managedDeviceId,
        synchronizationId: input.synchronizationId,
        observedAt: input.observedAt,
        receivedAt: input.receivedAt,
      },
    })),
    getInventoryState: vi.fn(async () => null),
    listInventory: vi.fn(async () => ({ items: [], nextCursor: null })),
    findInventoryItem: vi.fn(async () => null),
    createPolicy: vi.fn(async () => policy),
    updatePolicy: vi.fn(async () => policy),
    disablePolicy: vi.fn(async () => policy),
    getPolicy: vi.fn(async () => policy),
    listPolicies: vi.fn(async () => [policy]),
    assignPolicy: vi.fn(async () => ({
      managedDeviceId: device.id,
      policyId: policy.id,
      policyVersion: 2,
      assignedAt: new Date(),
      assignedBy: device.adminId,
    })),
    listAssignmentsForPolicy: vi.fn(async () => []),
    removeAssignment: vi.fn(async () => true),
    getEffectivePolicy: vi.fn(async () => policy),
    getEnforcementState: vi.fn(async () => ({
      managedDeviceId: device.id,
      desiredPolicyId: policy.id,
      desiredPolicyVersion: 2,
      reportedPolicyId: null,
      reportedPolicyVersion: null,
      status: 'PENDING',
      synchronizationRequired: true,
      synchronizationRequestedAt: new Date(),
      lastReportedAt: null,
      failureCode: null,
    })),
    recordEnforcement: vi.fn(async () => null),
    ...overrides,
  };
  const devices: any = { findById: vi.fn(async () => device) };
  const sessions: any = {
    findActiveByDeviceId: vi.fn(async () => ({
      id: 's',
      managedDeviceId: device.id,
    })),
  };
  const commands: any = {
    create: vi.fn(async (_admin: any, input: any) => ({
      created: true,
      command: { ...input, id: '00000000-0000-4000-8000-000000000004' },
    })),
  };
  return {
    service: new ApplicationManagementService(
      repository,
      devices,
      sessions,
      commands,
      {
        staleSeconds: 300,
        veryStaleSeconds: 86400,
        maxInventoryItems: 1000,
        maxRuleCount: 500,
        maxInventoryPayloadBytes: 131072,
        maxFutureSkewSeconds: 300,
      },
    ),
    repository,
    devices,
    sessions,
    commands,
  };
};

describe('application management service', () => {
  it('binds inventory submission to the authenticated managed device', async () => {
    const { service, repository } = makeService();
    const result = await service.submitInventory(
      { managedDeviceId: device.id },
      {
        schemaVersion: 1,
        synchronizationId: '00000000-0000-4000-8000-000000000005',
        observedAt: new Date(),
        applications: [
          {
            packageName: 'com.example.app',
            label: 'Example',
            versionName: '1.0',
            versionCode: 1,
            installState: 'INSTALLED',
            enabled: true,
            category: null,
          },
        ],
      },
    );
    expect(result.applied).toBe(true);
    expect(repository.replaceInventory).toHaveBeenCalledOnce();
  });

  it('rejects duplicate inventory package identifiers before persistence', async () => {
    const { service, repository } = makeService();
    await expect(
      service.submitInventory(
        { managedDeviceId: device.id },
        {
          schemaVersion: 1,
          synchronizationId: '00000000-0000-4000-8000-000000000005',
          observedAt: new Date(),
          applications: [
            {
              packageName: 'com.example.app',
              label: null,
              versionName: null,
              versionCode: null,
              installState: 'INSTALLED',
              enabled: null,
              category: null,
            },
            {
              packageName: 'com.example.app',
              label: null,
              versionName: null,
              versionCode: null,
              installState: 'INSTALLED',
              enabled: null,
              category: null,
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_APPLICATION_PACKAGE' });
    expect(repository.replaceInventory).not.toHaveBeenCalled();
  });

  it('assigns only the current active policy version and queues the existing command type', async () => {
    const { service, commands, repository } = makeService();
    const result = await service.assignPolicy(
      device.adminId,
      device.id,
      policy.id,
    );
    expect(result.policyVersion).toBe(2);
    expect(commands.create).toHaveBeenCalledWith(
      device.adminId,
      expect.objectContaining({
        type: 'SYNC_APPLICATION_POLICY',
        payload: { policyId: policy.id, policyVersion: 2 },
      }),
    );
    expect(repository.assignPolicy).toHaveBeenCalledOnce();
  });

  it('rejects an applied report for a stale policy version', async () => {
    const { service, repository } = makeService();
    await expect(
      service.reportEnforcement(
        { managedDeviceId: device.id },
        {
          policyId: policy.id,
          policyVersion: 1,
          status: 'APPLIED',
          failureCode: null,
        },
      ),
    ).rejects.toMatchObject({ code: 'STALE_APPLICATION_POLICY' });
    expect(repository.recordEnforcement).not.toHaveBeenCalled();
  });

  it('does not allow another admin to access the device', async () => {
    const { service } = makeService();
    await expect(
      service.getEffectivePolicy(
        '00000000-0000-4000-8000-000000000099',
        device.id,
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });
});
