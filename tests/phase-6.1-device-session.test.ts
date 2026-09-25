import { describe, expect, it } from 'vitest';
import { hashOpaqueToken } from '../src/auth/token.js';
import type {
  DeviceCredentialRecord,
  DeviceSessionRepository,
} from '../src/repositories/device-session-repository.js';
import type { DeviceSession } from '../src/domain/device-session.js';
import { DeviceSessionService } from '../src/services/device-session-service.js';

const credential = 'A'.repeat(43);

class FakeSessions implements DeviceSessionRepository {
  readonly name = 'fake-device-sessions';
  readonly credentialRecord: DeviceCredentialRecord = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    managedDeviceId: '550e8400-e29b-41d4-a716-446655440001',
    credentialHash: hashOpaqueToken(credential),
    createdAt: new Date(),
    expiresAt: null,
    revokedAt: null,
  };
  readonly sessions = new Map<string, DeviceSession>();

  async createCredential(input: {
    id: string; managedDeviceId: string; credentialHash: string; expiresAt: Date | null;
  }) { return { ...this.credentialRecord, ...input }; }
  async findCredentialByHash(hash: string) {
    return hash === this.credentialRecord.credentialHash ? this.credentialRecord : null;
  }
  async createSession(input: {
    id: string; managedDeviceId: string; credentialId: string; state: 'CONNECTED';
    createdAt: Date; lastActivityAt: Date; connectedAt: Date; expiresAt: Date;
  }) {
    const session: DeviceSession = { ...input, disconnectedAt: null };
    this.sessions.set(session.id, session);
    return session;
  }
  async findById(id: string) { return this.sessions.get(id) ?? null; }
  async disconnect(id: string, now: Date, state: 'DISCONNECTED' | 'STALE') {
    const current = this.sessions.get(id);
    if (current === undefined) return null;
    const next = { ...current, state, disconnectedAt: now, lastActivityAt: now };
    this.sessions.set(id, next);
    return next;
  }
}

describe('Phase 6.1 device sessions', () => {
  it('rejects malformed credentials', async () => {
    const service = new DeviceSessionService(new FakeSessions(), { ttlSeconds: 900 });
    await expect(service.connect('bad')).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('creates and disconnects a session using the same credential', async () => {
    const repository = new FakeSessions();
    const service = new DeviceSessionService(repository, { ttlSeconds: 900 });
    const session = await service.connect(credential);
    expect(session.state).toBe('CONNECTED');

    const disconnected = await service.disconnect(session.id, credential);
    expect(disconnected?.state).toBe('DISCONNECTED');
  });

  it('does not allow a different credential to disconnect a session', async () => {
    const repository = new FakeSessions();
    const service = new DeviceSessionService(repository, { ttlSeconds: 900 });
    const session = await service.connect(credential);
    await expect(service.disconnect(session.id, 'B'.repeat(43))).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });
});
