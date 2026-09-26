import type {
  ScreenSharingSession,
  ScreenSharingSessionStatus,
  ScreenSharingTerminationReason,
} from '../domain/screen-sharing-session.js';
import { isValidScreenSharingTransition } from '../domain/screen-sharing-session.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import { mapPostgresPersistenceError } from '../db/errors.js';
import type { ScreenSharingSessionRepository } from './screen-sharing-session-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import { randomUUID } from 'node:crypto';

interface Row {
  id: string;
  managed_device_id: string;
  admin_id: string;
  status: ScreenSharingSessionStatus;
  created_at: Date;
  authorized_at: Date | null;
  started_at: Date | null;
  stopped_at: Date | null;
  expires_at: Date;
  last_activity_at: Date;
  termination_reason: ScreenSharingTerminationReason | null;
  correlation_id: string;
  transport_state: Record<string, unknown> | null;
}

const columns =
  'id,managed_device_id,admin_id,status,created_at,authorized_at,started_at,stopped_at,expires_at,last_activity_at,termination_reason,correlation_id,transport_state';

const map = (row: Row): ScreenSharingSession => ({
  id: row.id,
  managedDeviceId: row.managed_device_id,
  adminId: row.admin_id,
  status: row.status,
  createdAt: row.created_at,
  authorizedAt: row.authorized_at,
  startedAt: row.started_at,
  stoppedAt: row.stopped_at,
  expiresAt: row.expires_at,
  lastActivityAt: row.last_activity_at,
  terminationReason: row.termination_reason,
  correlationId: row.correlation_id,
  transportState: row.transport_state,
});

export class PostgresScreenSharingSessionRepository
  extends PostgresRepository
  implements ScreenSharingSessionRepository
{
  readonly name = 'screen-sharing-session';

  async create(input: {
    id: string;
    managedDeviceId: string;
    adminId: string;
    correlationId: string;
    expiresAt: Date;
    transportState: Record<string, unknown> | null;
  }): Promise<{ session: ScreenSharingSession; created: boolean }> {
    try {
      return await this.transaction(async (client) => {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [input.managedDeviceId],
        );
        const active = await client.query<Row>(
          'SELECT ' +
            columns +
            " FROM screen_sharing_sessions WHERE managed_device_id=$1 AND status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING') FOR UPDATE",
          [input.managedDeviceId],
        );
        if (active.rows[0] !== undefined) {
          return { session: map(active.rows[0]), created: false };
        }

        const result = await client.query<Row>(
          'INSERT INTO screen_sharing_sessions (id,managed_device_id,admin_id,correlation_id,expires_at,transport_state) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ' +
            columns,
          [
            input.id,
            input.managedDeviceId,
            input.adminId,
            input.correlationId,
            input.expiresAt,
            input.transportState === null
              ? null
              : JSON.stringify(input.transportState),
          ],
        );
        const session = map(result.rows[0]!);
        await insertEvent(
          client,
          session.id,
          null,
          'REQUESTED',
          new Date(),
          null,
        );
        return { session, created: true };
      });
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to create screen-sharing session.',
      );
    }
  }

  async findById(id: string): Promise<ScreenSharingSession | null> {
    const result = await this.query<Row>(
      'SELECT ' + columns + ' FROM screen_sharing_sessions WHERE id=$1',
      [id],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async findOwned(
    id: string,
    adminId: string,
  ): Promise<ScreenSharingSession | null> {
    const result = await this.query<Row>(
      'SELECT ' +
        columns +
        ' FROM screen_sharing_sessions WHERE id=$1 AND admin_id=$2',
      [id, adminId],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async findActiveByDeviceId(
    managedDeviceId: string,
  ): Promise<ScreenSharingSession | null> {
    const result = await this.query<Row>(
      'SELECT ' +
        columns +
        " FROM screen_sharing_sessions WHERE managed_device_id=$1 AND status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING') ORDER BY created_at DESC LIMIT 1",
      [managedDeviceId],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async transition(input: {
    id: string;
    from: ScreenSharingSessionStatus;
    to: ScreenSharingSessionStatus;
    now: Date;
    terminationReason?: ScreenSharingTerminationReason | null;
    transportState?: Record<string, unknown> | null;
  }): Promise<ScreenSharingSession> {
    if (!isValidScreenSharingTransition(input.from, input.to)) {
      throw new PersistenceError(
        'INVALID_STATE',
        'The screen-sharing session state transition is invalid.',
      );
    }

    return this.transaction(async (client) => {
      const currentResult = await client.query<Row>(
        'SELECT ' +
          columns +
          ' FROM screen_sharing_sessions WHERE id=$1 FOR UPDATE',
        [input.id],
      );
      const current = currentResult.rows[0];
      if (!current)
        throw new PersistenceError('NOT_FOUND', 'Screen session not found.');
      if (current.status !== input.from) {
        throw new PersistenceError(
          'INVALID_STATE',
          'The screen session state has changed.',
        );
      }

      const terminal = ['STOPPED', 'EXPIRED', 'FAILED', 'REJECTED'].includes(
        input.to,
      );
      const set = ['status=$2', 'last_activity_at=$3'];
      const values: unknown[] = [input.id, input.to, input.now];
      const add = (sql: string, value: unknown) => {
        set.push(sql.replace('$X', '$' + (values.length + 1)));
        values.push(value);
      };

      if (input.to === 'AUTHORIZED') add('authorized_at=$X', input.now);
      if (input.to === 'STARTING' && current.started_at === null)
        add('started_at=$X', input.now);
      if (input.to === 'ACTIVE')
        add('started_at=COALESCE(started_at,$X)', input.now);
      if (terminal) add('stopped_at=COALESCE(stopped_at,$X)', input.now);
      if (input.terminationReason !== undefined)
        add('termination_reason=$X', input.terminationReason);
      if (input.transportState !== undefined) {
        add(
          'transport_state=$X',
          input.transportState === null
            ? null
            : JSON.stringify(input.transportState),
        );
      }

      const result = await client.query<Row>(
        'UPDATE screen_sharing_sessions SET ' +
          set.join(',') +
          ' WHERE id=$1 RETURNING ' +
          columns,
        values,
      );
      const session = map(result.rows[0]!);
      return session;
    });
  }

  async expireForAdmin(adminId: string, now: Date): Promise<number> {
    const result = await this.query(
      "UPDATE screen_sharing_sessions SET status='EXPIRED', stopped_at=COALESCE(stopped_at,$2), last_activity_at=$2, termination_reason='ADMIN_DISABLED', transport_state='{\"state\":\"EXPIRED\",\"reason\":\"ADMIN_LOGOUT\"}'::jsonb WHERE admin_id=$1 AND status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING')",
      [adminId, now],
    );
    return result.rowCount ?? 0;
  }

  async deleteTerminatedBefore(cutoff: Date, limit: number): Promise<number> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);
    const result = await this.query<{ id: string }>(
      'DELETE FROM screen_sharing_sessions WHERE id IN (SELECT id FROM screen_sharing_sessions WHERE stopped_at IS NOT NULL AND stopped_at < $1 ORDER BY stopped_at ASC LIMIT $2) RETURNING id',
      [cutoff, boundedLimit],
    );
    return result.rowCount ?? 0;
  }

  async expireDue(now: Date, limit: number): Promise<number> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);
    return this.transaction(async (client) => {
      const rows = await client.query<{
        id: string;
        status: ScreenSharingSessionStatus;
      }>(
        "SELECT id,status FROM screen_sharing_sessions WHERE expires_at <= $1 AND status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING') ORDER BY expires_at ASC LIMIT $2 FOR UPDATE SKIP LOCKED",
        [now, boundedLimit],
      );
      for (const row of rows.rows) {
        await client.query(
          "UPDATE screen_sharing_sessions SET status='EXPIRED', stopped_at=$2, last_activity_at=$2, termination_reason='EXPIRED' WHERE id=$1",
          [row.id, now],
        );
      }
      return rows.rowCount ?? 0;
    });
  }
}

