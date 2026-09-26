import type {
  AudioAccessSession,
  AudioAccessSessionStatus,
  AudioAccessTerminationReason,
} from '../domain/audio-access-session.js';
import type { Repository } from './repository.js';

export interface AudioAccessSessionRepository extends Repository {
  create(input: {
    id: string;
    managedDeviceId: string;
    adminId: string;
    correlationId: string;
    expiresAt: Date;
    transportState: Record<string, unknown> | null;
  }): Promise<{ session: AudioAccessSession; created: boolean }>;
  findById(id: string): Promise<AudioAccessSession | null>;
  findOwned(id: string, adminId: string): Promise<AudioAccessSession | null>;
  findActiveByDeviceId(
    managedDeviceId: string,
  ): Promise<AudioAccessSession | null>;
  transition(input: {
    id: string;
    from: AudioAccessSessionStatus;
    to: AudioAccessSessionStatus;
    now: Date;
    terminationReason?: AudioAccessTerminationReason | null;
    transportState?: Record<string, unknown> | null;
  }): Promise<AudioAccessSession>;
  expireDue(now: Date, limit: number): Promise<number>;
  expireForAdmin(adminId: string, now: Date): Promise<number>;
  deleteTerminatedBefore(cutoff: Date, limit: number): Promise<number>;
}
