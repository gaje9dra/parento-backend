import type {
  ManagedDevice,
  ManagedDeviceStatus,
} from '../domain/managed-device.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import {
  isValidManagedDeviceTransition,
} from '../domain/managed-device.js';
import type {
  DevicePage,
  DevicePageRequest,
  ManagedDeviceRepository,
} from './managed-device-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import { mapPostgresPersistenceError } from '../db/errors.js';

interface DeviceRow {
  id: string;
  admin_id: string;
  stable_identifier: string;
  name: string;
  platform: string;
  enrollment_status: ManagedDeviceStatus;
  operational_status: ManagedDeviceStatus;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date | null;
}

const columns =
  'id, admin_id, stable_identifier, name, platform, enrollment_status, operational_status, created_at, updated_at, last_seen_at';

const toDevice = (row: DeviceRow): ManagedDevice => ({
  id: row.id,
  adminId: row.admin_id,
  stableIdentifier: row.stable_identifier,
  name: row.name,
  platform: row.platform,
  enrollmentStatus: row.enrollment_status,
  operationalStatus: row.operational_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastSeenAt: row.last_seen_at,
});

const encodeCursor = (row: DeviceRow): string =>
  Buffer.from(
    JSON.stringify({
      createdAt: row.created_at.toISOString(),
      id: row.id,
    }),
  ).toString('base64url');

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('Invalid cursor.');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error('Invalid cursor.');
    return { createdAt, id: parsed.id };
  } catch {
    throw new PersistenceError(
      'INVALID_STATE',
      'The device page cursor is invalid.',
    );
  }
};

export class PostgresManagedDeviceRepository
  extends PostgresRepository
  implements ManagedDeviceRepository
{
  readonly name = 'managed-device';

  async create(input: {
    id: string;
    adminId: string;
    stableIdentifier: string;
    name: string;
    platform: string;
  }): Promise<ManagedDevice> {
    try {
      const result = await this.query<DeviceRow>(
        'INSERT INTO managed_devices (id, admin_id, stable_identifier, name, platform) VALUES ($1, $2, $3, $4, $5) RETURNING ' + columns,
        [
          input.id,
          input.adminId,
          input.stableIdentifier,
          input.name,
          input.platform,
        ],
      );
      return toDevice(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to create managed device.',
      );
    }
  }

  async findById(id: string): Promise<ManagedDevice | null> {
    const result = await this.query<DeviceRow>(
      'SELECT ' + columns + ' FROM managed_devices WHERE id = $1',
      [id],
    );
    return result.rows[0] === undefined ? null : toDevice(result.rows[0]);
  }

  async findByStableIdentifier(
    stableIdentifier: string,
  ): Promise<ManagedDevice | null> {
    const result = await this.query<DeviceRow>(
      'SELECT ' + columns + ' FROM managed_devices WHERE stable_identifier = $1',
      [stableIdentifier],
    );
    return result.rows[0] === undefined ? null : toDevice(result.rows[0]);
  }

  async list(page: DevicePageRequest = {}): Promise<DevicePage> {
    const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
    const cursor = page.cursor == null ? null : decodeCursor(page.cursor);
    const result = cursor === null
      ? await this.query<DeviceRow>(
          'SELECT ' + columns +
            ' FROM managed_devices ' +
            'ORDER BY created_at DESC, id DESC LIMIT $1',
          [limit + 1],
        )
      : await this.query<DeviceRow>(
          'SELECT ' + columns +
            ' FROM managed_devices ' +
            'WHERE (created_at, id) < ($1, $2) ' +
            'ORDER BY created_at DESC, id DESC LIMIT $3',
          [cursor.createdAt, cursor.id, limit + 1],
        );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    return {
      items: rows.map(toDevice),
      nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]!) : null,
    };
  }

  async listByAdminId(
    adminId: string,
    page: DevicePageRequest = {},
  ): Promise<DevicePage> {
    const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
    const cursor = page.cursor === undefined || page.cursor === null
      ? null
      : decodeCursor(page.cursor);

    const result = cursor === null
      ? await this.query<DeviceRow>(
          'SELECT ' + columns +
            ' FROM managed_devices WHERE admin_id = $1 ' +
            'ORDER BY created_at DESC, id DESC LIMIT $2',
          [adminId, limit + 1],
        )
      : await this.query<DeviceRow>(
          'SELECT ' + columns +
            ' FROM managed_devices WHERE admin_id = $1 ' +
            'AND (created_at, id) < ($2, $3) ' +
            'ORDER BY created_at DESC, id DESC LIMIT $4',
          [adminId, cursor.createdAt, cursor.id, limit + 1],
        );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    return {
      items: rows.map(toDevice),
      nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]!) : null,
    };
  }

  async updateStatus(
    id: string,
    status: ManagedDeviceStatus,
  ): Promise<ManagedDevice | null> {
    const current = await this.findById(id);
    if (current === null) return null;

    if (
      !isValidManagedDeviceTransition(current.operationalStatus, status) ||
      !isValidManagedDeviceTransition(current.enrollmentStatus, status)
    ) {
      throw new PersistenceError(
        'INVALID_STATE',
        'The managed device status transition is invalid.',
      );
    }

    const result = await this.query<DeviceRow>(
      'UPDATE managed_devices SET enrollment_status = $2, operational_status = $2, updated_at = NOW() WHERE id = $1 RETURNING ' + columns,
      [id, status],
    );
    return result.rows[0] === undefined ? null : toDevice(result.rows[0]);
  }
}
