import { describe, expect, test } from 'bun:test';

import { failed, normalizePaths, passed } from '../../utils/contracts.js';

describe('contracts', () => {
  test('normalizes, deduplicates, and preserves supplied path order', () => {
    expect(normalizePaths([' /one ', '/two', '/one', ''])).toEqual([
      '/one',
      '/two',
    ]);
  });

  test('rejects an empty normalized path list', () => {
    expect(() => normalizePaths(['', ' '])).toThrow(
      'At least one path is required.',
    );
  });

  test('creates passed and failed check results', () => {
    expect(passed('lint', 'clean')).toEqual({
      detail: 'clean',
      name: 'lint',
      status: 'passed',
    });
    expect(failed('lint', 'error')).toEqual({
      detail: 'error',
      name: 'lint',
      status: 'failed',
    });
  });
});
