import type { Database } from '../db/index.js';
import type { ManagedDevice, ManagedDeviceStatus } from '../domain/managed-device.js';
import type { ManagedDeviceRepository } from './managed-device-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import { mapPostgresPersistenceError } from './postgres-admin-repository.js';

interface DeviceRow { id: string; admin_id: string; name: string; platform: string; enrollment_status: ManagedDeviceStatus; operational_status: ManagedDeviceStatus; created_at: Date; updated_at: Date; last_seen_at: Date | null; }

const toDevice = (row: DeviceRow): ManagedDevice => ({
  id: row.id, adminId: row.admin_id, name: row.name, platform: row.platform,
  enrollmentStatus: row.enrollment_status, operationalStatus: row.operational_status,
  createdAt: row.created_at, updatedAt: row.updated_at, lastSeenAt: row.last_seen_at,
});

export class PostgresManagedDeviceRepository extends PostgresRepository implements ManagedDeviceRepository {
  readonly name = 'managed-device';

  async create(input: { id: string; adminId: string; name: string; platform: string }): Promise<ManagedDevice> {
    try {
      const result = await this.query<DeviceRow>(
        'INSERT INTO managed_devices (id, admin_id, name, platform) VALUES ($1, $2, $3, $4) RETURNING id, admin_id, name, platform, enrollment_status, operational_status, created_at, updated_at, last_seen_at',
        [input.id, input.adminId, input.name, input.platform],
      );
      return toDevice(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(error, 'Unable to create managed device.');
    }
  }

  async findById(id: string): Promise<ManagedDevice | null> {
    const result = await this.query<DeviceRow>(
      'SELECT id, admin_id, name, platform, enrollment_status, operational_status, created_at, updated_at, last_seen_at FROM managed_devices WHERE id = $1', [id],
    );
    return result.rows[0] === undefined ? null : toDevice(result.rows[0]);
  }

  async listByAdminId(adminId: string): Promise<ManagedDevice[]> {
    const result = await this.query<DeviceRow>(
      'SELECT id, admin_id, name, platform, enrollment_status, operational_status, created_at, updated_at, last_seen_at FROM managed_devices WHERE admin_id = $1 ORDER BY created_at DESC', [adminId],
    );
    return result.rows.map(toDevice);
  }

  async updateStatus(id: string, status: ManagedDeviceStatus): Promise<ManagedDevice | null> {
    const result = await this.query<DeviceRow>(
      'UPDATE managed_devices SET enrollment_status = $2, operational_status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, admin_id, name, platform, enrollment_status, operational_status, created_at, updated_at, last_seen_at',
      [id, status],
    );
    return result.rows[0] === undefined ? null : toDevice(result.rows[0]);
  }
}
