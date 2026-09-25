import { describe, expect, it } from 'vitest';
import {
  isTerminalCommandStatus,
  isValidCommandTransition,
} from '../src/domain/command.js';
import { CommandService, type CommandDeliveryPort } from '../src/services/command-service.js';
import type { DeviceCommand } from '../src/domain/command.js';
import type { CommandRepository, CommandPage } from '../src/repositories/command-repository.js';
import type { ManagedDevice, ManagedDeviceRepository, DevicePage } from '../src/repositories/managed-device-repository.js';

const adminId = '550e8400-e29b-41d4-a716-446655440000';
const deviceId = '550e8400-e29b-41d4-a716-446655440001';

class FakeCommands implements CommandRepository {
  readonly name = 'fake-commands';
  readonly items = new Map<string, DeviceCommand>();

  async create(input: {
    id: string; managedDeviceId: string; adminId: string; type: 'FUTURE_COMMAND';
    schemaVersion: number; payload: Record<string, unknown>; expiresAt: Date;
    correlationId: string; idempotencyKey: string;
  }) {
    const now = new Date();
    const command: DeviceCommand = {
      ...input,
      status: 'CREATED',
      createdAt: now,
      deliveredAt: null,
      acknowledgedAt: null,
      startedAt: null,
      completedAt: null,
      failureCode: null,
      sessionId: null,
    };
    this.items.set(command.id, command);
    return command;
  }

  findById = async (id: string) => this.items.get(id) ?? null;
  findByIdempotency = async (admin: string, key: string) =>
    [...this.items.values()].find((item) => item.adminId === admin && item.idempotencyKey === key) ?? null;
  listByAdminId = async (admin: string): Promise<CommandPage> => ({
    items: [...this.items.values()].filter((item) => item.adminId === admin),
    nextCursor: null,
  });
  transition = async (id: string, from: DeviceCommand['status'], to: DeviceCommand['status'], now: Date, metadata = {}) => {
    const current = this.items.get(id);
    if (current === undefined) return null;
    if (current.status !== from || !isValidCommandTransition(from, to)) throw new Error('invalid transition');
    const next: DeviceCommand = {
      ...current,
      status: to,
      deliveredAt: to === 'DELIVERED' ? now : current.deliveredAt,
      acknowledgedAt: to === 'ACKNOWLEDGED' ? now : current.acknowledgedAt,
      startedAt: to === 'RUNNING' ? now : current.startedAt,
      completedAt: ['SUCCEEDED','FAILED','EXPIRED','CANCELLED','REJECTED'].includes(to) ? now : current.completedAt,
      failureCode: metadata.failureCode ?? current.failureCode,
      sessionId: metadata.sessionId ?? current.sessionId,
    };
    this.items.set(id, next);
    return next;
  };
}

class FakeDevices implements ManagedDeviceRepository {
  readonly name = 'fake-devices';
  constructor(readonly device: ManagedDevice) {}
  create = async () => this.device;
  findById = async (id: string) => id === this.device.id ? this.device : null;
  findByStableIdentifier = async () => null;
  list = async (): Promise<DevicePage> => ({ items: [this.device], nextCursor: null });
  listByAdminId = async (): Promise<DevicePage> => ({ items: [this.device], nextCursor: null });
  updateStatus = async () => this.device;
}

const activeDevice = (owner = adminId): ManagedDevice => ({
  id: deviceId,
  adminId: owner,
  stableIdentifier: 'managed-installation-test',
  name: 'Test device',
  platform: 'android',
  enrollmentStatus: 'ACTIVE',
  operationalStatus: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSeenAt: null,
});

describe('Phase 6.1 command foundation', () => {
  it('allows only the neutral command lifecycle and keeps terminal states terminal', () => {
    expect(isValidCommandTransition('CREATED', 'QUEUED')).toBe(true);
    expect(isValidCommandTransition('QUEUED', 'DELIVERING')).toBe(true);
    expect(isValidCommandTransition('SUCCEEDED', 'RUNNING')).toBe(false);
    expect(isTerminalCommandStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalCommandStatus('CANCELLED')).toBe(true);
  });

  it('enforces admin ownership before command creation', async () => {
    const repository = new FakeCommands();
    const service = new CommandService(
      repository,
      new FakeDevices(activeDevice('550e8400-e29b-41d4-a716-446655440002')),
      { defaultTtlSeconds: 300, maxTtlSeconds: 3600 },
    );

    await expect(service.create({
      adminId,
      managedDeviceId: deviceId,
      type: 'FUTURE_COMMAND',
      schemaVersion: 1,
      payload: {},
      idempotencyKey: 'ownership-test',
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });

  it('returns the existing command for an idempotent retry', async () => {
    const repository = new FakeCommands();
    const delivery: CommandDeliveryPort = { deliver: async () => ({ delivered: false }) };
    const service = new CommandService(
      repository,
      new FakeDevices(activeDevice()),
      { defaultTtlSeconds: 300, maxTtlSeconds: 3600 },
      delivery,
    );
    const input = {
      adminId,
      managedDeviceId: deviceId,
      type: 'FUTURE_COMMAND',
      schemaVersion: 1,
      payload: { version: 1 },
      idempotencyKey: 'retry-key-1',
    } as const;

    const first = await service.create(input);
    const second = await service.create(input);
    expect(second.id).toBe(first.id);
    expect(repository.items).toHaveLength?.(1);
  });
});
