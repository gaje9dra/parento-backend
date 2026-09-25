import { describe, expect, it } from 'vitest';
import { isTerminalCommandStatus, isValidCommandTransition } from '../src/domain/command.js';

describe('Phase 6.1 command state machine', () => {
  it('accepts only documented forward lifecycle transitions', () => {
    expect(isValidCommandTransition('CREATED', 'QUEUED')).toBe(true);
    expect(isValidCommandTransition('QUEUED', 'DELIVERING')).toBe(true);
    expect(isValidCommandTransition('DELIVERED', 'ACKNOWLEDGED')).toBe(true);
    expect(isValidCommandTransition('ACKNOWLEDGED', 'RUNNING')).toBe(true);
    expect(isValidCommandTransition('RUNNING', 'SUCCEEDED')).toBe(true);
    expect(isValidCommandTransition('RUNNING', 'FAILED')).toBe(true);
  });

  it('rejects replay and out-of-order transitions', () => {
    expect(isValidCommandTransition('SUCCEEDED', 'RUNNING')).toBe(false);
    expect(isValidCommandTransition('FAILED', 'ACKNOWLEDGED')).toBe(false);
    expect(isValidCommandTransition('CANCELLED', 'QUEUED')).toBe(false);
    expect(isValidCommandTransition('DELIVERED', 'RUNNING')).toBe(false);
  });

  it('keeps terminal states terminal', () => {
    for (const status of ['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REJECTED'] as const) {
      expect(isTerminalCommandStatus(status)).toBe(true);
    }
  });
});
