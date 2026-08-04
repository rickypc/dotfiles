import { expect, mock, test } from 'bun:test';

const canonicalTestPathFor = mock(() => '/repo/tests/source.test.ts');
const convertJestToBun = mock(() => "import { test } from 'bun:test';");
const renderBunTestTemplate = mock(() => 'rendered template');
const testPathFor = mock(() => '/repo/tests/source.test.ts');
const validateBunTestSource = mock((source: string) => {
  if (source.includes('jest.fn')) {
    throw new Error('bun:test');
  }
});
const validateExternalDependencyMocks = mock(
  (sutSource: string, testSource: string) => {
    if (!sutSource || !testSource) {
      throw new Error('sutSource and testSource');
    }
  },
);

mock.module('../utils/bun-test-generator.js', () => ({
  canonicalTestPathFor,
  convertJestToBun,
  renderBunTestTemplate,
  testPathFor,
  validateBunTestSource,
  validateExternalDependencyMocks,
}));
mock.module('../utils/cli.js', () => ({
  runWhenMain: (
    isMain: boolean,
    args: readonly string[],
    runner: (runnerArgs: readonly string[]) => void,
  ) => {
    if (isMain) {
      runner(args);
    }
  },
}));

const { run, runWhenMain, usage } = await import(
  '../../scripts/bun-test-generator.js'
);

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
    'sutSource, testSource, and sutModuleSpecifier',
  );
  expect(() => run([])).toThrow(usage());
  const runner = mock();
  runWhenMain(true, ['test-path', '/repo', '/repo/source.ts'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
