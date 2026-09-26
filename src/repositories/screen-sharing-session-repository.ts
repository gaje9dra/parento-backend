import type {
  ScreenSharingSession,
  ScreenSharingSessionStatus,
  ScreenSharingTerminationReason,
} from '../domain/screen-sharing-session.js';
import type { Repository } from './repository.js';

export interface ScreenSharingSessionRepository extends Repository {
  create(input: {
    id: string;
    managedDeviceId: string;
    adminId: string;
    correlationId: string;
    expiresAt: Date;
    transportState: Record<string, unknown> | null;
  }): Promise<{ session: ScreenSharingSession; created: boolean }>;
  findById(id: string): Promise<ScreenSharingSession | null>;
  findOwned(id: string, adminId: string): Promise<ScreenSharingSession | null>;
  findActiveByDeviceId(
    managedDeviceId: string,
  ): Promise<ScreenSharingSession | null>;
  transition(input: {
    id: string;
    from: ScreenSharingSessionStatus;
    to: ScreenSharingSessionStatus;
    now: Date;
    terminationReason?: ScreenSharingTerminationReason | null;
    transportState?: Record<string, unknown> | null;
  }): Promise<ScreenSharingSession>;
  expireDue(now: Date, limit: number): Promise<number>;
  expireForAdmin(adminId: string, now: Date): Promise<number>;
  deleteTerminatedBefore(cutoff: Date, limit: number): Promise<number>;
}
