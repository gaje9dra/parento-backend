import type { Command } from '../domain/command.js';
import type { DeviceConnectionSession } from '../domain/device-connection-session.js';

export interface CommandDeliveryPort {
  readonly name: string;
  deliver(command: Command, session: DeviceConnectionSession): Promise<void>;
}
