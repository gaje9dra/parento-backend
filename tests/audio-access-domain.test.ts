import { describe, expect, it } from 'vitest';
import {
  isTerminalAudioAccessStatus,
  isValidAudioAccessTransition,
} from '../src/domain/audio-access-session.js';

describe('Phase 10.1 audio-access state machine', () => {
  it('accepts the documented lifecycle transitions', () => {
    expect(isValidAudioAccessTransition('REQUESTED', 'AUTHORIZED')).toBe(true);
    expect(isValidAudioAccessTransition('AUTHORIZED', 'STARTING')).toBe(true);
    expect(isValidAudioAccessTransition('STARTING', 'ACTIVE')).toBe(true);
    expect(isValidAudioAccessTransition('ACTIVE', 'STOPPING')).toBe(true);
    expect(isValidAudioAccessTransition('STOPPING', 'STOPPED')).toBe(true);
    expect(isValidAudioAccessTransition('ACTIVE', 'EXPIRED')).toBe(true);
    expect(isValidAudioAccessTransition('STARTING', 'FAILED')).toBe(true);
  });

  it('rejects resurrection and out-of-order transitions', () => {
    expect(isValidAudioAccessTransition('STOPPED', 'ACTIVE')).toBe(false);
    expect(isValidAudioAccessTransition('EXPIRED', 'STARTING')).toBe(false);
    expect(isValidAudioAccessTransition('REJECTED', 'ACTIVE')).toBe(false);
    expect(isValidAudioAccessTransition('AUTHORIZED', 'ACTIVE')).toBe(false);
  });

  it('keeps terminal states terminal', () => {
    for (const status of [
      'STOPPED',
      'EXPIRED',
      'FAILED',
      'REJECTED',
    ] as const) {
      expect(isTerminalAudioAccessStatus(status)).toBe(true);
    }
  });
});
