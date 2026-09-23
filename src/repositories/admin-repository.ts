import type { Admin, AdminStatus } from '../domain/admin.js';
import type { Repository } from './repository.js';

export interface AdminRepository extends Repository {
  create(input: {
    id: string;
    email: string;
    displayName: string | null;
  }): Promise<Admin>;
  findById(id: string): Promise<Admin | null>;
  findByEmail(email: string): Promise<Admin | null>;
  updateStatus(id: string, status: AdminStatus): Promise<Admin | null>;
}
