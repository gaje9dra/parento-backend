import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ENFORCEMENT_STATUSES,
  isValidAndroidPackageName,
} from '../src/domain/application-management.js';

describe('application management domain', () => {
  it('accepts normalized Android package names', () => {
    expect(isValidAndroidPackageName('com.example.app')).toBe(true);
    expect(isValidAndroidPackageName('com.example_2.app3')).toBe(true);
  });

  it('rejects display names and malformed package identifiers', () => {
    expect(isValidAndroidPackageName('Example App')).toBe(false);
    expect(isValidAndroidPackageName('com')).toBe(false);
    expect(isValidAndroidPackageName('com..example.app')).toBe(false);
    expect(isValidAndroidPackageName('com.example/app')).toBe(false);
  });

  it('keeps the enforcement status vocabulary explicit', () => {
    expect(APPLICATION_ENFORCEMENT_STATUSES).toEqual([
      'UNKNOWN',
      'PENDING',
      'APPLIED',
      'PARTIALLY_APPLIED',
      'FAILED',
      'STALE',
    ]);
  });
});
