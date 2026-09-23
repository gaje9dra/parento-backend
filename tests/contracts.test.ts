import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  parseInput,
  validationErrorMetadata,
} from '../src/validation/index.js';

describe('validation foundation', () => {
  it('parses valid input through a schema', () => {
    const schema = z.object({ managedDeviceId: z.string().min(1) });
    expect(parseInput(schema, { managedDeviceId: 'device-1' })).toEqual({
      managedDeviceId: 'device-1',
    });
  });

  it('produces safe validation metadata', () => {
    const schema = z.object({ managedDeviceId: z.string().min(1) });
    try {
      schema.parse({ managedDeviceId: '' });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      expect(validationErrorMetadata(error as z.ZodError)).toHaveProperty(
        'issues',
      );
    }
  });
});
