import type { ManagedDeviceLocation } from '../domain/location.js';
import { getLocationFreshness, type LocationFreshness } from '../domain/location.js';
import type { LocationRepository } from '../repositories/location-repository.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import { AppError } from '../types/errors.js';

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_ACCURACY_METERS = 100_000;
const MAX_COORDINATE_DECIMAL_PLACES = 7;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const decimalPlaces = (value: number): number => {
  const text = Math.abs(value).toString().toLowerCase();
  if (text.includes('e')) {
    const parts = text.split('e');
    const mantissa = parts[0] ?? '';
    const exponent = Number(parts[1] ?? 0);
    const fraction = mantissa.split('.')[1]?.length ?? 0;
    return Math.max(0, fraction - exponent);
  }
  return text.split('.')[1]?.length ?? 0;
};

export class LocationService {
  constructor(
    private readonly locations: LocationRepository,
    private readonly devices: ManagedDeviceRepository,
  ) {}

  async report(
    session: { managedDeviceId: string },
    input: {
      reportId: string;
      availability: 'AVAILABLE' | 'UNAVAILABLE';
      latitude: number | null;
      longitude: number | null;
      accuracyMeters: number | null;
      observedAt: Date;
    },
  ): Promise<{ applied: boolean; location: ManagedDeviceLocation; freshness: LocationFreshness }> {
    if (!UUID.test(input.reportId)) throw new AppError(400, 'INVALID_REQUEST', 'Location report identifier is invalid.');
    if (!(input.observedAt instanceof Date) || Number.isNaN(input.observedAt.getTime())) {
      throw new AppError(400, 'INVALID_LOCATION_TIMESTAMP', 'Location observedAt must be a valid timestamp.');
    }
    if (input.observedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
      throw new AppError(400, 'INVALID_LOCATION_TIMESTAMP', 'Location observedAt is too far in the future.');
    }

    const device = await this.devices.findById(session.managedDeviceId);
    if (device === null) throw new AppError(404, 'DEVICE_NOT_FOUND', 'Managed device was not found.');
    if (device.enrollmentStatus !== 'ACTIVE' || device.operationalStatus !== 'ACTIVE') {
      throw new AppError(403, 'DEVICE_AUTHORIZATION_DENIED', 'Managed device is not authorized to report location.');
    }

    if (input.availability === 'AVAILABLE') {
      if (input.latitude === null || input.longitude === null) {
        throw new AppError(400, 'INVALID_LOCATION_COORDINATES', 'Latitude and longitude are required when location is available.');
      }
      this.validateCoordinate(input.latitude, -90, 90, 'Latitude');
      this.validateCoordinate(input.longitude, -180, 180, 'Longitude');
      if (input.accuracyMeters !== null && (!Number.isFinite(input.accuracyMeters) || input.accuracyMeters < 0 || input.accuracyMeters > MAX_ACCURACY_METERS)) {
        throw new AppError(400, 'INVALID_LOCATION_ACCURACY', 'Location accuracy must be a finite non-negative measurement.');
      }
    } else if (input.latitude !== null || input.longitude !== null || input.accuracyMeters !== null) {
      throw new AppError(400, 'INVALID_LOCATION_COORDINATES', 'Unavailable location reports must not include coordinates.');
    }

    const receivedAt = new Date();
    const result = await this.locations.report({ ...input, managedDeviceId: session.managedDeviceId, receivedAt });
    return { ...result, freshness: getLocationFreshness(result.location, receivedAt) };
  }

  async getForAdmin(adminId: string, managedDeviceId: string): Promise<{ location: ManagedDeviceLocation | null; freshness: LocationFreshness }> {
    const device = await this.devices.findById(managedDeviceId);
    if (device === null) throw new AppError(404, 'DEVICE_NOT_FOUND', 'Managed device was not found.');
    if (device.adminId !== adminId) throw new AppError(403, 'AUTHORIZATION_DENIED', 'The administrator does not control this device.');
    const location = await this.locations.findLatest(managedDeviceId);
    return { location, freshness: getLocationFreshness(location) };
  }

  private validateCoordinate(value: number, min: number, max: number, label: string): void {
    if (!Number.isFinite(value) || value < min || value > max || decimalPlaces(value) > MAX_COORDINATE_DECIMAL_PLACES) {
      throw new AppError(400, 'INVALID_LOCATION_COORDINATES', label + ' is outside the permitted geographic range or precision.');
    }
  }
}
