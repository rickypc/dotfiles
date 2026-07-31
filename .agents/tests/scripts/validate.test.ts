import { expect, mock, test } from 'bun:test';

import { parseCheck, run, runWhenMain, usage } from '../../scripts/validate.js';

test('parses and renders passing validation evidence', () => {
  expect(parseCheck('biome:passed:clean')).toEqual({
    detail: 'clean',
    name: 'biome',
    status: 'passed',
  });
  const write = mock();
  run(['biome:passed:clean', 'tsc:not-applicable:JavaScript'], write);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('biome: passed'));
});

test('rejects invalid or failed validation evidence', () => {
  expect(() => parseCheck('bad')).toThrow('Invalid');
  expect(() => run(['biome:failed:bad'])).toThrow('biome');
  expect(() => run([])).toThrow(usage());
  const runner = mock();
  runWhenMain(true, ['biome:passed:clean'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
