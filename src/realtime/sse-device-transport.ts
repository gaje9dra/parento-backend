import type { Response } from 'express';
import type { Command } from '../domain/command.js';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';
import type { CommandDeliveryPort } from './command-delivery-port.js';
import type { DeviceConnectionRegistry } from './device-connection-registry.js';

export class SseDeviceTransport implements CommandDeliveryPort {
  readonly name = 'sse';

  constructor(private readonly registry: DeviceConnectionRegistry) {}

  open(
    response: Response,
    session: DeviceConnectionSession,
    onClosed: () => void,
  ): void {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write(': connected\n\n');

    const send = (event: string, data: unknown): boolean => {
      if (response.writableEnded || response.destroyed) return false;
      try {
        response.write('event: ' + event + '\n');
        response.write('data: ' + JSON.stringify(data) + '\n\n');
        return true;
      } catch {
        return false;
      }
    };

    const keepAlive = setInterval(() => {
      if (response.writableEnded || response.destroyed) return;
      try {
        response.write(': keepalive\n\n');
      } catch {
        // close/error handlers perform cleanup
      }
    }, 15_000);

    const close = () => {
      clearInterval(keepAlive);
      if (!response.writableEnded) response.end();
    };

    this.registry.register({
      session,
      connectedAt: new Date(),
      send,
      close,
    });

    const cleanup = () => {
      clearInterval(keepAlive);
      this.registry.unregister(session.id);
      onClosed();
    };
    response.on('close', cleanup);
    response.on('error', cleanup);
  }

  async deliver(
    command: Command,
    session: DeviceConnectionSession,
  ): Promise<void> {
    const connection = this.registry.findByDeviceId(session.managedDeviceId);
    if (connection === null || connection.session.id !== session.id) {
      throw new Error('Device is not connected to the realtime transport.');
    }

    const sent = connection.send('command', {
      commandId: command.id,
      managedDeviceId: command.managedDeviceId,
      type: command.type,
      version: command.version,
      payload: command.payload,
      correlationId: command.correlationId,
      idempotencyKey: command.idempotencyKey,
      createdAt: command.createdAt.toISOString(),
      expiresAt: command.expiresAt.toISOString(),
    });
    if (!sent) throw new Error('Device realtime connection is unavailable.');
  }
}
