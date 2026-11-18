import { expect, test } from 'bun:test';

import { EXIT_CODES } from '../../../utils/cli/exit-codes.js';

test('defines one exit table of success, failure, and usage error', () => {
  expect(EXIT_CODES).toEqual({ failure: 1, success: 0, usage: 2 });
});
