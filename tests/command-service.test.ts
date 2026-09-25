import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CommandService } from '../src/services/command-service.js';
import type { ManagedDevice } from '../src/domain/managed-device.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import type { Command } from '../src/domain/command.js';
import type { CommandRepository } from '../src/repositories/command-repository.js';

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
    throw new Error('unused');
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
    const service = new CommandService(
      new FakeCommands(),
      devices,
      new FakeSessions(),
      { ttlSeconds: 300, maxPayloadBytes: 4096 },
    );
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
