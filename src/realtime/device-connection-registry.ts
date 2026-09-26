import type { DeviceConnectionSession } from '../domain/device-connection-session.js';

export interface ActiveDeviceConnection {
  readonly session: DeviceConnectionSession;
  readonly connectedAt: Date;
  readonly send: (event: string, data: unknown) => boolean;
  readonly close: () => void;
}

export interface DeviceConnectionRegistry {
  register(connection: ActiveDeviceConnection): void;
  unregister(sessionId: string): void;
  findByDeviceId(managedDeviceId: string): ActiveDeviceConnection | null;
  isConnected(managedDeviceId: string): boolean;
}

export class InMemoryDeviceConnectionRegistry implements DeviceConnectionRegistry {
  private readonly connections = new Map<string, ActiveDeviceConnection>();

  register(connection: ActiveDeviceConnection): void {
    const existing = this.connections.get(connection.session.managedDeviceId);
    if (
      existing !== undefined &&
      existing.session.id !== connection.session.id
    ) {
      existing.close();
    }
    this.connections.set(connection.session.managedDeviceId, connection);
  }

  unregister(sessionId: string): void {
    for (const [deviceId, connection] of this.connections) {
      if (connection.session.id === sessionId) {
        this.connections.delete(deviceId);
        return;
      }
    }
  }

  findByDeviceId(managedDeviceId: string): ActiveDeviceConnection | null {
    return this.connections.get(managedDeviceId) ?? null;
  }

  isConnected(managedDeviceId: string): boolean {
    return this.connections.has(managedDeviceId);
  }
}
