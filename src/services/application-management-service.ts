import { randomUUID } from 'node:crypto';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type { CommandService } from './command-service.js';
import type {
  ApplicationAction,
  ApplicationEnforcementStatus,
  ApplicationInventoryItem,
  ApplicationPolicy,
} from '../domain/application-management.js';
import {
  calculateInventoryFreshness,
  isValidApplicationPackageName,
} from '../domain/application-management.js';
import type { ApplicationManagementRepository } from '../repositories/application-management-repository.js';
import { AppError } from '../types/errors.js';
import { PersistenceError } from '../domain/persistence-errors.js';

export interface ApplicationManagementServiceOptions {
  readonly staleSeconds: number;
  readonly veryStaleSeconds: number;
  readonly maxInventoryItems: number;
  readonly maxRuleCount: number;
  readonly maxInventoryPayloadBytes: number;
  readonly maxFutureSkewSeconds: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApplicationManagementService {
  constructor(
    private readonly repository: ApplicationManagementRepository,
    private readonly devices: ManagedDeviceRepository,
    private readonly sessions: DeviceConnectionSessionRepository,
    private readonly commands: CommandService,
    private readonly options: ApplicationManagementServiceOptions,
  ) {}

  async submitInventory(
    session: { managedDeviceId: string },
    input: {
      schemaVersion: number;
      synchronizationId: string;
      observedAt: Date;
      applications: Omit<ApplicationInventoryItem, 'managedDeviceId' | 'firstObservedAt' | 'lastObservedAt' | 'receivedAt'>[];
    },
  ) {
    if (input.schemaVersion !== 1)
      throw new AppError(400,'UNSUPPORTED_APPLICATION_SCHEMA','Unsupported application inventory schema.');
    if (!UUID.test(input.synchronizationId))
      throw new AppError(400,'INVALID_REQUEST','Inventory synchronization identifier is invalid.');
    if (
      input.observedAt.getTime() > Date.now() + this.options.maxFutureSkewSeconds * 1000 ||
      !Number.isFinite(input.observedAt.getTime()) ||
      input.observedAt.getTime() < 0
    )
      throw new AppError(400,'INVALID_APPLICATION_TIMESTAMP','Application inventory timestamp is invalid.');
    if (input.applications.length > this.options.maxInventoryItems)
      throw new AppError(413,'APPLICATION_INVENTORY_TOO_LARGE','Application inventory exceeds the configured application-count limit.');

    const seen = new Set<string>();
    for (const item of input.applications) {
      if (!isValidApplicationPackageName(item.packageName))
        throw new AppError(400,'INVALID_APPLICATION_PACKAGE','Application package name is invalid.');
      if (seen.has(item.packageName))
        throw new AppError(400,'DUPLICATE_APPLICATION_PACKAGE','Application inventory contains a duplicate package name.');
      seen.add(item.packageName);
      if (item.versionCode !== null && (!Number.isSafeInteger(item.versionCode) || item.versionCode < 0))
        throw new AppError(400,'INVALID_APPLICATION_VERSION','Application version code is invalid.');
    }

    const payloadBytes = Buffer.byteLength(JSON.stringify(input.applications),'utf8');
    if (payloadBytes > this.options.maxInventoryPayloadBytes)
      throw new AppError(413,'APPLICATION_INVENTORY_TOO_LARGE','Application inventory exceeds the configured payload limit.');

    const device = await this.devices.findById(session.managedDeviceId);
    if (
      device === null ||
      device.enrollmentStatus !== 'ACTIVE' ||
      device.operationalStatus !== 'ACTIVE'
    )
      throw new AppError(403,'DEVICE_AUTHORIZATION_DENIED','Managed-device application inventory is not authorized.');

    const result = await this.repository.replaceInventory({
      managedDeviceId: session.managedDeviceId,
      synchronizationId: input.synchronizationId,
      observedAt: input.observedAt,
      receivedAt: new Date(),
      applications: input.applications,
    });
    return result;
  }

  async listInventory(adminId: string, deviceId: string, page?: { limit?: number; cursor?: string | null }) {
    const device = await this.requireOwnedDevice(adminId,deviceId);
    const result = await this.repository.listInventory(device.id,page);
    const state = await this.repository.getInventoryState(device.id);
    const session = await this.sessions.findActiveByDeviceId?.(device.id);
    return {
      ...result,
      freshness: calculateInventoryFreshness(
        device,
        state?.receivedAt ?? null,
        new Date(),
        this.options.staleSeconds,
        this.options.veryStaleSeconds,
        session !== null && session !== undefined,
      ),
      synchronization: state,
    };
  }

  async getInventoryItem(adminId: string, deviceId: string, packageName: string) {
    const device = await this.requireOwnedDevice(adminId,deviceId);
    if (!isValidApplicationPackageName(packageName))
      throw new AppError(400,'INVALID_APPLICATION_PACKAGE','Application package name is invalid.');
    const item = await this.repository.findInventoryItem(device.id,packageName);
    if (!item) throw new AppError(404,'APPLICATION_NOT_FOUND','Application inventory item was not found.');
    return item;
  }

  async createPolicy(adminId: string, input: {
    name: string;
    description: string | null;
    rules: { packageName: string; action: ApplicationAction }[];
  }) {
    this.validateRules(input.rules);
    return this.repository.createPolicy({
      id: randomUUID(),adminId,name: input.name,description: input.description,createdBy: adminId,
      rules: input.rules.map((rule) => ({id: randomUUID(),...rule})),
    });
  }

  async updatePolicy(adminId: string, policyId: string, input: {
    name: string;
    description: string | null;
    rules: { packageName: string; action: ApplicationAction }[];
  }) {
    if (!UUID.test(policyId)) throw new AppError(400,'INVALID_POLICY_ID','Application policy identifier is invalid.');
    this.validateRules(input.rules);
    const policy = await this.repository.updatePolicy({
      id: policyId,adminId,name: input.name,description: input.description,updatedBy: adminId,
      rules: input.rules.map((rule) => ({id: randomUUID(),...rule})),
    });
    if (!policy) throw new AppError(404,'APPLICATION_POLICY_NOT_FOUND','Application policy was not found.');
    const assignments = await this.repository.listAssignmentsForPolicy(policy.id, adminId);
    await Promise.all(assignments.map((assignment) => this.enqueuePolicySync(adminId, assignment.managedDeviceId, policy.id, policy.version)));
    return policy;
  }

  async disablePolicy(adminId: string, policyId: string) {
    if (!UUID.test(policyId)) throw new AppError(400,'INVALID_POLICY_ID','Application policy identifier is invalid.');
    const policy = await this.repository.disablePolicy(policyId,adminId,adminId);
    if (!policy) throw new AppError(404,'APPLICATION_POLICY_NOT_FOUND','Application policy was not found.');
    return policy;
  }

  async getPolicy(adminId: string, policyId: string) {
    const policy = await this.repository.getPolicy(policyId,adminId);
    if (!policy) throw new AppError(404,'APPLICATION_POLICY_NOT_FOUND','Application policy was not found.');
    return policy;
  }

  listPolicies(adminId: string) {
    return this.repository.listPolicies(adminId);
  }

  async assignPolicy(adminId: string, deviceId: string, policyId: string) {
    const policy = await this.getPolicy(adminId,policyId);
    if (policy.status !== 'ACTIVE')
      throw new AppError(409,'APPLICATION_POLICY_DISABLED','Only an active application policy can be assigned.');
    const device = await this.requireOwnedDevice(adminId,deviceId);
    const assignment = await this.repository.assignPolicy({
      managedDeviceId: device.id,policyId: policy.id,policyVersion: policy.version,assignedBy: adminId,
    });
    await this.enqueuePolicySync(adminId,device.id,policy.id,policy.version);
    return assignment;
  }

  async removeAssignment(adminId: string, deviceId: string) {
    await this.requireOwnedDevice(adminId,deviceId);
    const removed = await this.repository.removeAssignment(deviceId,adminId);
    if (!removed) throw new AppError(404,'APPLICATION_POLICY_ASSIGNMENT_NOT_FOUND','Application policy assignment was not found.');
    return { removed: true };
  }

  async getEffectivePolicy(adminId: string, deviceId: string) {
    await this.requireOwnedDevice(adminId,deviceId);
    const policy = await this.repository.getEffectivePolicy(deviceId,adminId);
    return policy;
  }

  async getEnforcementStatus(adminId: string, deviceId: string) {
    await this.requireOwnedDevice(adminId,deviceId);
    return this.repository.getEnforcementState(deviceId,adminId);
  }

  async reportEnforcement(
    session: { managedDeviceId: string },
    input: {
      policyId: string | null;
      policyVersion: number | null;
      status: ApplicationEnforcementStatus;
      failureCode: string | null;
    },
  ) {
    if (input.policyId !== null && !UUID.test(input.policyId))
      throw new AppError(400,'INVALID_POLICY_ID','Application policy identifier is invalid.');
    if (input.policyVersion !== null && (!Number.isInteger(input.policyVersion) || input.policyVersion < 1))
      throw new AppError(400,'INVALID_POLICY_VERSION','Application policy version is invalid.');
    if ((input.policyId === null) !== (input.policyVersion === null))
      throw new AppError(400,'INVALID_REQUEST','Reported policy identifier and version must be provided together.');
    const device = await this.devices.findById(session.managedDeviceId);
    if (
      device === null ||
      device.enrollmentStatus !== 'ACTIVE' ||
      device.operationalStatus !== 'ACTIVE'
    )
      throw new AppError(403,'DEVICE_AUTHORIZATION_DENIED','Managed-device application enforcement reporting is not authorized.');

    const current = await this.repository.getEnforcementState(device.id,device.adminId);
    if (!current)
      throw new AppError(409,'APPLICATION_POLICY_STATE_UNAVAILABLE','Application policy state is not initialized.');
    if (
      input.status === 'APPLIED' &&
      (input.policyId !== current.desiredPolicyId || input.policyVersion !== current.desiredPolicyVersion)
    )
      throw new AppError(409,'STALE_APPLICATION_POLICY','Reported applied policy is not the current desired policy.');

    const result = await this.repository.recordEnforcement({
      managedDeviceId: device.id,
      reportedPolicyId: input.policyId,
      reportedPolicyVersion: input.policyVersion,
      status: input.status,
      failureCode: input.failureCode,
      reportedAt: new Date(),
    });
    if (!result) throw new AppError(409,'APPLICATION_POLICY_STATE_UNAVAILABLE','Application policy state is not initialized.');
    return result;
  }

  async requestInventory(adminId: string, deviceId: string) {
    const device = await this.requireOwnedDevice(adminId,deviceId);
    if (device.enrollmentStatus !== 'ACTIVE' || device.operationalStatus !== 'ACTIVE')
      throw new AppError(409,'DEVICE_NOT_READY','Managed device is not available for application inventory requests.');
    return this.commands.create(adminId,{
      deviceId, type: 'REQUEST_APPLICATION_INVENTORY', version: 1, payload: {},
      idempotencyKey: 'application-inventory:'+deviceId+':'+Math.floor(Date.now()/60000),
      correlationId: randomUUID(),
    });
  }

  private async enqueuePolicySync(adminId: string, deviceId: string, policyId: string, policyVersion: number) {
    try {
      return await this.commands.create(adminId,{
        deviceId,type:'SYNC_APPLICATION_POLICY',version:1,
        payload:{policyId,policyVersion},
        idempotencyKey:'application-policy:'+deviceId+':'+policyId+':'+policyVersion,
        correlationId: randomUUID(),
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'DEVICE_NOT_READY') throw error;
      return null;
    }
  }

  private validateRules(rules: {packageName:string;action:ApplicationAction}[]) {
    if (rules.length > this.options.maxRuleCount)
      throw new AppError(413,'APPLICATION_POLICY_TOO_LARGE','Application policy exceeds the configured rule-count limit.');
    const seen = new Set<string>();
    for (const rule of rules) {
      if (!isValidApplicationPackageName(rule.packageName))
        throw new AppError(400,'INVALID_APPLICATION_PACKAGE','Application package name is invalid.');
      if (seen.has(rule.packageName))
        throw new AppError(400,'DUPLICATE_APPLICATION_RULE','Application policy contains a duplicate package rule.');
      seen.add(rule.packageName);
      if (rule.action !== 'ALLOW' && rule.action !== 'BLOCK')
        throw new AppError(400,'INVALID_APPLICATION_ACTION','Application policy action is invalid.');
    }
  }

  private async requireOwnedDevice(adminId: string, deviceId: string) {
    if (!UUID.test(deviceId)) throw new AppError(400,'INVALID_DEVICE_ID','Managed-device identifier is invalid.');
    const device = await this.devices.findById(deviceId);
    if (!device) throw new AppError(404,'DEVICE_NOT_FOUND','Managed device was not found.');
    if (device.adminId !== adminId)
      throw new AppError(403,'AUTHORIZATION_DENIED','The administrator does not control this device.');
    return device;
  }
}
