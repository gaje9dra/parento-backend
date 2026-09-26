import { describe, expect, it } from 'vitest';
import {
  calculateInventoryFreshness,
  isValidApplicationPackageName,
} from '../src/domain/application-management.js';

describe('application management domain', () => {
  it('accepts stable Android package identifiers and rejects malformed values', () => {
    expect(isValidApplicationPackageName('com.example.application')).toBe(true);
    expect(isValidApplicationPackageName('com.example_app.child')).toBe(true);
    expect(isValidApplicationPackageName('example')).toBe(false);
    expect(isValidApplicationPackageName('com..example')).toBe(false);
    expect(isValidApplicationPackageName('com.example application')).toBe(
      false,
    );
  });

  it('calculates inventory freshness from server receipt time and device state', () => {
    const now = new Date('2026-09-26T12:00:00.000Z');
    expect(
      calculateInventoryFreshness(
        { enrollmentStatus: 'ACTIVE', operationalStatus: 'ACTIVE' },
        null,
        now,
        300,
        86400,
        true,
      ),
    ).toBe('NEVER_REPORTED');
    expect(
      calculateInventoryFreshness(
        { enrollmentStatus: 'ACTIVE', operationalStatus: 'ACTIVE' },
        new Date('2026-09-26T11:59:00.000Z'),
        now,
        300,
        86400,
        true,
      ),
    ).toBe('FRESH');
    expect(
      calculateInventoryFreshness(
        { enrollmentStatus: 'ACTIVE', operationalStatus: 'ACTIVE' },
        new Date('2026-09-26T11:50:00.000Z'),
        now,
        300,
        86400,
        true,
      ),
    ).toBe('STALE');
    expect(
      calculateInventoryFreshness(
        { enrollmentStatus: 'ACTIVE', operationalStatus: 'ACTIVE' },
        new Date('2026-09-25T10:00:00.000Z'),
        now,
        300,
        86400,
        true,
      ),
    ).toBe('VERY_STALE');
    expect(
      calculateInventoryFreshness(
        { enrollmentStatus: 'ACTIVE', operationalStatus: 'ACTIVE' },
        new Date('2026-09-26T11:59:00.000Z'),
        now,
        300,
        86400,
        false,
      ),
    ).toBe('DISCONNECTED');
    expect(
      calculateInventoryFreshness(
        { enrollmentStatus: 'REVOKED', operationalStatus: 'REVOKED' },
        new Date('2026-09-26T11:59:00.000Z'),
        now,
        300,
        86400,
        true,
      ),
    ).toBe('REVOKED');
  });
});
