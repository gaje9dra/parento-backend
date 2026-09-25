import type { ManagedDeviceLocation } from '../domain/location.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { LocationRepository, LocationReportInput, LocationReportResult } from './location-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface LocationRow {
  managed_device_id: string;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  observed_at: Date;
  received_at: Date;
  report_id: string;
}

const columns = 'managed_device_id, availability, latitude, longitude, accuracy_meters, observed_at, received_at, report_id';

const toLocation = (row: LocationRow): ManagedDeviceLocation => ({
  managedDeviceId: row.managed_device_id,
  availability: row.availability,
  latitude: row.latitude,
  longitude: row.longitude,
  accuracyMeters: row.accuracy_meters,
  observedAt: row.observed_at,
  receivedAt: row.received_at,
  reportId: row.report_id,
});

export class PostgresLocationRepository extends PostgresRepository implements LocationRepository {
  readonly name = 'location';

  async findLatest(managedDeviceId: string): Promise<ManagedDeviceLocation | null> {
    const result = await this.query<LocationRow>(
      'SELECT ' + columns + ' FROM managed_device_locations WHERE managed_device_id = $1',
      [managedDeviceId],
    );
    return result.rows[0] === undefined ? null : toLocation(result.rows[0]);
  }

  async report(input: LocationReportInput): Promise<LocationReportResult> {
    try {
      const result = await this.query<LocationRow>(
        'INSERT INTO managed_device_locations (' + columns + ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ' +
          'ON CONFLICT (managed_device_id) DO UPDATE SET ' +
          'availability = EXCLUDED.availability, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, ' +
          'accuracy_meters = EXCLUDED.accuracy_meters, observed_at = EXCLUDED.observed_at, ' +
          'received_at = EXCLUDED.received_at, report_id = EXCLUDED.report_id ' +
          'WHERE EXCLUDED.observed_at > managed_device_locations.observed_at ' +
          'RETURNING ' + columns,
        [input.managedDeviceId, input.availability, input.latitude, input.longitude, input.accuracyMeters, input.observedAt, input.receivedAt, input.reportId],
      );
      if (result.rows[0] !== undefined) return { applied: true, location: toLocation(result.rows[0]) };
      const current = await this.findLatest(input.managedDeviceId);
      if (current === null) throw new PersistenceError('NOT_FOUND', 'Location state was not found.');
      return { applied: false, location: current };
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError('CONFLICT', 'Unable to persist location report.');
    }
  }
}
