import { describe, expect, it } from 'vitest';
import { COMMAND_TYPES } from '../src/domain/command.js';

describe('Phase 11.1 command allowlist', () => {
  it('contains only the two application-management command additions', () => {
    expect(COMMAND_TYPES).toContain('SYNC_APPLICATION_POLICY');
    expect(COMMAND_TYPES).toContain('REQUEST_APPLICATION_INVENTORY');
    expect(COMMAND_TYPES).not.toContain('EXECUTE_SHELL');
    expect(COMMAND_TYPES).not.toContain('RUN_APK');
  });
});
