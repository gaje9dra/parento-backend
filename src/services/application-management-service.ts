import { randomUUID } from 'node:crypto';
import type {
  ApplicationEnforcementStatus,
  ApplicationInventoryItem,
  ApplicationPolicy,
  ApplicationPolicyAssignment,
  ApplicationPolicySyncState,
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
        ...input,
        updatedBy: input.adminId,
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
      metadata: { commandId: sync.command.id },
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
      ...input,
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
===== src/services/command-service.ts =====
import { randomUUID } from 'node:crypto';
import type { Command, CommandStatus, CommandType } from '../domain/command.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { CommandRepository } from '../repositories/command-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import { AppError } from '../types/errors.js';
import type { CommandDeliveryService } from './command-delivery-service.js';
import type { ScreenSharingSessionRepository } from '../repositories/screen-sharing-session-repository.js';
import type { AudioAccessSessionRepository } from '../repositories/audio-access-session-repository.js';

export interface CommandServiceOptions {
  readonly ttlSeconds: number;
  readonly maxPayloadBytes: number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CommandService {
  constructor(
    private readonly commands: CommandRepository,
    private readonly devices: ManagedDeviceRepository,
    private readonly options: CommandServiceOptions,
    private readonly delivery?: CommandDeliveryService,
    private readonly screenSessions?: ScreenSharingSessionRepository,
    private readonly audioSessions?: AudioAccessSessionRepository,
  ) {}
  async create(
    adminId: string,
    input: {
      deviceId: string;
      type: CommandType;
      version: number;
      payload: unknown;
      idempotencyKey: string | null;
      correlationId: string | null;
    },
  ): Promise<{ command: Command; created: boolean }> {
    if (!UUID.test(input.deviceId))
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Managed-device identifier is invalid.',
      );
    if (
      ![
        'FUTURE_COMMAND',
        'START_SCREEN_SHARE',
        'STOP_SCREEN_SHARE',
        'START_AUDIO_ACCESS',
        'STOP_AUDIO_ACCESS',
        'SYNC_APPLICATION_POLICY',
        'REQUEST_APPLICATION_INVENTORY',
      ].includes(input.type) ||
      input.version !== 1
    )
      throw new AppError(
        400,
        'UNSUPPORTED_COMMAND_TYPE',
        'The requested command type is not enabled in this phase.',
      );
    if (
      input.payload === null ||
      typeof input.payload !== 'object' ||
      Array.isArray(input.payload)
    )
      throw new AppError(
        400,
        'INVALID_COMMAND_PAYLOAD',
        'Command payload must be a JSON object.',
      );
    const payload = input.payload as Record<string, unknown>;
    if (input.type === 'FUTURE_COMMAND' && Object.keys(payload).length !== 0)
      throw new AppError(
        400,
        'INVALID_COMMAND_PAYLOAD',
        'FUTURE_COMMAND does not accept executable or device-control payload data.',
      );
    if (input.type !== 'FUTURE_COMMAND') {
      const keys = Object.keys(payload);
      const key = keys[0];
      const validCapability =
        keys.length === 1 &&
        (key === 'screenSessionId' || key === 'audioSessionId');
      const validCapabilityValue =
        (key === 'screenSessionId' &&
          typeof payload.screenSessionId === 'string' &&
          UUID.test(payload.screenSessionId)) ||
        (key === 'audioSessionId' &&
          typeof payload.audioSessionId === 'string' &&
          UUID.test(payload.audioSessionId));
      const validApplicationPolicy =
        input.type === 'SYNC_APPLICATION_POLICY' &&
        keys.length === 2 &&
        typeof payload.policyId === 'string' &&
        UUID.test(payload.policyId) &&
        Number.isInteger(payload.policyVersion) &&
        Number(payload.policyVersion) > 0;
      const validApplicationPolicyRemoval =
        input.type === 'SYNC_APPLICATION_POLICY' &&
        keys.length === 2 &&
        payload.policyId === null &&
        payload.policyVersion === null;
      const validInventoryRequest =
        input.type === 'REQUEST_APPLICATION_INVENTORY' &&
        keys.length === 1 &&
        payload.schemaVersion === 1;
      if (
        !validCapability &&
        !validApplicationPolicy &&
        !validApplicationPolicyRemoval &&
        !validInventoryRequest
      ) {
        throw new AppError(
          400,
          'INVALID_COMMAND_PAYLOAD',
          'The command payload is not valid for the requested command type.',
        );
      }
    }
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (bytes > this.options.maxPayloadBytes)
      throw new AppError(
        413,
        'COMMAND_PAYLOAD_TOO_LARGE',
        'Command payload is too large.',
      );
    const device = await this.devices.findById(input.deviceId);
    if (device === null)
      throw new AppError(
        404,
        'DEVICE_NOT_FOUND',
        'Managed device was not found.',
      );
    if (device.adminId !== adminId)
      throw new AppError(
        403,
        'AUTHORIZATION_DENIED',
        'The administrator does not control this device.',
      );
    if (
      device.enrollmentStatus !== 'ACTIVE' ||
      device.operationalStatus !== 'ACTIVE'
    )
      throw new AppError(
        409,
        'DEVICE_NOT_READY',
        'Managed device is not available for commands.',
      );
    if (
      input.idempotencyKey !== null &&
      !/^[A-Za-z0-9._:-]{1,128}$/.test(input.idempotencyKey)
    )
      throw new AppError(400, 'INVALID_REQUEST', 'Idempotency key is invalid.');
    const now = new Date();
    try {
      const created = await this.commands.create({
        id: randomUUID(),
        managedDeviceId: device.id,
        adminId,
        type: input.type,
        version: 1,
        payload,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(now.getTime() + this.options.ttlSeconds * 1000),
      });
      if (!created.created) {
        if (this.delivery !== undefined)
          await this.delivery.deliverQueuedForDevice(device.id);
        const existing = await this.commands.findById(created.command.id);
        return { command: existing ?? created.command, created: false };
      }
      const queued = await this.commands.transition({
        id: created.command.id,
        from: 'CREATED',
        to: 'QUEUED',
        actorType: 'SYSTEM',
        actorId: null,
        now: new Date(),
        correlationId: created.command.correlationId,
      });
      if (this.delivery !== undefined) {
        await this.delivery.deliverQueuedForDevice(device.id);
      }
      const latest = await this.commands.findById(queued.id);
      return { command: latest ?? queued, created: true };
    } catch (error) {
      if (error instanceof PersistenceError && error.code === 'CONFLICT')
        throw new AppError(
          409,
          'COMMAND_IDEMPOTENCY_CONFLICT',
          'A command already exists for this idempotency key.',
        );
      throw error;
    }
  }
  async createScreenShareCommand(
    adminId: string,
    input: {
      deviceId: string;
      type: 'START_SCREEN_SHARE' | 'STOP_SCREEN_SHARE';
      screenSessionId: string;
      correlationId: string;
    },
  ): Promise<{ command: Command; created: boolean }> {
    if (this.screenSessions === undefined) {
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Screen-sharing command security is not configured.',
      );
    }
    const screenSession = await this.screenSessions.findById(
      input.screenSessionId,
    );
    if (
      screenSession === null ||
      screenSession.managedDeviceId !== input.deviceId ||
      screenSession.adminId !== adminId
    ) {
      throw new AppError(
        404,
        'SCREEN_SESSION_NOT_FOUND',
        'Screen-sharing session was not found.',
      );
    }

    const startAllowed =
      input.type === 'START_SCREEN_SHARE' &&
      screenSession.status === 'AUTHORIZED';
    const stopAllowed =
      input.type === 'STOP_SCREEN_SHARE' &&
      ['AUTHORIZED', 'STARTING', 'ACTIVE', 'STOPPING'].includes(
        screenSession.status,
      );

    if (!startAllowed && !stopAllowed) {
      throw new AppError(
        409,
        'SCREEN_SESSION_STATE_CONFLICT',
        'The screen-sharing command is not valid for the current session state.',
      );
    }

    const idempotencyKey =
      'screen-session:' + input.screenSessionId + ':' + input.type;
    return this.create(adminId, {
      deviceId: input.deviceId,
      type: input.type,
      version: 1,
      payload: { screenSessionId: input.screenSessionId },
      idempotencyKey,
      correlationId: input.correlationId,
    });
  }

  async createAudioAccessCommand(
    adminId: string,
    input: {
      deviceId: string;
      type: 'START_AUDIO_ACCESS' | 'STOP_AUDIO_ACCESS';
      audioSessionId: string;
      correlationId: string;
    },
  ): Promise<{ command: Command; created: boolean }> {
    if (this.audioSessions === undefined) {
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Audio-access command security is not configured.',
      );
    }
    const session = await this.audioSessions.findById(input.audioSessionId);
    if (
      session === null ||
      session.managedDeviceId !== input.deviceId ||
      session.adminId !== adminId
    ) {
      throw new AppError(
        404,
        'AUDIO_SESSION_NOT_FOUND',
        'Audio-access session was not found.',
      );
    }
    const startAllowed =
      input.type === 'START_AUDIO_ACCESS' && session.status === 'AUTHORIZED';
    const stopAllowed =
      input.type === 'STOP_AUDIO_ACCESS' &&
      ['AUTHORIZED', 'STARTING', 'ACTIVE', 'STOPPING'].includes(session.status);
    if (!startAllowed && !stopAllowed) {
      throw new AppError(
        409,
        'AUDIO_SESSION_STATE_CONFLICT',
        'The audio-access command is not valid for the current session state.',
      );
    }
    return this.create(adminId, {
      deviceId: input.deviceId,
      type: input.type,
      version: 1,
      payload: { audioSessionId: input.audioSessionId },
      idempotencyKey:
        'audio-session:' + input.audioSessionId + ':' + input.type,
      correlationId: input.correlationId,
    });
  }

  async createApplicationPolicyCommand(
    adminId: string,
    input: {
      deviceId: string;
      policyId: string | null;
      policyVersion: number | null;
      correlationId: string;
    },
  ): Promise<{ command: Command; created: boolean }> {
    const isRemoval = input.policyId === null && input.policyVersion === null;
    if (
      !isRemoval &&
      (input.policyId === null || input.policyVersion === null)
    ) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Policy identity is incomplete.',
      );
    }
    return this.create(adminId, {
      deviceId: input.deviceId,
      type: 'SYNC_APPLICATION_POLICY',
      version: 1,
      payload: { policyId: input.policyId, policyVersion: input.policyVersion },
      idempotencyKey:
        'application-policy:' +
        input.deviceId +
        ':' +
        (input.policyVersion === null ? 'none' : input.policyVersion),
      correlationId: input.correlationId,
    });
  }

  async createApplicationInventoryRequest(
    adminId: string,
    input: { deviceId: string; correlationId: string },
  ): Promise<{ command: Command; created: boolean }> {
    return this.create(adminId, {
      deviceId: input.deviceId,
      type: 'REQUEST_APPLICATION_INVENTORY',
      version: 1,
      payload: { schemaVersion: 1 },
      idempotencyKey:
        'application-inventory:' + input.deviceId + ':' + input.correlationId,
      correlationId: input.correlationId,
    });
  }

  async getOwned(id: string, adminId: string): Promise<Command> {
    const command = await this.commands.findOwned(id, adminId);
    if (command === null)
      throw new AppError(404, 'COMMAND_NOT_FOUND', 'Command was not found.');
    return this.expireIfNeeded(command);
  }
  async getOwnedForDevice(
    id: string,
    adminId: string,
    deviceId: string,
  ): Promise<Command> {
    const command = await this.getOwned(id, adminId);
    if (command.managedDeviceId !== deviceId)
      throw new AppError(
        403,
        'AUTHORIZATION_DENIED',
        'The command is not assigned to this device.',
      );
    return command;
  }
  async cancel(
    id: string,
    adminId: string,
    deviceId?: string,
  ): Promise<Command> {
    const command = await this.getOwned(id, adminId);
    if (deviceId !== undefined && command.managedDeviceId !== deviceId)
      throw new AppError(
        403,
        'AUTHORIZATION_DENIED',
        'The command is not assigned to this device.',
      );
    if (
      ['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REJECTED'].includes(
        command.status,
      )
    )
      throw new AppError(
        409,
        'COMMAND_STATE_CONFLICT',
        'The command cannot be cancelled in its current state.',
      );
    try {
      return await this.commands.cancelOwned(id, adminId, new Date());
    } catch (error) {
      if (error instanceof PersistenceError)
        throw new AppError(409, 'COMMAND_STATE_CONFLICT', error.message);
      throw error;
    }
  }
  async acknowledge(
    id: string,
    session: { id: string; managedDeviceId: string },
  ): Promise<Command> {
    return this.deviceTransition(id, session, 'DELIVERED', 'ACKNOWLEDGED');
  }
  async start(
    id: string,
    session: { id: string; managedDeviceId: string },
  ): Promise<Command> {
    return this.deviceTransition(id, session, 'ACKNOWLEDGED', 'RUNNING');
  }
  async result(
    id: string,
    session: { id: string; managedDeviceId: string },
    status: 'SUCCEEDED' | 'FAILED',
    resultCode: string | null,
    errorCategory: string | null,
    resultMetadata: Record<string, unknown> | null,
  ): Promise<Command> {
    const command = await this.commands.findById(id);
    this.assertDevice(command, session.managedDeviceId);
    if (resultMetadata !== null) {
      const bytes = Buffer.byteLength(JSON.stringify(resultMetadata), 'utf8');
      if (bytes > this.options.maxPayloadBytes) {
        throw new AppError(
          413,
          'COMMAND_PAYLOAD_TOO_LARGE',
          'Command result metadata is too large.',
        );
      }
    }
    if (command!.status !== 'RUNNING')
      throw new AppError(
        409,
        'COMMAND_STATE_CONFLICT',
        'Command is not running.',
      );
    try {
      return await this.commands.transition({
        id,
        from: 'RUNNING',
        to: status,
        actorType: 'DEVICE',
        actorId: session.managedDeviceId,
        now: new Date(),
        correlationId: command!.correlationId,
        resultCode,
        errorCategory,
        resultMetadata,
      });
    } catch (error) {
      if (error instanceof PersistenceError)
        throw new AppError(409, 'COMMAND_STATE_CONFLICT', error.message);
      throw error;
    }
  }
  private async deviceTransition(
    id: string,
    session: { id: string; managedDeviceId: string },
    from: CommandStatus,
    to: CommandStatus,
  ): Promise<Command> {
    const command = await this.commands.findById(id);
    this.assertDevice(command, session.managedDeviceId);
    if (command!.status !== from)
      throw new AppError(
        409,
        'COMMAND_STATE_CONFLICT',
        'Command is not in the required state.',
      );
    try {
      return await this.commands.transition({
        id,
        from,
        to,
        actorType: 'DEVICE',
        actorId: session.managedDeviceId,
        now: new Date(),
        correlationId: command!.correlationId,
      });
    } catch (error) {
      if (error instanceof PersistenceError)
        throw new AppError(409, 'COMMAND_STATE_CONFLICT', error.message);
      throw error;
    }
  }
  private assertDevice(
    command: Command | null,
    deviceId: string,
  ): asserts command is Command {
    if (command === null)
      throw new AppError(404, 'COMMAND_NOT_FOUND', 'Command was not found.');
    if (command.managedDeviceId !== deviceId)
      throw new AppError(
        403,
        'AUTHORIZATION_DENIED',
        'The command is not assigned to this device.',
      );
  }
  private async expireIfNeeded(command: Command): Promise<Command> {
    if (
      command.expiresAt.getTime() > Date.now() ||
      ['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REJECTED'].includes(
        command.status,
      )
    )
      return command;
    try {
      return await this.commands.transition({
        id: command.id,
        from: command.status,
        to: 'EXPIRED',
        actorType: 'SYSTEM',
        actorId: null,
        now: new Date(),
        correlationId: command.correlationId,
      });
    } catch {
      return command;
    }
  }
}
===== tests/application-management-database.integration.test.ts =====
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
