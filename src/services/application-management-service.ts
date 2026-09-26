import { randomUUID } from 'node:crypto';
import type {
  ApplicationEnforcementStatus,
  ApplicationInventoryItem,
  ApplicationPolicy,
  ApplicationPolicyAssignment,
  ApplicationRuleAction,
} from '../domain/application-management.js';
import { isValidAndroidPackageName } from '../domain/application-management.js';
import type { ApplicationInventoryRepository } from '../repositories/application-inventory-repository.js';
import type { ApplicationManagementEventRepository } from '../repositories/application-management-event-repository.js';
import type { ApplicationPolicyRepository } from '../repositories/application-policy-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type { CommandService } from './command-service.js';
import { AppError } from '../types/errors.js';
import { PersistenceError } from '../domain/persistence-errors.js';

export interface ApplicationManagementOptions {
  readonly maxInventoryItems: number;
  readonly maxPolicyRules: number;
  readonly maxFutureSkewSeconds: number;
  readonly staleSeconds: number;
  readonly veryStaleSeconds: number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validatePackage = (packageName: string): void => {
  if (!isValidAndroidPackageName(packageName)) {
    throw new AppError(
      400,
      'INVALID_REQUEST',
      'Application package name is invalid.',
    );
  }
};

const validateTimestamp = (
  value: Date,
  now: Date,
  maxFutureSkewSeconds: number,
): void => {
  if (Number.isNaN(value.getTime()) || value.getTime() < 0) {
    throw new AppError(
      400,
      'INVALID_REQUEST',
      'Application timestamp is invalid.',
    );
  }
  if (value.getTime() > now.getTime() + maxFutureSkewSeconds * 1000) {
    throw new AppError(
      400,
      'INVALID_REQUEST',
      'Application timestamp is too far in the future.',
    );
  }
};

const validateRules = (
  rules: readonly { packageName: string; action: ApplicationRuleAction }[],
  maxRules: number,
): void => {
  if (rules.length > maxRules) {
    throw new AppError(
      413,
      'REQUEST_TOO_LARGE',
      'Application policy contains too many rules.',
    );
  }
  const seen = new Set<string>();
  for (const rule of rules) {
    validatePackage(rule.packageName);
    if (seen.has(rule.packageName)) {
      throw new AppError(
        409,
        'CONFLICT',
        'Application policy contains duplicate package rules.',
      );
    }
    seen.add(rule.packageName);
    if (rule.action !== 'ALLOW' && rule.action !== 'BLOCK') {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Application policy rule action is invalid.',
      );
    }
  }
};

export class ApplicationManagementService {
  constructor(
    private readonly inventory: ApplicationInventoryRepository,
    private readonly policies: ApplicationPolicyRepository,
    private readonly devices: ManagedDeviceRepository,
    private readonly commands: CommandService,
    private readonly events: ApplicationManagementEventRepository,
    private readonly options: ApplicationManagementOptions,
  ) {}

  async reportInventory(input: {
    managedDeviceId: string;
    observedAt: Date;
    receivedAt: Date;
    items: readonly Omit<
      ApplicationInventoryItem,
      | 'managedDeviceId'
      | 'firstObservedAt'
      | 'lastObservedAt'
      | 'lastReceivedAt'
    >[];
  }) {
    const now = input.receivedAt;
    validateTimestamp(input.observedAt, now, this.options.maxFutureSkewSeconds);
    if (input.items.length > this.options.maxInventoryItems) {
      throw new AppError(
        413,
        'REQUEST_TOO_LARGE',
        'Application inventory contains too many applications.',
      );
    }

    const seen = new Set<string>();
    for (const item of input.items) {
      validatePackage(item.packageName);
      if (seen.has(item.packageName)) {
        throw new AppError(
          409,
          'CONFLICT',
          'Application inventory contains duplicate package names.',
        );
      }
      seen.add(item.packageName);
      if (
        item.versionCode !== null &&
        (!Number.isSafeInteger(item.versionCode) || item.versionCode < 0)
      ) {
        throw new AppError(
          400,
          'INVALID_REQUEST',
          'Application version code is invalid.',
        );
      }
    }

    const device = await this.devices.findById(input.managedDeviceId);
    if (
      device === null ||
      device.enrollmentStatus !== 'ACTIVE' ||
      device.operationalStatus !== 'ACTIVE'
    ) {
      throw new AppError(
        403,
        'DEVICE_AUTHORIZATION_DENIED',
        'Application inventory reporting is not authorized.',
      );
    }

    const result = await this.inventory.replaceForDevice(input);
    if (result.applied) {
      await this.events.record({
        id: randomUUID(),
        eventType: 'INVENTORY_SYNCHRONIZED',
        adminId: device.adminId,
        managedDeviceId: device.id,
        policyId: null,
        policyVersion: null,
        metadata: { applicationCount: input.items.length },
      });
    }
    return result;
  }

  async listInventory(
    adminId: string,
    deviceId: string,
    page?: { limit?: number; cursor?: string | null },
  ) {
    const device = await this.requireOwnedDevice(adminId, deviceId);
    const result = await this.inventory.listForAdmin(adminId, device.id, page);
    const freshness = this.inventoryFreshness(
      result.receivedAt,
      device.enrollmentStatus,
      device.operationalStatus,
      device.lastSeenAt,
      new Date(),
    );
    return { ...result, freshness };
  }

  async getInventoryItem(
    adminId: string,
    deviceId: string,
    packageName: string,
  ) {
    validatePackage(packageName);
    await this.requireOwnedDevice(adminId, deviceId);
    return this.inventory.findForAdmin(adminId, deviceId, packageName);
  }

  async requestInventory(adminId: string, deviceId: string) {
    const device = await this.requireOwnedActiveDevice(adminId, deviceId);
    const correlationId = randomUUID();
    const result = await this.commands.createApplicationInventoryRequest(
      adminId,
      { deviceId: device.id, correlationId },
    );
    await this.events.record({
      id: randomUUID(),
      eventType: 'POLICY_SYNC_REQUESTED',
      adminId,
      managedDeviceId: device.id,
      policyId: null,
      policyVersion: null,
      metadata: { commandType: 'REQUEST_APPLICATION_INVENTORY' },
    });
    return result;
  }

  async createPolicy(input: {
    adminId: string;
    name: string;
    description: string | null;
    rules: readonly { packageName: string; action: ApplicationRuleAction }[];
  }) {
    validateRules(input.rules, this.options.maxPolicyRules);
    let policy: ApplicationPolicy;
    try {
      policy = await this.policies.create({
        id: randomUUID(),
        adminId: input.adminId,
        name: input.name.trim(),
        description: input.description,
        createdBy: input.adminId,
        rules: input.rules,
      });
    } catch (error) {
      if (error instanceof PersistenceError && error.code === 'CONFLICT') {
        throw new AppError(
          409,
          'CONFLICT',
          'An application policy with this name already exists.',
        );
      }
      throw error;
    }
    await this.events.record({
      id: randomUUID(),
      eventType: 'POLICY_CREATED',
      adminId: input.adminId,
      managedDeviceId: null,
      policyId: policy.id,
      policyVersion: policy.version,
      metadata: { ruleCount: policy.rules.length },
    });
    return policy;
  }

  async getPolicy(adminId: string, policyId: string) {
    this.assertUuid(policyId, 'Policy identifier is invalid.');
    const policy = await this.policies.findOwned(policyId, adminId);
    if (!policy)
      throw new AppError(
        404,
        'RESOURCE_NOT_FOUND',
        'Application policy was not found.',
      );
    return policy;
  }

  async listPolicies(
    adminId: string,
    page?: { limit?: number; cursor?: string | null },
  ) {
    return this.policies.listOwned(adminId, page);
  }

  async updatePolicy(input: {
    adminId: string;
    policyId: string;
    name: string;
    description: string | null;
    status: 'ACTIVE' | 'DISABLED';
    expectedVersion: number;
    rules: readonly { packageName: string; action: ApplicationRuleAction }[];
  }) {
    validateRules(input.rules, this.options.maxPolicyRules);
    try {
      const policy = await this.policies.updateOwned({
        id: input.policyId,
        adminId: input.adminId,
        name: input.name,
        description: input.description,
        status: input.status,
        expectedVersion: input.expectedVersion,
        updatedBy: input.adminId,
        rules: input.rules,
      });
      await this.events.record({
        id: randomUUID(),
        eventType:
          input.status === 'DISABLED' ? 'POLICY_DISABLED' : 'POLICY_UPDATED',
        adminId: input.adminId,
        managedDeviceId: null,
        policyId: policy.id,
        policyVersion: policy.version,
        metadata: { ruleCount: policy.rules.length },
      });
      await this.syncAssignedDevices(input.adminId, policy);
      return policy;
    } catch (error) {
      if (error instanceof PersistenceError && error.code === 'CONFLICT') {
        throw new AppError(
          409,
          'CONFLICT',
          'Application policy version is stale.',
        );
      }
      if (error instanceof PersistenceError && error.code === 'NOT_FOUND') {
        throw new AppError(
          404,
          'RESOURCE_NOT_FOUND',
          'Application policy was not found.',
        );
      }
      throw error;
    }
  }

  async assignPolicy(adminId: string, deviceId: string, policyId: string) {
    const device = await this.requireOwnedActiveDevice(adminId, deviceId);
    const policy = await this.getPolicy(adminId, policyId);
    if (policy.status !== 'ACTIVE') {
      throw new AppError(
        409,
        'CONFLICT',
        'A disabled application policy cannot be assigned.',
      );
    }
    let assignment: ApplicationPolicyAssignment;
    try {
      assignment = await this.policies.assign({
        managedDeviceId: device.id,
        policyId: policy.id,
        policyVersion: policy.version,
        assignedBy: adminId,
      });
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw new AppError(
          409,
          'CONFLICT',
          'Application policy assignment could not be applied.',
        );
      }
      throw error;
    }
    const sync = await this.requestPolicySync(
      adminId,
      device.id,
      policy.id,
      policy.version,
    );
    await this.events.record({
      id: randomUUID(),
      eventType: 'POLICY_ASSIGNED',
      adminId,
      managedDeviceId: device.id,
      policyId: policy.id,
      policyVersion: policy.version,
      metadata: { commandId: sync.command.command.id },
    });
    return { assignment, sync };
  }

  async removePolicy(adminId: string, deviceId: string, policyId: string) {
    const device = await this.requireOwnedActiveDevice(adminId, deviceId);
    const policy = await this.getPolicy(adminId, policyId);
    const assignment = await this.policies.findAssignment(device.id);
    if (!assignment || assignment.policyId !== policy.id) {
      throw new AppError(
        404,
        'RESOURCE_NOT_FOUND',
        'Application policy assignment was not found.',
      );
    }
    await this.policies.removeAssignment(device.id, policy.id);
    const sync = await this.requestPolicySync(adminId, device.id, null, null);
    await this.events.record({
      id: randomUUID(),
      eventType: 'POLICY_REMOVED',
      adminId,
      managedDeviceId: device.id,
      policyId: policy.id,
      policyVersion: assignment.policyVersion,
      metadata: { commandId: sync.command.id },
    });
    return { removed: true, sync };
  }

  async getEffectivePolicy(adminId: string, deviceId: string) {
    const device = await this.requireOwnedDevice(adminId, deviceId);
    const assignment = await this.policies.findAssignment(device.id);
    if (!assignment) {
      return {
        managedDeviceId: device.id,
        policy: null,
        policyVersion: null,
        synchronizationRequired: false,
      };
    }
    const policy = await this.getPolicy(adminId, assignment.policyId);
    if (policy.status !== 'ACTIVE') {
      return {
        managedDeviceId: device.id,
        policy: null,
        policyVersion: policy.version,
        synchronizationRequired: true,
      };
    }
    return {
      managedDeviceId: device.id,
      policy: {
        id: policy.id,
        version: policy.version,
        rules: policy.rules,
      },
      policyVersion: policy.version,
      synchronizationRequired: assignment.policyVersion !== policy.version,
    };
  }

  async getEnforcementStatus(adminId: string, deviceId: string) {
    await this.requireOwnedDevice(adminId, deviceId);
    return this.policies.findSyncState(deviceId);
  }

  async getDevicePolicy(deviceId: string) {
    const device = await this.requireOwnedActiveDevice(null, deviceId);
    const assignment = await this.policies.findAssignment(device.id);
    if (!assignment) {
      return {
        managedDeviceId: device.id,
        policy: null,
        policyVersion: null,
        synchronizationRequired: false,
      };
    }
    const policy = await this.policies.findOwned(
      assignment.policyId,
      device.adminId,
    );
    if (!policy || policy.status !== 'ACTIVE') {
      return {
        managedDeviceId: device.id,
        policy: null,
        policyVersion: null,
        synchronizationRequired: true,
      };
    }
    return {
      managedDeviceId: device.id,
      policy: { id: policy.id, version: policy.version, rules: policy.rules },
      policyVersion: policy.version,
      synchronizationRequired: assignment.policyVersion !== policy.version,
    };
  }

  async reportDeviceStatus(input: {
    deviceId: string;
    policyId: string | null;
    policyVersion: number | null;
    status: ApplicationEnforcementStatus;
    reportedAt: Date;
    errorCode: string | null;
  }) {
    const device = await this.requireOwnedActiveDevice(null, input.deviceId);
    validateTimestamp(
      input.reportedAt,
      new Date(),
      this.options.maxFutureSkewSeconds,
    );
    if (input.policyId !== null)
      this.assertUuid(input.policyId, 'Policy identifier is invalid.');
    if (
      input.policyVersion !== null &&
      (!Number.isInteger(input.policyVersion) || input.policyVersion <= 0)
    ) {
      throw new AppError(400, 'INVALID_REQUEST', 'Policy version is invalid.');
    }
    const assignment = await this.policies.findAssignment(device.id);
    if (input.status === 'APPLIED') {
      if (assignment) {
        if (
          input.policyId !== assignment.policyId ||
          input.policyVersion !== assignment.policyVersion
        ) {
          throw new AppError(
            409,
            'CONFLICT',
            'A device cannot report an applied policy that is not its current assignment.',
          );
        }
      } else if (input.policyId !== null || input.policyVersion !== null) {
        throw new AppError(
          409,
          'CONFLICT',
          'A device without an assigned policy must report a null policy.',
        );
      }
    }
    const current = await this.policies.findSyncState(device.id);
    const result = await this.policies.reportSync({
      managedDeviceId: input.deviceId,
      policyId: input.policyId,
      policyVersion: input.policyVersion,
      status: input.status,
      reportedAt: input.reportedAt,
      errorCode: input.errorCode?.slice(0, 128) ?? null,
    });
    if (
      current?.status !== result.status ||
      current?.reportedPolicyVersion !== result.reportedPolicyVersion
    ) {
      await this.events.record({
        id: randomUUID(),
        eventType: 'ENFORCEMENT_STATUS_CHANGED',
        adminId: device.adminId,
        managedDeviceId: device.id,
        policyId: result.reportedPolicyId,
        policyVersion: result.reportedPolicyVersion,
        metadata: { status: result.status },
      });
    }
    return result;
  }

  async requestPolicySync(
    adminId: string,
    deviceId: string,
    policyId: string | null,
    policyVersion: number | null,
  ) {
    await this.requireOwnedActiveDevice(adminId, deviceId);
    const correlationId = randomUUID();
    const command = await this.commands.createApplicationPolicyCommand(
      adminId,
      { deviceId, policyId, policyVersion, correlationId },
    );
    const sync = await this.policies.setSyncRequested({
      managedDeviceId: deviceId,
      policyId,
      policyVersion,
      requestedAt: new Date(),
    });
    await this.events.record({
      id: randomUUID(),
      eventType: 'POLICY_SYNC_REQUESTED',
      adminId,
      managedDeviceId: deviceId,
      policyId,
      policyVersion,
      metadata: { commandId: command.command.id },
    });
    return { command, sync };
  }

  private async syncAssignedDevices(
    adminId: string,
    policy: ApplicationPolicy,
  ) {
    const assignments = await this.policies.listAssignmentsForPolicy(policy.id);
    for (const assignment of assignments) {
      const device = await this.devices.findById(assignment.managedDeviceId);
      if (
        !device ||
        device.adminId !== adminId ||
        device.enrollmentStatus !== 'ACTIVE' ||
        device.operationalStatus !== 'ACTIVE'
      ) {
        continue;
      }
      const correlationId = randomUUID();
      const command = await this.commands.createApplicationPolicyCommand(
        adminId,
        {
          deviceId: device.id,
          policyId: policy.status === 'ACTIVE' ? policy.id : null,
          policyVersion: policy.status === 'ACTIVE' ? policy.version : null,
          correlationId,
        },
      );
      await this.policies.setSyncRequested({
        managedDeviceId: device.id,
        policyId: policy.status === 'ACTIVE' ? policy.id : null,
        policyVersion: policy.status === 'ACTIVE' ? policy.version : null,
        requestedAt: new Date(),
      });
      await this.events.record({
        id: randomUUID(),
        eventType: 'POLICY_SYNC_REQUESTED',
        adminId,
        managedDeviceId: device.id,
        policyId: policy.status === 'ACTIVE' ? policy.id : null,
        policyVersion: policy.status === 'ACTIVE' ? policy.version : null,
        metadata: { commandId: command.command.id, reason: 'POLICY_CHANGED' },
      });
    }
  }

  private async requireOwnedDevice(adminId: string | null, deviceId: string) {
    this.assertUuid(deviceId, 'Managed-device identifier is invalid.');
    const device = await this.devices.findById(deviceId);
    if (!device)
      throw new AppError(
        404,
        'DEVICE_NOT_FOUND',
        'Managed device was not found.',
      );
    if (adminId !== null && device.adminId !== adminId) {
      throw new AppError(
        403,
        'AUTHORIZATION_DENIED',
        'The administrator does not control this device.',
      );
    }
    return device;
  }

  private async requireOwnedActiveDevice(
    adminId: string | null,
    deviceId: string,
  ) {
    const device = await this.requireOwnedDevice(adminId, deviceId);
    if (
      device.enrollmentStatus !== 'ACTIVE' ||
      device.operationalStatus !== 'ACTIVE'
    ) {
      throw new AppError(
        403,
        'DEVICE_AUTHORIZATION_DENIED',
        'Managed device is not authorized for application management.',
      );
    }
    return device;
  }

  private inventoryFreshness(
    receivedAt: Date | null,
    enrollmentStatus: string,
    operationalStatus: string,
    lastSeenAt: Date | null,
    now: Date,
  ):
    | 'FRESH'
    | 'STALE'
    | 'VERY_STALE'
    | 'NEVER_REPORTED'
    | 'DISCONNECTED'
    | 'REVOKED' {
    if (enrollmentStatus === 'REVOKED' || operationalStatus === 'REVOKED')
      return 'REVOKED';
    if (!receivedAt) return 'NEVER_REPORTED';
    if (
      !lastSeenAt ||
      now.getTime() - lastSeenAt.getTime() > this.options.staleSeconds * 1000
    ) {
      return 'DISCONNECTED';
    }
    const age = now.getTime() - receivedAt.getTime();
    if (age >= this.options.veryStaleSeconds * 1000) return 'VERY_STALE';
    if (age >= this.options.staleSeconds * 1000) return 'STALE';
    return 'FRESH';
  }

  private assertUuid(value: string, message: string): void {
    if (!UUID.test(value)) throw new AppError(400, 'INVALID_REQUEST', message);
  }
}
