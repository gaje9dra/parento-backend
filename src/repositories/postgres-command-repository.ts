import type { CommandStatus, DeviceCommand } from '../domain/command.js';
import { isValidCommandTransition } from '../domain/command.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { CommandPage, CommandPageRequest, CommandRepository } from './command-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import { mapPostgresPersistenceError } from '../db/errors.js';

interface CommandRow {
  id: string;
  managed_device_id: string;
  admin_id: string;
  command_type: DeviceCommand['type'];
  schema_version: number;
  payload: Record<string, unknown>;
  status: CommandStatus;
  created_at: Date;
  expires_at: Date;
  delivered_at: Date | null;
  acknowledged_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  failure_code: string | null;
  correlation_id: string;
  idempotency_key: string;
  session_id: string | null;
}

const columns =
  'id, managed_device_id, admin_id, command_type, schema_version, payload, status, created_at, expires_at, delivered_at, acknowledged_at, started_at, completed_at, failure_code, correlation_id, idempotency_key, session_id';

const toCommand = (row: CommandRow): DeviceCommand => ({
  id: row.id,
  managedDeviceId: row.managed_device_id,
  adminId: row.admin_id,
  type: row.command_type,
  schemaVersion: row.schema_version,
  payload: row.payload,
  status: row.status,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  deliveredAt: row.delivered_at,
  acknowledgedAt: row.acknowledged_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  failureCode: row.failure_code,
  correlationId: row.correlation_id,
  idempotencyKey: row.idempotency_key,
  sessionId: row.session_id,
});

export class PostgresCommandRepository extends PostgresRepository implements CommandRepository {
  readonly name = 'command';

  async create(input: {
    id: string;
    managedDeviceId: string;
    adminId: string;
    type: DeviceCommand['type'];
    schemaVersion: number;
    payload: Record<string, unknown>;
    expiresAt: Date;
    correlationId: string;
    idempotencyKey: string;
  }): Promise<DeviceCommand> {
    try {
      const result = await this.query<CommandRow>(
        'INSERT INTO device_commands (id, managed_device_id, admin_id, command_type, schema_version, payload, expires_at, correlation_id, idempotency_key) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9) RETURNING ' +
          columns,
        [
          input.id,
          input.managedDeviceId,
          input.adminId,
          input.type,
          input.schemaVersion,
          JSON.stringify(input.payload),
          input.expiresAt,
          input.correlationId,
          input.idempotencyKey,
        ],
      );
      return toCommand(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to create command.');
    }
  }

  async findById(id: string): Promise<DeviceCommand | null> {
    const result = await this.query<CommandRow>(
      'SELECT ' + columns + ' FROM device_commands WHERE id = $1',
      [id],
    );
    return result.rows[0] === undefined ? null : toCommand(result.rows[0]);
  }

  async findByIdempotency(adminId: string, idempotencyKey: string): Promise<DeviceCommand | null> {
    const result = await this.query<CommandRow>(
      'SELECT ' + columns + ' FROM device_commands WHERE admin_id = $1 AND idempotency_key = $2',
      [adminId, idempotencyKey],
    );
    return result.rows[0] === undefined ? null : toCommand(result.rows[0]);
  }

  async listByAdminId(adminId: string, page: CommandPageRequest = {}): Promise<CommandPage> {
    const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
    const result = await this.query<CommandRow>(
      'SELECT ' + columns + ' FROM device_commands WHERE admin_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
      [adminId, limit + 1],
    );
    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    return { items: rows.map(toCommand), nextCursor: hasMore ? rows[rows.length - 1]!.id : null };
  }

  async transition(
    id: string,
    from: CommandStatus,
    to: CommandStatus,
    now: Date,
    metadata: { sessionId?: string | null; failureCode?: string | null } = {},
  ): Promise<DeviceCommand | null> {
    if (!isValidCommandTransition(from, to)) {
      throw new PersistenceError('INVALID_STATE', 'The command state transition is invalid.');
    }
    try {
      return await this.transaction(async (client) => {
        const currentResult = await client.query<CommandRow>(
          'SELECT ' + columns + ' FROM device_commands WHERE id = $1 FOR UPDATE',
          [id],
        );
        const current = currentResult.rows[0];
        if (current === undefined) return null;
        if (current.status !== from) {
          throw new PersistenceError('INVALID_STATE', 'The command state transition is stale.');
        }
        if (current.status !== to && current.expires_at.getTime() <= now.getTime() && !['EXPIRED','CANCELLED','REJECTED','SUCCEEDED','FAILED'].includes(current.status)) {
          const expired = await client.query<CommandRow>(
            "UPDATE device_commands SET status = 'EXPIRED', completed_at = $2, updated_at = $2 WHERE id = $1 RETURNING " + columns,
            [id, now],
          );
          if (expired.rows[0] === undefined) return null;
          if (to !== 'EXPIRED') {
            throw new PersistenceError('INVALID_STATE', 'Command has expired.');
          }
        }
        const result = await client.query<CommandRow>(
          "UPDATE device_commands SET status = $2, delivered_at = CASE WHEN $2 = 'DELIVERED' THEN COALESCE(delivered_at, $3) ELSE delivered_at END, acknowledged_at = CASE WHEN $2 = 'ACKNOWLEDGED' THEN COALESCE(acknowledged_at, $3) ELSE acknowledged_at END, started_at = CASE WHEN $2 = 'RUNNING' THEN COALESCE(started_at, $3) ELSE started_at END, completed_at = CASE WHEN $2 IN ('SUCCEEDED','FAILED','EXPIRED','CANCELLED','REJECTED') THEN COALESCE(completed_at, $3) ELSE completed_at END, failure_code = COALESCE($4, failure_code), session_id = COALESCE($5, session_id) WHERE id = $1 AND status = $6 RETURNING " + columns,
          [id, to, now, metadata.failureCode ?? null, metadata.sessionId ?? null, from],
        );
        return result.rows[0] === undefined ? null : toCommand(result.rows[0]);
      });
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw mapPostgresPersistenceError(error, 'Unable to transition command.');
    }
  }
}
