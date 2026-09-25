import { describe, expect, it } from 'vitest';
import { PostgresLocationRepository } from '../src/repositories/postgres-location-repository.js';

const currentLocation = {
  managedDeviceId: '11111111-1111-4111-8111-111111111111',
  availability: 'AVAILABLE' as const,
  latitude: 26.9,
  longitude: 75.8,
  accuracyMeters: 12,
  observedAt: new Date('2026-09-25T10:00:00.000Z'),
  receivedAt: new Date('2026-09-25T10:00:01.000Z'),
  reportId: '33333333-3333-4333-8333-333333333333',
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
          rows: [currentLocation],
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
