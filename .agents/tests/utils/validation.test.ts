import { describe, expect, test } from 'bun:test';

import { failed, passed } from '../../utils/contracts.js';
import {
  hasFailure,
  requirePassingChecks,
  summarizeChecks,
} from '../../utils/validation.js';

describe('validation', () => {
  test('accepts passed and not-applicable checks', () => {
    const results = [
      passed('lint', 'clean'),
      {
        detail: 'not relevant',
        name: 'types',
        status: 'not-applicable' as const,
      },
    ];
    expect(hasFailure(results)).toBeFalse();
    expect(() => requirePassingChecks(results)).not.toThrow();
  });

  test.each([
    { detail: 'error', name: 'lint', status: 'failed' as const },
    { detail: 'waiting', name: 'lint', status: 'blocked' as const },
  ])('detects a non-passing check', (result) => {
    expect(hasFailure([result])).toBeTrue();
    expect(() => requirePassingChecks([result])).toThrow('lint');
  });

  test('summarizes all checks', () => {
    expect(
      summarizeChecks([passed('lint', 'clean'), failed('test', 'failure')]),
    ).toBe('lint: passed — clean\ntest: failed — failure');
  });
});
