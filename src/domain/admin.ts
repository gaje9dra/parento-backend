export type AdminStatus = 'ACTIVE' | 'DISABLED';

export interface Admin {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly status: AdminStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
