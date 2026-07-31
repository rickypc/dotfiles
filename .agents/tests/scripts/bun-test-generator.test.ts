import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/bun-test-generator.js';

test('renders canonical test paths and validates Bun test sources', () => {
  const write = mock();
  run(['test-path', '/repo', '/repo/source.ts'], write);
  run(['canonical-path', '/repo/source.ts', '/repo/package.json'], write);
  run(
    [
      'validate-source',
      'import { test } from "bun:test"; test("x", () => {});',
    ],
    write,
  );
  run(
    [
      'validate-boundaries',
      JSON.stringify({
        sutSource:
          "import { readFile } from 'node:fs/promises'; export const load = () => readFile('input');",
        testSource:
          "import { mock, test } from 'bun:test'; mock.module('node:fs/promises', () => ({ readFile: mock() })); test('load', () => {});",
      }),
    ],
    write,
  );
  run(
    [
      'template',
      JSON.stringify({
        actualExpression: 'sut.parse(input)',
        cases: [{ expected: 'ok', input: '', label: 'empty' }],
        importPath: './sut.js',
        matcher: 'toEqual',
      }),
    ],
    write,
  );
  run(
    [
      'convert-jest',
      "import { jest, test } from '@jest/globals'; test('x', () => jest.fn());",
    ],
    write,
  );
  expect(write.mock.calls).toEqual([
    ['/repo/tests/source.test.ts'],
    ['/repo/tests/source.test.ts'],
    ['bun-test-source: passed'],
    ['bun-test-boundaries: passed'],
    [expect.stringContaining('test.each')],
    [expect.stringContaining("from 'bun:test'")],
  ]);
});

test('rejects invalid input and guards the main boundary', () => {
  expect(() => run(['validate-source', 'jest.fn()'])).toThrow('bun:test');
  expect(() => run(['validate-boundaries', '{}'])).toThrow(
    'sutSource and testSource',
  );
  expect(() => run([])).toThrow(usage());
  const runner = mock();
  runWhenMain(true, ['test-path', '/repo', '/repo/source.ts'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
