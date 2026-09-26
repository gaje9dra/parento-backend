import { describe, expect, it } from 'vitest';
import {
  isTerminalScreenSharingStatus,
  isValidScreenSharingTransition,
} from '../src/domain/screen-sharing-session.js';

describe('Phase 9.1 screen-sharing state machine', () => {
  it('accepts the documented lifecycle transitions', () => {
    expect(isValidScreenSharingTransition('REQUESTED', 'AUTHORIZED')).toBe(
      true,
    );
    expect(isValidScreenSharingTransition('AUTHORIZED', 'STARTING')).toBe(true);
    expect(isValidScreenSharingTransition('STARTING', 'ACTIVE')).toBe(true);
    expect(isValidScreenSharingTransition('ACTIVE', 'STOPPING')).toBe(true);
    expect(isValidScreenSharingTransition('STOPPING', 'STOPPED')).toBe(true);
    expect(isValidScreenSharingTransition('ACTIVE', 'EXPIRED')).toBe(true);
    expect(isValidScreenSharingTransition('STARTING', 'FAILED')).toBe(true);
  });

  it('rejects resurrection and out-of-order transitions', () => {
    expect(isValidScreenSharingTransition('STOPPED', 'ACTIVE')).toBe(false);
    expect(isValidScreenSharingTransition('EXPIRED', 'STARTING')).toBe(false);
    expect(isValidScreenSharingTransition('FAILED', 'STOPPING')).toBe(false);
    expect(isValidScreenSharingTransition('AUTHORIZED', 'ACTIVE')).toBe(false);
  });

  it('keeps terminal states terminal', () => {
    for (const status of [
      'STOPPED',
      'EXPIRED',
      'FAILED',
      'REJECTED',
    ] as const) {
      expect(isTerminalScreenSharingStatus(status)).toBe(true);
    }
  });
});
