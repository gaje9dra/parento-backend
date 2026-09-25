import type {
  DeviceConnectionSession,
  DeviceConnectionState,
} from '../domain/device-connection-session.js';
import { mapPostgresPersistenceError } from '../db/errors.js';
import { isValidDeviceConnectionTransition } from '../domain/device-connection-session.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { DeviceConnectionSessionRepository } from './device-connection-session-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface Row {
  id: string;
  managed_device_id: string;
  state: DeviceConnectionState;
  created_at: Date;
  connected_at: Date | null;
  last_activity_at: Date;
  disconnected_at: Date | null;
  expires_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
}
const columns =
  'id, managed_device_id, state, created_at, connected_at, last_activity_at, disconnected_at, expires_at, last_seen_at, revoked_at';
const map = (r: Row): DeviceConnectionSession => ({
  id: r.id,
  managedDeviceId: r.managed_device_id,
  state: r.state,
  createdAt: r.created_at,
  connectedAt: r.connected_at,
  lastActivityAt: r.last_activity_at,
  disconnectedAt: r.disconnected_at,
  expiresAt: r.expires_at,
  lastSeenAt: r.last_seen_at,
  revokedAt: r.revoked_at,
});

export class PostgresDeviceConnectionSessionRepository
  extends PostgresRepository
  implements DeviceConnectionSessionRepository
{
  readonly name = 'device-connection-session';

  async create(input: {
    id: string;
    managedDeviceId: string;
    sessionTokenHash: string;
    expiresAt: Date;
  }): Promise<DeviceConnectionSession> {
    try {
      return await this.transaction(async (client) => {
        await client.query(
          "SELECT id FROM device_connection_sessions WHERE managed_device_id=$1 AND state IN ('CONNECTING','CONNECTED','STALE') FOR UPDATE",
          [input.managedDeviceId],
        );
        await client.query(
          "UPDATE device_connection_sessions SET state='EXPIRED', disconnected_at=NOW(), last_activity_at=NOW(), last_seen_at=NOW(), revoked_at=NULL WHERE managed_device_id=$1 AND state IN ('CONNECTING','CONNECTED','STALE')",
          [input.managedDeviceId],
        );
        const result = await client.query<Row>(
          'INSERT INTO device_connection_sessions (id, managed_device_id, session_token_hash, expires_at, last_seen_at) VALUES ($1,$2,$3,$4,$5) RETURNING ' +
            columns,
          [
            input.id,
            input.managedDeviceId,
            input.sessionTokenHash,
            input.expiresAt,
            new Date(),
          ],
        );
        return map(result.rows[0]!);
      });
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to create device connection session.',
      );
    }
  }

  async findActiveByDeviceId(managedDeviceId: string): Promise<DeviceConnectionSession | null> {
    const result = await this.query<Row>(
      "SELECT " + columns + " FROM device_connection_sessions WHERE managed_device_id=$1 AND state IN ('CONNECTING','CONNECTED','STALE') ORDER BY last_seen_at DESC LIMIT 1",
      [managedDeviceId],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<DeviceConnectionSession | null> {
    const result = await this.query<Row>(
      'SELECT ' +
        columns +
        ' FROM device_connection_sessions WHERE session_token_hash = $1',
      [tokenHash],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async touchConnected(
    id: string,
    now: Date,
    expiresAt: Date,
  ): Promise<DeviceConnectionSession | null> {
    const current = await this.findById(id);
    if (current === null) return null;
    if (!isValidDeviceConnectionTransition(current.state, 'CONNECTED')) {
      throw new PersistenceError(
        'INVALID_STATE',
        'The device session cannot become connected.',
      );
    }
    const result = await this.query<Row>(
      "UPDATE device_connection_sessions SET state='CONNECTED', connected_at=COALESCE(connected_at,$2), last_activity_at=$2, last_seen_at=$2, expires_at=$3, disconnected_at=NULL, revoked_at=NULL WHERE id=$1 RETURNING " +
        columns,
      [id, now, expiresAt],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async disconnect(
    id: string,
    now: Date,
    state: DeviceConnectionState = 'DISCONNECTED',
  ): Promise<DeviceConnectionSession | null> {
    const current = await this.findById(id);
    if (current === null) return null;
    if (!isValidDeviceConnectionTransition(current.state, state)) {
      throw new PersistenceError(
        'INVALID_STATE',
        'The device session transition is invalid.',
      );
    }
    const result = await this.query<Row>(
      'UPDATE device_connection_sessions SET state=$2, disconnected_at=$3, last_activity_at=$3, last_seen_at=$3 WHERE id=$1 RETURNING ' +
        columns,
      [id, state, now],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async revokeForDevice(managedDeviceId: string, now: Date): Promise<void> {
    await this.query(
      "UPDATE device_connection_sessions SET state='EXPIRED', disconnected_at=$2, last_activity_at=$2, last_seen_at=$2, revoked_at=$2 WHERE managed_device_id=$1 AND state IN ('CONNECTING','CONNECTED','STALE')",
      [managedDeviceId, now],
    );
  }

  private async findById(id: string): Promise<DeviceConnectionSession | null> {
    const result = await this.query<Row>(
      'SELECT ' + columns + ' FROM device_connection_sessions WHERE id=$1',
      [id],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }
}
