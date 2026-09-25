import type { ManagedDeviceLocation } from '../domain/location.js';
import type { Repository } from './repository.js';

export interface LocationReportInput {
  readonly managedDeviceId: string;
  readonly reportId: string;
  readonly availability: 'AVAILABLE' | 'UNAVAILABLE';
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly accuracyMeters: number | null;
  readonly observedAt: Date;
  readonly receivedAt: Date;
}

export interface LocationReportResult {
  readonly applied: boolean;
  readonly location: ManagedDeviceLocation;
}

export interface LocationRepository extends Repository {
  findLatest(managedDeviceId: string): Promise<ManagedDeviceLocation | null>;
  findByReportId(reportId: string): Promise<ManagedDeviceLocation | null>;
  report(input: LocationReportInput): Promise<LocationReportResult>;
}
