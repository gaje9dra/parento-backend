import { describe, expect, it, vi } from 'vitest';
import { LocationService } from '../src/services/location-service.js';
import type { LocationRepository } from '../src/repositories/location-repository.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import type { ManagedDevice } from '../src/domain/managed-device.js';

const device: ManagedDevice = {
  id: '11111111-1111-4111-8111-111111111111',
  adminId: '22222222-2222-4222-8222-222222222222',
  stableIdentifier: 'stable-device',
  name: 'Test device',
  platform: 'android',
  enrollmentStatus: 'ACTIVE',
  operationalStatus: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSeenAt: null,
};

const location = {
  managedDeviceId: device.id,
  availability: 'AVAILABLE' as const,
  latitude: 26.9124,
  longitude: 75.7873,
  accuracyMeters: 12,
  observedAt: new Date('2026-09-25T10:00:00.000Z'),
  receivedAt: new Date('2026-09-25T10:00:01.000Z'),
  reportId: '33333333-3333-4333-8333-333333333333',
};

const deviceRepo = {
  findById: vi.fn(async () => device),
} as unknown as ManagedDeviceRepository;

describe('LocationService', () => {
  it('accepts a valid report and assigns backend receipt time', async () => {
    const locations = {
      report: vi.fn(async (input: Parameters<LocationRepository['report']>[0]) => ({
        applied: true,
        location: { ...location, ...input, receivedAt: new Date() },
      })),
      findLatest: vi.fn(),
    } as unknown as LocationRepository;
    const service = new LocationService(locations, deviceRepo);
    const result = await service.report(
      { managedDeviceId: device.id },
      {
        reportId: location.reportId,
        availability: 'AVAILABLE',
        latitude: 26.9124,
        longitude: 75.7873,
        accuracyMeters: 12,
        observedAt: new Date(),
      },
    );
    expect(result.applied).toBe(true);
    expect(locations.report).toHaveBeenCalledWith(
      expect.objectContaining({
        managedDeviceId: device.id,
        receivedAt: expect.any(Date),
      }),
    );
  });

  it('rejects invalid geographic ranges', async () => {
    const locations = {
      report: vi.fn(),
      findLatest: vi.fn(),
    } as unknown as LocationRepository;
    const service = new LocationService(locations, deviceRepo);
    await expect(
      service.report(
        { managedDeviceId: device.id },
        {
          reportId: location.reportId,
          availability: 'AVAILABLE',
          latitude: 91,
          longitude: 75,
          accuracyMeters: null,
          observedAt: new Date(),
        },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_LOCATION_COORDINATES',
      statusCode: 400,
    });
  });

  it('rejects future timestamps beyond the allowed clock-skew window', async () => {
    const locations = {
      report: vi.fn(),
      findLatest: vi.fn(),
    } as unknown as LocationRepository;
    const service = new LocationService(locations, deviceRepo);
    await expect(
      service.report(
        { managedDeviceId: device.id },
        {
          reportId: location.reportId,
          availability: 'AVAILABLE',
          latitude: 26,
          longitude: 75,
          accuracyMeters: null,
          observedAt: new Date(Date.now() + 6 * 60 * 1000),
        },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_LOCATION_TIMESTAMP',
      statusCode: 400,
    });
  });

  it('rejects location reporting from a revoked device', async () => {
    const locations = {
      report: vi.fn(),
      findLatest: vi.fn(),
    } as unknown as LocationRepository;
    const revoked = { ...device, enrollmentStatus: 'REVOKED' as const };
    const devices = {
      findById: vi.fn(async () => revoked),
    } as unknown as ManagedDeviceRepository;
    const service = new LocationService(locations, devices);
    await expect(
      service.report(
        { managedDeviceId: device.id },
        {
          reportId: location.reportId,
          availability: 'AVAILABLE',
          latitude: 26,
          longitude: 75,
          accuracyMeters: null,
          observedAt: new Date(),
        },
      ),
    ).rejects.toMatchObject({
      code: 'DEVICE_AUTHORIZATION_DENIED',
      statusCode: 403,
    });
  });

  it('requires Admin ownership for retrieval', async () => {
    const locations = {
      report: vi.fn(),
      findLatest: vi.fn(async () => location),
    } as unknown as LocationRepository;
    const service = new LocationService(locations, deviceRepo);
    await expect(
      service.getForAdmin('99999999-9999-4999-8999-999999999999', device.id),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED', statusCode: 403 });
  });
});
