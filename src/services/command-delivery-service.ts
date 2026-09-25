import type { Command } from '../domain/command.js';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';
import type { CommandRepository } from '../repositories/command-repository.js';
import type { CommandDeliveryPort } from '../realtime/command-delivery-port.js';

export class CommandDeliveryService {
  constructor(
    private readonly commands: CommandRepository,
    private readonly transport: CommandDeliveryPort,
  ) {}

  async deliverPending(session: DeviceConnectionSession): Promise<void> {
    const pending = await this.commands.findPendingForDevice(
      session.managedDeviceId,
      50,
    );

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
