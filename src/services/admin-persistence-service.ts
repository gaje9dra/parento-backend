import { randomUUID } from 'node:crypto';
import type { Admin } from '../domain/admin.js';
import type { AdminRepository } from '../repositories/admin-repository.js';

export class AdminPersistenceService {
  constructor(private readonly repository: AdminRepository) {}

  create(input: { email: string; displayName: string | null }): Promise<Admin> {
    const email = input.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Administrator email is invalid.');
    }
    return this.repository.create({
      id: randomUUID(),
      email,
      displayName: input.displayName,
    });
  }

  findById(id: string): Promise<Admin | null> {
    return this.repository.findById(id);
  }

  findByEmail(email: string): Promise<Admin | null> {
    return this.repository.findByEmail(email);
  }
}
