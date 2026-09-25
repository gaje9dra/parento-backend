import { describe, expect, it } from 'vitest';
import { PostgresLocationRepository } from '../src/repositories/postgres-location-repository.js';

const currentLocationRow = {
  managed_device_id: '11111111-1111-4111-8111-111111111111',
  availability: 'AVAILABLE' as const,
  latitude: 26.9,
  longitude: 75.8,
  accuracy_meters: 12,
  observed_at: new Date('2026-09-25T10:00:00.000Z'),
  received_at: new Date('2026-09-25T10:00:01.000Z'),
  report_id: '33333333-3333-4333-8333-333333333333',
};

const currentLocation = {
  managedDeviceId: currentLocationRow.managed_device_id,
  availability: currentLocationRow.availability,
  latitude: currentLocationRow.latitude,
  longitude: currentLocationRow.longitude,
  accuracyMeters: currentLocationRow.accuracy_meters,
  observedAt: currentLocationRow.observed_at,
  receivedAt: currentLocationRow.received_at,
  reportId: currentLocationRow.report_id,
};

const input = {
  managedDeviceId: currentLocation.managedDeviceId,
  reportId: currentLocation.reportId,
  availability: currentLocation.availability,
  latitude: currentLocation.latitude,
  longitude: currentLocation.longitude,
  accuracyMeters: currentLocation.accuracyMeters,
  observedAt: currentLocation.observedAt,
  receivedAt: currentLocation.receivedAt,
};

describe('PostgresLocationRepository', () => {
  it('treats an exact duplicate report as an idempotent no-op', async () => {
    const database = {
      query: async <T>(sql: string) => {
        if (sql.startsWith('INSERT INTO')) {
          throw { code: '23505' };
        }
        return {
          rows: [currentLocationRow],
          rowCount: 1,
        } as unknown as { rows: T[]; rowCount: number };
      },
    };
    const repository = new PostgresLocationRepository(database as never);

    await expect(repository.report(input)).resolves.toEqual({
      applied: false,
      location: currentLocation,
    });
  });

  it('rejects reuse of a report id with different data', async () => {
    const database = {
      query: async <T>(sql: string) => {
        if (sql.startsWith('INSERT INTO')) {
          throw { code: '23505' };
        }
        return {
          rows: [currentLocation],
          rowCount: 1,
        } as unknown as { rows: T[]; rowCount: number };
      },
    };
    const repository = new PostgresLocationRepository(database as never);

    await expect(
      repository.report({
        ...input,
        latitude: 27,
      }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'CONFLICT',
    });
  });
});
