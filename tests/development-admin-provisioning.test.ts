import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import { PASSWORD_POLICY, PasswordHasher } from '../src/auth/password.js';
import type { Database } from '../src/db/index.js';
import { DevelopmentAdminProvisioningService } from '../src/services/development-admin-provisioning-service.js';

type AdminRow = {
  id: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED';
  password_hash: string | null;
};

class FakeClient {
  constructor(private readonly admins: Map<string, AdminRow>) {}

  async query<T extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (
      text.startsWith('SELECT id, email, status, password_hash FROM admins')
    ) {
      const email = String(values[0]).trim().toLowerCase();
      const row = this.admins.get(email);
      return {
        command: 'SELECT',
        rowCount: row === undefined ? 0 : 1,
        oid: 0,
        rows: row === undefined ? [] : [row as unknown as T],
        fields: [],
      };
    }

    if (text.startsWith('INSERT INTO admins')) {
      const [id, email, , status, passwordHash] = values;
      const row: AdminRow = {
        id: String(id),
        email: String(email),
        status: status as AdminRow['status'],
        password_hash: String(passwordHash),
      };
      this.admins.set(row.email, row);
      return { command: 'INSERT', rowCount: 1, oid: 0, rows: [], fields: [] };
    }

    throw new Error('Unexpected SQL in fake client.');
  }
}

class FakeDatabase implements Database {
  readonly configured = true;
  readonly admins = new Map<string, AdminRow>();

  async connect(): Promise<void> {}
  async close(): Promise<void> {}
  async isReady(): Promise<boolean> {
    return true;
  }

  async query<T extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return new FakeClient(this.admins).query<T>(text, values);
  }

  async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return work(new FakeClient(this.admins) as unknown as PoolClient);
  }
}

class FakePasswordHasher extends PasswordHasher {
  override async hash(password: string): Promise<string> {
    return `scrypt-test-hash:${password}`;
  }

  override async verify(
    password: string,
    encodedHash: string,
  ): Promise<boolean> {
    return encodedHash === `scrypt-test-hash:${password}`;
  }
}

describe('DevelopmentAdminProvisioningService', () => {
  it('rejects provisioning in production', async () => {
    const service = new DevelopmentAdminProvisioningService(
      new FakeDatabase(),
      'production',
      new FakePasswordHasher(),
    );

    await expect(
      service.provision({
        email: 'dev@example.com',
        password: 'a sufficiently long password',
      }),
    ).rejects.toThrow(/disabled in production/);
  });

  it('creates an ACTIVE admin with a generated id and hashed password', async () => {
    const database = new FakeDatabase();
    const service = new DevelopmentAdminProvisioningService(
      database,
      'development',
      new FakePasswordHasher(),
    );

    const result = await service.provision({
      email: '  DEV@Example.COM ',
      password: 'a sufficiently long password',
    });

    expect(result.created).toBe(true);
    expect(result.email).toBe('dev@example.com');
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const row = database.admins.get('dev@example.com');
    expect(row?.status).toBe('ACTIVE');
    expect(row?.password_hash).toBe(
      'scrypt-test-hash:a sufficiently long password',
    );
    expect(row?.password_hash).not.toBe('a sufficiently long password');
  });

  it('is idempotent for matching credentials and does not re-create the admin', async () => {
    const database = new FakeDatabase();
    const service = new DevelopmentAdminProvisioningService(
      database,
      'development',
      new FakePasswordHasher(),
    );
    const input = {
      email: 'dev@example.com',
      password: 'a sufficiently long password',
    };

    const first = await service.provision(input);
    const second = await service.provision(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(database.admins.size).toBe(1);
  });

  it('refuses to change an existing account with different credentials', async () => {
    const database = new FakeDatabase();
    const service = new DevelopmentAdminProvisioningService(
      database,
      'development',
      new FakePasswordHasher(),
    );
    await service.provision({
      email: 'dev@example.com',
      password: 'a sufficiently long password',
    });

    await expect(
      service.provision({
        email: 'dev@example.com',
        password: 'a different sufficiently long password',
      }),
    ).rejects.toThrow(/different credentials/);
  });

  it('enforces the existing password policy', async () => {
    const service = new DevelopmentAdminProvisioningService(
      new FakeDatabase(),
      'development',
      new FakePasswordHasher(),
    );

    await expect(
      service.provision({ email: 'dev@example.com', password: 'short' }),
    ).rejects.toThrow(
      new RegExp(
        `between ${PASSWORD_POLICY.minLength} and ${PASSWORD_POLICY.maxLength}`,
      ),
    );
  });
});
