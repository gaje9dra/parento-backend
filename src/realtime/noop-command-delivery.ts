import type { Command } from '../domain/command.js';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';
import type { CommandDeliveryPort } from './command-delivery-port.js';

export class NoopCommandDelivery implements CommandDeliveryPort {
  readonly name = 'noop';
  async deliver(
    _command: Command,
    _session: DeviceConnectionSession,
  ): Promise<void> {
    // Transport is intentionally not implemented in Phase 6.1.
  }
}
