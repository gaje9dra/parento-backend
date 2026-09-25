export type LocationAvailability = 'AVAILABLE' | 'UNAVAILABLE';
export type LocationFreshness =
  'FRESH' | 'STALE' | 'VERY_STALE' | 'UNKNOWN' | 'NEVER_REPORTED';

export interface ManagedDeviceLocation {
  readonly managedDeviceId: string;
  readonly availability: LocationAvailability;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly accuracyMeters: number | null;
  readonly observedAt: Date;
  readonly receivedAt: Date;
  readonly reportId: string;
}

export const FRESH_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
export const STALE_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;

export const getLocationFreshness = (
  location: ManagedDeviceLocation | null,
  now = new Date(),
): LocationFreshness => {
  if (location === null) return 'NEVER_REPORTED';
  if (location.availability === 'UNAVAILABLE') return 'UNKNOWN';
  const age = Math.max(0, now.getTime() - location.observedAt.getTime());
  if (age <= FRESH_LOCATION_MAX_AGE_MS) return 'FRESH';
  if (age <= STALE_LOCATION_MAX_AGE_MS) return 'STALE';
  return 'VERY_STALE';
};
