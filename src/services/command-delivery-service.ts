import type { Command } from '../domain/command.js';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';
import type { CommandRepository } from '../repositories/command-repository.js';
import type { CommandDeliveryPort } from '../realtime/command-delivery-port.js';
import type { DeviceConnectionSessionRepository } from '../repositories/device-connection-session-repository.js';
import type { DeviceConnectionRegistry } from '../realtime/device-connection-registry.js';

export class CommandDeliveryService {
  constructor(
    private readonly commands: CommandRepository,
    private readonly transport: CommandDeliveryPort,
    private readonly sessions: DeviceConnectionSessionRepository,
    private readonly registry: DeviceConnectionRegistry,
  ) {}

  async deliverQueuedForDevice(managedDeviceId: string): Promise<void> {
    const session =
      this.registry.findByDeviceId(managedDeviceId)?.session ??
      (await this.sessions.findActiveByDeviceId?.(managedDeviceId));
    if (
      session === null ||
      session === undefined ||
      session.state !== 'CONNECTED'
    )
      return;
    await this.deliverPending(session);
  }

  async deliverPending(session: DeviceConnectionSession): Promise<void> {
    const pending = await this.commands.findPendingForDevice?.(
      session.managedDeviceId,
      50,
    );
    if (pending === undefined) return;

    for (const command of pending) {
      if (command.expiresAt.getTime() <= Date.now()) {
        await this.safeExpire(command);
        continue;
      }

      try {
        const delivering = await this.commands.transition({
          id: command.id,
          from: command.status,
          to: 'DELIVERING',
          actorType: 'SYSTEM',
          actorId: null,
          now: new Date(),
          correlationId: command.correlationId,
        });

        if (delivering.expiresAt.getTime() <= Date.now()) {
          await this.safeExpire(delivering);
          continue;
        }

        await this.transport.deliver(delivering, session);

        await this.commands.transition({
          id: delivering.id,
          from: 'DELIVERING',
          to: 'DELIVERED',
          actorType: 'SYSTEM',
          actorId: null,
          now: new Date(),
          correlationId: delivering.correlationId,
        });
      } catch {
        try {
          const current = await this.commands.findById(command.id);
          if (current?.status === 'DELIVERING') {
            await this.commands.transition({
              id: command.id,
              from: 'DELIVERING',
              to: 'QUEUED',
              actorType: 'SYSTEM',
              actorId: null,
              now: new Date(),
              correlationId: command.correlationId,
            });
          }
        } catch {
          // Database state remains authoritative if recovery itself fails.
        }
      }
    }
  }

  private async safeExpire(command: Command): Promise<void> {
    try {
      await this.commands.transition({
        id: command.id,
        from: command.status,
        to: 'EXPIRED',
        actorType: 'SYSTEM',
        actorId: null,
        now: new Date(),
        correlationId: command.correlationId,
      });
    } catch {
      // A concurrent request may already have advanced the command.
    }
  }
}
