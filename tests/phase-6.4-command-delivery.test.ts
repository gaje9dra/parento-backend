import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/domain/command.js';
import type { DeviceConnectionSession } from '../src/domain/device-connection-session.js';
import type { CommandRepository } from '../src/repositories/command-repository.js';
import type { DeviceConnectionSessionRepository } from '../src/repositories/device-connection-session-repository.js';
import { InMemoryDeviceConnectionRegistry } from '../src/realtime/device-connection-registry.js';
import type { CommandDeliveryPort } from '../src/realtime/command-delivery-port.js';
import { CommandDeliveryService } from '../src/services/command-delivery-service.js';

const deviceId = randomUUID();

const session: DeviceConnectionSession = {
  id: randomUUID(),
  managedDeviceId: deviceId,
  state: 'CONNECTED',
  createdAt: new Date(),
  connectedAt: new Date(),
  lastActivityAt: new Date(),
  lastSeenAt: new Date(),
  disconnectedAt: null,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
};

const command: Command = {
  id: randomUUID(),
  managedDeviceId: deviceId,
  adminId: randomUUID(),
  type: 'FUTURE_COMMAND',
  version: 1,
  status: 'QUEUED',
  payload: {},
  correlationId: 'correlation',
  idempotencyKey: 'retry-key',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
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

class FakeCommands implements CommandRepository {
  readonly name = 'fake-commands';
  item = { ...command };
  async create(): Promise<{ command: Command; created: boolean }> {
    return { command: this.item, created: true };
  }
  async findById(): Promise<Command | null> {
    return this.item;
  }
  async findOwned(): Promise<Command | null> {
    return this.item;
  }
  async cancelOwned(): Promise<Command> {
    return this.item;
  }
  async findPendingForDevice(): Promise<Command[]> {
    return this.item.status === 'QUEUED' ? [this.item] : [];
  }
  async transition(
    input: Parameters<CommandRepository['transition']>[0],
  ): Promise<Command> {
    this.item = {
      ...this.item,
      status: input.to,
      deliveryAt: input.to === 'DELIVERING' ? new Date() : this.item.deliveryAt,
    };
    return this.item;
  }
}

class FakeSessions implements DeviceConnectionSessionRepository {
  readonly name = 'fake-sessions';
  async create(): Promise<DeviceConnectionSession> {
    return session;
  }
  async findByTokenHash(): Promise<DeviceConnectionSession | null> {
    return session;
  }
  async findById(): Promise<DeviceConnectionSession | null> {
    return session;
  }
  async findActiveByDeviceId(): Promise<DeviceConnectionSession | null> {
    return session;
  }
  async touchConnected(): Promise<DeviceConnectionSession | null> {
    return session;
  }
  async disconnect(): Promise<DeviceConnectionSession | null> {
    return session;
  }
  async revokeForDevice(): Promise<void> {}
}

class FakeTransport implements CommandDeliveryPort {
  readonly name = 'fake';
  delivered: string[] = [];
  async deliver(c: Command): Promise<void> {
    this.delivered.push(c.id);
  }
}

describe('Phase 6.4 command delivery', () => {
  it('delivers a queued command only through an authenticated active connection', async () => {
    const commands = new FakeCommands();
    const sessions = new FakeSessions();
    const registry = new InMemoryDeviceConnectionRegistry();
    const transport = new FakeTransport();
    registry.register({
      session,
      connectedAt: new Date(),
      send: () => true,
      close: () => undefined,
    });

    const delivery = new CommandDeliveryService(
      commands,
      transport,
      sessions,
      registry,
    );
    await delivery.deliverQueuedForDevice(deviceId);

    expect(transport.delivered).toEqual([command.id]);
    expect(commands.item.status).toBe('DELIVERED');
  });

  it('keeps commands queued when no realtime connection exists', async () => {
    const commands = new FakeCommands();
    const sessions = new FakeSessions();
    const registry = new InMemoryDeviceConnectionRegistry();
    const transport = new FakeTransport();
    const delivery = new CommandDeliveryService(
      commands,
      transport,
      sessions,
      registry,
    );

    await delivery.deliverQueuedForDevice(deviceId);

    expect(transport.delivered).toHaveLength(0);
    expect(commands.item.status).toBe('QUEUED');
  });
});
