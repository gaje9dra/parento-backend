import type { DeviceSession, DeviceConnectionState } from '../domain/device-session.js';
import type {
  DeviceCredentialRecord,
  DeviceSessionRepository,
} from './device-session-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import { mapPostgresPersistenceError } from '../db/errors.js';

interface CredentialRow {
  id: string;
  managed_device_id: string;
  credential_hash: string;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
}

interface SessionRow {
  id: string;
  managed_device_id: string;
  credential_id: string;
  state: DeviceConnectionState;
  created_at: Date;
  last_activity_at: Date;
  connected_at: Date | null;
  disconnected_at: Date | null;
  expires_at: Date;
}

const credentialColumns =
  'id, managed_device_id, credential_hash, created_at, expires_at, revoked_at';
const sessionColumns =
  'id, managed_device_id, credential_id, state, created_at, last_activity_at, connected_at, disconnected_at, expires_at';

const toCredential = (row: CredentialRow): DeviceCredentialRecord => ({
  id: row.id,
  managedDeviceId: row.managed_device_id,
  credentialHash: row.credential_hash,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
});

const toSession = (row: SessionRow): DeviceSession => ({
  id: row.id,
  managedDeviceId: row.managed_device_id,
  credentialId: row.credential_id,
  state: row.state,
  createdAt: row.created_at,
  lastActivityAt: row.last_activity_at,
  connectedAt: row.connected_at,
  disconnectedAt: row.disconnected_at,
  expiresAt: row.expires_at,
});

export class PostgresDeviceSessionRepository
  extends PostgresRepository
  implements DeviceSessionRepository
{
  readonly name = 'device-session';

  async createCredential(input: {
    id: string;
    managedDeviceId: string;
    credentialHash: string;
    expiresAt: Date | null;
  }): Promise<DeviceCredentialRecord> {
    try {
      const result = await this.query<CredentialRow>(
        'INSERT INTO device_credentials (id, managed_device_id, credential_hash, expires_at) VALUES ($1, $2, $3, $4) RETURNING ' +
          credentialColumns,
        [input.id, input.managedDeviceId, input.credentialHash, input.expiresAt],
      );
      return toCredential(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to create device credential.');
    }
  }

  async findCredentialByHash(hash: string): Promise<DeviceCredentialRecord | null> {
    const result = await this.query<CredentialRow>(
      'SELECT ' + credentialColumns + ' FROM device_credentials WHERE credential_hash = $1',
      [hash],
    );
    return result.rows[0] === undefined ? null : toCredential(result.rows[0]);
  }

  async createSession(input: {
    id: string;
    managedDeviceId: string;
    credentialId: string;
    state: 'CONNECTED';
    createdAt: Date;
    lastActivityAt: Date;
    connectedAt: Date;
    expiresAt: Date;
  }): Promise<DeviceSession> {
    try {
      return await this.transaction(async (client) => {
        const device = await client.query<{
          admin_id: string;
          enrollment_status: 'PENDING' | 'ACTIVE' | 'REVOKED';
        }>(
          'SELECT admin_id, enrollment_status FROM managed_devices WHERE id = $1 FOR UPDATE',
          [input.managedDeviceId],
        );
        if (device.rows[0]?.enrollment_status !== 'ACTIVE') {
          throw new Error('Managed device is not active.');
        }

        const result = await client.query<SessionRow>(
          'INSERT INTO device_sessions (id, managed_device_id, credential_id, state, created_at, last_activity_at, connected_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $6, $7) RETURNING ' +
            sessionColumns,
          [
            input.id,
            input.managedDeviceId,
            input.credentialId,
            input.state,
            input.createdAt,
            input.lastActivityAt,
            input.expiresAt,
          ],
        );
        return toSession(result.rows[0]!);
      });
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to create device session.');
    }
  }

  async findById(id: string): Promise<DeviceSession | null> {
    const result = await this.query<SessionRow>(
      'SELECT ' + sessionColumns + ' FROM device_sessions WHERE id = $1',
      [id],
    );
    return result.rows[0] === undefined ? null : toSession(result.rows[0]);
  }

  async disconnect(
    id: string,
    now: Date,
    state: 'DISCONNECTED' | 'STALE',
  ): Promise<DeviceSession | null> {
    try {
      const result = await this.query<SessionRow>(
        'UPDATE device_sessions SET state = $2, disconnected_at = $3, last_activity_at = $3 WHERE id = $1 AND state IN (\'CONNECTED\', \'CONNECTING\') RETURNING ' +
          sessionColumns,
        [id, state, now],
      );
      return result.rows[0] === undefined ? null : toSession(result.rows[0]);
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to disconnect device session.');
    }
  }
}
