import type {
  EnrollmentSession,
  EnrollmentSessionStatus,
} from '../domain/enrollment-session.js';
import type { Repository } from './repository.js';

export interface EnrollmentSessionRepository extends Repository {
  create(input: {
    id: string;
    adminId: string;
    secretHash: string;
    expiresAt: Date;
  }): Promise<EnrollmentSession>;

  findById(id: string): Promise<EnrollmentSession | null>;

  listByAdminId(adminId: string): Promise<EnrollmentSession[]>;

  cancelOwned(id: string, adminId: string, now: Date): Promise<EnrollmentSession | null>;

  consume(input: {
    id: string;
    secretHash: string;
    managedDeviceId: string;
    stableIdentifier: string;
    name: string;
    platform: string;
    now: Date;
    maxAttempts?: number;
  }): Promise<EnrollmentSession>;
}
