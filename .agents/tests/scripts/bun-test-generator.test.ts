import { expect, mock, test } from 'bun:test';

import {
  run,
  runWhenMain,
  usage,
  validateExternalDependencyMocks,
} from '../../scripts/bun-test-generator.js';

test('renders canonical test paths and validates Bun test sources', () => {
  const write = mock();
  run(['test-path', '/repo', '/repo/source.ts'], write);
  run(['canonical-path', '/repo/source.ts', '/repo/package.json'], write);
  run(['validate-source', 'import { test } from "bun:test"; test("x", () => {});'], write);
  run(
    [
      'validate-boundaries',
      JSON.stringify({
        sutModuleSpecifier: './sut.js',
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
        externalMocks: [],
        importPath: './sut.js',
        matcher: 'toEqual',
      }),
    ],
    write,
  );
  run(
    ['convert-jest', "import { jest, test } from '@jest/globals'; test('x', () => jest.fn());"],
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

test.each([
  { label: 'newline', source: '// fetch() is commented out\nexport const value = 1;' },
  { label: 'end of input', source: '// fetch() is commented out' },
])('ignores fetch in a line comment at $label', ({ source }) => {
  expect(() =>
    validateExternalDependencyMocks(
      source,
      "import { test } from 'bun:test'; test('boundary scan', () => {});",
    ),
  ).not.toThrow();
});

test('rejects invalid input and guards the main boundary', async () => {
  expect(() => run(['validate-source', 'jest.fn()'])).toThrow('bun:test');
  expect(() => run(['validate-boundaries', '{}'])).toThrow(
    'sutSource, testSource, and sutModuleSpecifier',
  );
  expect(() =>
    run([
      'validate-boundaries',
      JSON.stringify({
        scope: 'unsupported',
        sutModuleSpecifier: './sut.js',
        sutSource: 'export const load = () => true;',
        testSource: "import { test } from 'bun:test';",
      }),
    ]),
  ).toThrow('scope must be');
  expect(() =>
    run([
      'validate-boundaries',
      JSON.stringify({
        preloadSource: 42,
        sutModuleSpecifier: './sut.js',
        sutSource: 'export const load = () => true;',
        testSource: "import { test } from 'bun:test';",
      }),
    ]),
  ).toThrow('preloadSource must be a string');
  expect(() => run([])).toThrow(usage());
  const runner = mock();
  await runWhenMain(true, ['test-path', '/repo', '/repo/source.ts'], runner);
  await runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
