import { describe, expect, it } from 'vitest';
import { getMonitoringFreshness } from '../src/domain/device-monitoring.js';

describe('Phase 7 monitoring freshness', () => {
  const now = new Date('2026-09-25T10:00:00.000Z');

  it('classifies fresh, stale and very stale deterministically', () => {
    expect(
      getMonitoringFreshness(
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          sessionState: 'CONNECTED',
          observedAt: new Date(now.getTime() - 60_000),
        },
        { staleSeconds: 300, veryStaleSeconds: 86_400 },
        now,
      ),
    ).toBe('FRESH');
    expect(
      getMonitoringFreshness(
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          sessionState: 'CONNECTED',
          observedAt: new Date(now.getTime() - 360_000),
        },
        { staleSeconds: 300, veryStaleSeconds: 86_400 },
        now,
      ),
    ).toBe('STALE');
    expect(
      getMonitoringFreshness(
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          sessionState: 'CONNECTED',
          observedAt: new Date(now.getTime() - 86_400_000),
        },
        { staleSeconds: 300, veryStaleSeconds: 86_400 },
        now,
      ),
    ).toBe('VERY_STALE');
  });

  it('keeps revoked and offline states distinct from freshness age', () => {
    expect(
      getMonitoringFreshness(
        {
          enrollmentStatus: 'REVOKED',
          operationalStatus: 'REVOKED',
          sessionState: 'EXPIRED',
          observedAt: now,
        },
        { staleSeconds: 300, veryStaleSeconds: 86_400 },
        now,
      ),
    ).toBe('REVOKED');
    expect(
      getMonitoringFreshness(
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          sessionState: 'DISCONNECTED',
          observedAt: now,
        },
        { staleSeconds: 300, veryStaleSeconds: 86_400 },
        now,
      ),
    ).toBe('OFFLINE');
  });

  it('does not call never-reported data fresh', () => {
    expect(
      getMonitoringFreshness(
        {
          enrollmentStatus: 'ACTIVE',
          operationalStatus: 'ACTIVE',
          sessionState: null,
          observedAt: null,
        },
        { staleSeconds: 300, veryStaleSeconds: 86_400 },
        now,
      ),
    ).toBe('NEVER_REPORTED');
  });
});
