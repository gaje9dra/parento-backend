import { randomUUID } from 'node:crypto';
import type { Database } from '../db/index.js';
import { PASSWORD_POLICY, PasswordHasher } from '../auth/password.js';

interface AdminCredentialRow {
  id: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED';
  password_hash: string | null;
}

export interface DevelopmentAdminProvisionResult {
  readonly id: string;
  readonly email: string;
  readonly created: boolean;
}

const normalizeEmail = (value: string): string => {
  const email = value.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('Development administrator email is invalid.');
  }
  return email;
};

const validatePassword = (password: string): void => {
  if (
    password.length < PASSWORD_POLICY.minLength ||
    password.length > PASSWORD_POLICY.maxLength
  ) {
    throw new Error(
      `Development administrator password must be between ${PASSWORD_POLICY.minLength} and ${PASSWORD_POLICY.maxLength} characters.`,
    );
  }
};

const findAdmin = async (
  database: Database,
  email: string,
): Promise<AdminCredentialRow | null> => {
  const result = await database.query<AdminCredentialRow>(
    'SELECT id, email, status, password_hash FROM admins WHERE LOWER(email) = LOWER($1)',
    [email],
  );
  return result.rows[0] ?? null;
};

export class DevelopmentAdminProvisioningService {
  constructor(
    private readonly database: Database,
    private readonly environment: 'development' | 'test' | 'production',
    private readonly passwordHasher = new PasswordHasher(),
  ) {}

  async provision(input: {
    email: string;
    password: string;
  }): Promise<DevelopmentAdminProvisionResult> {
    if (this.environment === 'production') {
      throw new Error(
        'Development administrator provisioning is disabled in production.',
      );
    }

    const email = normalizeEmail(input.email);
    validatePassword(input.password);

    const existing = await findAdmin(this.database, email);
    if (existing !== null) {
      if (existing.status !== 'ACTIVE' || existing.password_hash === null) {
        throw new Error(
          'An administrator with the configured email already exists without usable active credentials; no changes were made.',
        );
      }

      if (
        !(await this.passwordHasher.verify(
          input.password,
          existing.password_hash,
        ))
      ) {
        throw new Error(
          'An administrator with the configured email already exists with different credentials; no changes were made.',
        );
      }

      return {
        id: existing.id,
        email: existing.email,
        created: false,
      };
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    return this.database.withTransaction(async (client) => {
      const concurrent = await client.query<AdminCredentialRow>(
        'SELECT id, email, status, password_hash FROM admins WHERE LOWER(email) = LOWER($1) FOR UPDATE',
        [email],
      );
      const existingAfterLock = concurrent.rows[0];

      if (existingAfterLock !== undefined) {
        if (
          existingAfterLock.status !== 'ACTIVE' ||
          existingAfterLock.password_hash === null
        ) {
          throw new Error(
            'An administrator with the configured email already exists without usable active credentials; no changes were made.',
          );
        }

        if (
          !(await this.passwordHasher.verify(
            input.password,
            existingAfterLock.password_hash,
          ))
        ) {
          throw new Error(
            'An administrator with the configured email already exists with different credentials; no changes were made.',
          );
        }

        return {
          id: existingAfterLock.id,
          email: existingAfterLock.email,
          created: false,
        };
      }

      const id = randomUUID();
      await client.query(
        'INSERT INTO admins (id, email, display_name, status, password_hash) VALUES ($1, $2, $3, $4, $5)',
        [id, email, 'Development Administrator', 'ACTIVE', passwordHash],
      );

      return { id, email, created: true };
    });
  }
}
