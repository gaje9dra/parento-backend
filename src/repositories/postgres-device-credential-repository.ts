import { mapPostgresPersistenceError } from '../db/errors.js';
import type { DeviceCredential } from '../domain/device-credential.js';
import type { DeviceCredentialRepository } from './device-credential-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface Row {
  id: string;
  managed_device_id: string;
  status: 'ACTIVE' | 'REVOKED';
  created_at: Date;
  revoked_at: Date | null;
  last_used_at: Date | null;
}
const columns =
  'id, managed_device_id, status, created_at, revoked_at, last_used_at';
const map = (r: Row): DeviceCredential => ({
  id: r.id,
  managedDeviceId: r.managed_device_id,
  status: r.status,
  createdAt: r.created_at,
  revokedAt: r.revoked_at,
  lastUsedAt: r.last_used_at,
});

export class PostgresDeviceCredentialRepository
  extends PostgresRepository
  implements DeviceCredentialRepository
{
  readonly name = 'device-credential';

  async create(input: {
    id: string;
    managedDeviceId: string;
    credentialHash: string;
  }): Promise<DeviceCredential> {
    try {
      const result = await this.query<Row>(
        'INSERT INTO device_credentials (id, managed_device_id, credential_hash) VALUES ($1,$2,$3) RETURNING ' +
          columns,
        [input.id, input.managedDeviceId, input.credentialHash],
      );
      return map(result.rows[0]!);
    } catch (error) {
      throw mapPostgresPersistenceError(
        error,
        'Unable to create device credential.',
      );
    }
  }

  async authenticate(credentialHash: string): Promise<DeviceCredential | null> {
    const result = await this.query<Row>(
      "UPDATE device_credentials SET last_used_at = NOW() WHERE credential_hash = $1 AND status = 'ACTIVE' RETURNING " +
        columns,
      [credentialHash],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async revokeForDevice(managedDeviceId: string, now: Date): Promise<void> {
    await this.query(
      "UPDATE device_credentials SET status = 'REVOKED', revoked_at = $2 WHERE managed_device_id = $1 AND status = 'ACTIVE'",
      [managedDeviceId, now],
    );
  }
}
