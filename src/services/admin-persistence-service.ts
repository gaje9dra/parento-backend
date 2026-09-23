import { randomUUID } from 'node:crypto';
import type { Admin, AdminStatus } from '../domain/admin.js';
import type { AdminRepository } from '../repositories/admin-repository.js';

const MAX_DISPLAY_NAME_LENGTH = 100;

const normalizeEmail = (value: string): string => {
  const email = value.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('Administrator email is invalid.');
  }
  return email;
};

const normalizeDisplayName = (value: string | null): string | null => {
  if (value === null) return null;
  const displayName = value.trim();
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(
      `Administrator display name must not exceed ${MAX_DISPLAY_NAME_LENGTH} characters.`,
    );
  }
  return displayName.length === 0 ? null : displayName;
};

export class AdminPersistenceService {
  constructor(private readonly repository: AdminRepository) {}

  create(input: { email: string; displayName: string | null }): Promise<Admin> {
    return this.repository.create({
      id: randomUUID(),
      email: normalizeEmail(input.email),
      displayName: normalizeDisplayName(input.displayName),
    });
  }

  findById(id: string): Promise<Admin | null> {
    return this.repository.findById(id);
  }

  findByEmail(email: string): Promise<Admin | null> {
    return this.repository.findByEmail(normalizeEmail(email));
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.repository.existsByEmail(normalizeEmail(email));
  }

  updateStatus(id: string, status: AdminStatus): Promise<Admin | null> {
    return this.repository.updateStatus(id, status);
  }

  updateMetadata(
    id: string,
    displayName: string | null,
  ): Promise<Admin | null> {
    return this.repository.updateMetadata(id, {
      displayName: normalizeDisplayName(displayName),
    });
  }
}
