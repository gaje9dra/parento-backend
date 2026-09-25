import { randomUUID } from 'node:crypto';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/token.js';
import { AppError } from '../types/errors.js';
import type { DeviceSessionRepository } from '../repositories/device-session-repository.js';

const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface DeviceSessionServiceOptions {
  readonly ttlSeconds: number;
}

export class DeviceSessionService {
  constructor(
    private readonly repository: DeviceSessionRepository,
    private readonly options: DeviceSessionServiceOptions,
  ) {}

  async connect(credential: string, now = new Date()) {
    if (!DEVICE_TOKEN_PATTERN.test(credential)) {
      throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Device authentication is required.');
    }
    const record = await this.repository.findCredentialByHash(hashOpaqueToken(credential));
    if (
      record === null ||
      record.revokedAt !== null ||
      (record.expiresAt !== null && record.expiresAt.getTime() <= now.getTime())
    ) {
      throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Device authentication is required.');
    }

    try {
      return await this.repository.createSession({
        id: randomUUID(),
        managedDeviceId: record.managedDeviceId,
        credentialId: record.id,
        state: 'CONNECTED',
        createdAt: now,
        lastActivityAt: now,
        connectedAt: now,
        expiresAt: new Date(now.getTime() + this.options.ttlSeconds * 1000),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Managed device is not active.') {
        throw new AppError(403, 'AUTHORIZATION_DENIED', 'Managed device is not active.');
      }
      throw error;
    }
  }

  disconnect(id: string, now = new Date()) {
    return this.repository.disconnect(id, now, 'DISCONNECTED');
  }

  static issueCredential(): string {
    return generateOpaqueToken();
  }
}
