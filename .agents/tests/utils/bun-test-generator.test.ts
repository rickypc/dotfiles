import { expect, test } from 'bun:test';

import {
  canonicalTestPathFor,
  convertJestToBun,
  externalModuleSpecifiersFor,
  jestTestPathsFor,
  projectRootFor,
  renderBunTestTemplate,
  requireDataProvider,
  testPathFor,
  validateBehaviorMatrix,
  validateBunTestSource,
  validateExternalDependencyMocks,
} from '../../utils/bun-test-generator.js';

const row = (overrides = {}) => ({
  assertion: 'test.each(cases)',
  boundary: 'null',
  condition: 'input is null',
  externalMock: 'mock()',
  outcome: 'throws',
  path: 'error',
  selectedBehavior: 'parse',
  ...overrides,
});

test('derives canonical TypeScript test paths', () => {
  expect(testPathFor('/repo', '/repo/assets/js/api-client.js')).toBe(
    '/repo/tests/assets/js/api-client.test.ts',
  );
  expect(testPathFor('/repo/', '/repo/.agents/skill.ts')).toBe(
    '/repo/tests/.agents/skill.test.ts',
  );
  expect(() => testPathFor('/repo', '/other/file.ts')).toThrow('inside');
  expect(() => testPathFor('/repo', '/repo/file.txt')).toThrow('JavaScript');
  expect(
    projectRootFor('/repo/packages/a/file.ts', [
      '/repo/package.json',
      '/repo/packages/a/package.json',
    ]),
  ).toBe('/repo/packages/a');
  expect(() => projectRootFor('/repo/file.ts', [])).toThrow('package.json');
  expect(canonicalTestPathFor('/repo/a.ts', ['/repo/package.json'])).toBe(
    '/repo/tests/a.test.ts',
  );
  expect(jestTestPathsFor('/repo/tests/a.test.ts')).toContain(
    '/repo/tests/a.test.js',
  );
});
test('requires complete behavior-quality rows', () => {
  expect(() => validateBehaviorMatrix([])).toThrow('At least one');
  expect(() => validateBehaviorMatrix([row()])).not.toThrow();
  expect(() => validateBehaviorMatrix([row({ assertion: '' })])).toThrow(
    'complete',
  );
});

test('rejects Jest and type suppressions while requiring Bun APIs', () => {
  expect(() => validateBunTestSource('test("x", () => {})')).toThrow(
    'bun:test',
  );
  expect(() =>
    validateBunTestSource('import { test } from "bun:test"; jest.fn();'),
  ).toThrow('Jest');
  expect(() =>
    validateBunTestSource('import { test } from "bun:test"; // @ts-ignore'),
  ).toThrow('suppress');
  expect(() =>
    validateBunTestSource(
      'import { test } from "bun:test"; test("x", () => {});',
    ),
  ).not.toThrow();
  expect(() =>
    validateBunTestSource(
      'import { expect, test } from "bun:test"; test("x", () => expect(1).toBeDefined());',
    ),
  ).toThrow('filler');
  expect(() =>
    requireDataProvider([
      row({ assertion: 'expect(true).toBeTrue()' }),
      row({ assertion: 'expect(false).toBeFalse()' }),
    ]),
  ).toThrow('test.each');
  expect(() => requireDataProvider([row()])).not.toThrow();
});

test('requires mocks for every external SUT module and global boundary', () => {
  const sutSource = [
    "import { readFile } from 'node:fs/promises';",
    "import { now } from './clock.js';",
    'export const load = async () => {',
    "  console.log(now(), await readFile('input'));",
    '  return fetch("/status");',
    '};',
  ].join('\n');
  const testSource = [
    "import { expect, mock, test } from 'bun:test';",
    '',
    "mock.module('./clock.js', () => ({ now: mock() }));",
    "mock.module('node:fs/promises', () => ({ readFile: mock() }));",
    'const consoleLog = mock();',
    'const fetchMock = mock();',
    'void consoleLog;',
    'void fetchMock;',
    '',
    "test('load', () => expect(true).toBeTrue());",
  ].join('\n');
  expect(externalModuleSpecifiersFor(sutSource)).toEqual([
    './clock.js',
    'node:fs/promises',
  ]);
  expect(
    externalModuleSpecifiersFor("import { test } from 'bun:test';"),
  ).toEqual([]);
  expect(() =>
    validateExternalDependencyMocks(sutSource, testSource),
  ).not.toThrow();
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      `${testSource}\nmock.module('./sut.js', () => ({ load: mock() }));`,
      './sut.js',
    ),
  ).toThrow('selected SUT');
  expect(() =>
    validateExternalDependencyMocks(sutSource, testSource, ' '),
  ).toThrow('must not be blank');
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      testSource.replace(
        "mock.module('./clock.js', () => ({ now: mock() }));\n",
        '',
      ),
    ),
  ).toThrow('./clock.js');
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      testSource
        .replace('const consoleLog = mock();\n', '')
        .replace('void consoleLog;\n', ''),
    ),
  ).toThrow('console');
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      testSource.replace(
        "import { expect, mock, test } from 'bun:test';",
        "import { expect, test } from 'bun:test';",
      ),
    ),
  ).toThrow('mock import');
});

test('protects shared Bun suites from local helper mock contamination', () => {
  const sutSource = [
    "import { readFile } from 'node:fs/promises';",
    "import { now } from './clock.js';",
    'export const load = () => now();',
  ].join('\n');
  const sharedTest = [
    "import { expect, test } from 'bun:test';",
    "test('load', () => expect(true).toBeTrue());",
  ].join('\n');
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      sharedTest,
      './sut.js',
      'shared-suite-integration',
    ),
  ).toThrow('External module boundaries');
  const withExternalMock = [
    "import { expect, mock, test } from 'bun:test';",
    "mock.module('node:fs/promises', () => ({ readFile: mock() }));",
    "test('load', () => expect(true).toBeTrue());",
  ].join('\n');
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      withExternalMock,
      './sut.js',
      'shared-suite-integration',
    ),
  ).not.toThrow();
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      `${withExternalMock}\nmock.module('./clock.js', () => ({ now: mock() }));`,
      './sut.js',
      'shared-suite-integration',
    ),
  ).toThrow('must not mock local modules');
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      withExternalMock,
      './sut.js',
      'unsupported' as 'isolated-unit',
    ),
  ).toThrow('Unsupported Bun test scope');
});

test('renders quality-focused templates and converts supported Jest tests', () => {
  const source = renderBunTestTemplate({
    actualExpression: 'sut.parse(input)',
    cases: [{ expected: 'empty', input: null, label: 'null input' }],
    externalMocks: [{ exports: ['now'], specifier: './clock.js' }],
    importPath: './sut.js',
    matcher: 'toEqual',
  });
  expect(source).toContain('test.each');
  expect(source).toContain(
    'mock.module("./clock.js", () => ({\n  now: mock(),\n}));',
  );
  expect(source).toContain("import { expect, mock, test } from 'bun:test';");
  expect(source).not.toContain('as const');
  expect(source).not.toContain('toBeDefined');
  expect(() =>
    renderBunTestTemplate({
      actualExpression: 'parse(input)',
      cases: [{ expected: 'empty', input: null, label: 'null input' }],
      externalMocks: [],
      importPath: './sut.js',
      matcher: 'toEqual',
    }),
  ).toThrow('actual expression');
  expect(() =>
    renderBunTestTemplate({
      actualExpression: 'sut.parse(input)',
      cases: [],
      externalMocks: [],
      importPath: './sut.js',
      matcher: 'toEqual',
    }),
  ).toThrow('cases');
  expect(() =>
    renderBunTestTemplate({
      actualExpression: 'sut.parse(input)',
      cases: [{ expected: 'empty', input: null, label: '' }],
      externalMocks: [],
      importPath: './sut.js',
      matcher: 'toEqual',
    }),
  ).toThrow('label');
  expect(() =>
    renderBunTestTemplate({
      actualExpression: 'sut.parse(input)',
      cases: [{ expected: 'empty', input: null, label: 'null input' }],
      externalMocks: [{ exports: [], specifier: '' }],
      importPath: './sut.js',
      matcher: 'toEqual',
    }),
  ).toThrow('module specifier');
  expect(() =>
    renderBunTestTemplate({
      actualExpression: 'sut.parse(input)',
      cases: [{ expected: 'empty', input: null, label: 'null input' }],
      externalMocks: [
        { exports: [], specifier: './clock.js' },
        { exports: [], specifier: './clock.js' },
      ],
      importPath: './sut.js',
      matcher: 'toEqual',
    }),
  ).toThrow('duplicate');
  expect(() =>
    renderBunTestTemplate({
      actualExpression: 'sut.parse(input)',
      cases: [{ expected: 'empty', input: null, label: 'null input' }],
      externalMocks: [{ exports: ['not-valid!'], specifier: './clock.js' }],
      importPath: './sut.js',
      matcher: 'toEqual',
    }),
  ).toThrow('invalid export');
  expect(() =>
    renderBunTestTemplate({
      actualExpression: 'sut.parse(input)',
      cases: [{ expected: 'empty', input: null, label: 'null input' }],
      externalMocks: [{ exports: ['parse'], specifier: './sut.js' }],
      importPath: './sut.js',
      matcher: 'toEqual',
    }),
  ).toThrow('selected SUT');
  expect(
    convertJestToBun(
      "import { expect, jest, test } from '@jest/globals'; test('x', () => expect(jest.fn()).toBeTruthy());",
    ),
  ).toContain("import { expect, mock, test } from 'bun:test';");
  expect(
    convertJestToBun(
      "import { expect, test } from '@jest/globals'; test('x', () => expect(jest.fn()).toBeTruthy());",
    ),
  ).toContain('mock()');
  expect(() =>
    convertJestToBun("import { jest } from '@jest/globals'; jest.mock('x');"),
  ).toThrow('explicit Bun mock');
  expect(() => convertJestToBun('test("x", () => {})')).toThrow(
    '@jest/globals',
  );
});
