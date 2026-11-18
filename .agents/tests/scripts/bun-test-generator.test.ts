import { expect, mock, test } from 'bun:test';
import {
  canonicalTestPathFor,
  command,
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
} from '../../scripts/bun-test-generator.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const run = async (
  args: readonly string[],
  write: (message: string) => void = () => undefined,
): Promise<void> => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  const code = await runCommand(command, [...args, '--format', 'text'], context);
  if (code !== 0) {
    throw new Error(out.join('\n'));
  }
  write(out[0] ?? '');
};

test('renders canonical test paths and validates Bun test sources', async () => {
  const write = mock();
  await run(['test-path', '/repo', '/repo/source.ts'], write);
  await run(['canonical-path', '/repo/source.ts', '/repo/package.json'], write);
  await run(['validate-source', 'import { test } from "bun:test"; test("x", () => {});'], write);
  await run(
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
  await run(
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
  await run(
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

test('rejects invalid input with a failure exit and the validator message', async () => {
  await expect(run(['validate-source', 'jest.fn()'])).rejects.toThrow('bun:test');
  await expect(run(['validate-boundaries', '{}'])).rejects.toThrow(
    'sutSource, testSource, and sutModuleSpecifier',
  );
  const base = {
    sutModuleSpecifier: './sut.js',
    sutSource: 'export const load = () => true;',
    testSource: "import { test } from 'bun:test';",
  };
  await expect(
    run(['validate-boundaries', JSON.stringify({ ...base, scope: 'unsupported' })]),
  ).rejects.toThrow('scope must be');
  await expect(
    run(['validate-boundaries', JSON.stringify({ ...base, preloadSource: 42 })]),
  ).rejects.toThrow('preloadSource must be a string');
});

test('rejects an unknown subcommand and a wrong argument count with usage exit 2', async () => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  expect(await runCommand(command, [], context)).toBe(2);
  expect(await runCommand(command, ['test-path', '/repo'], context)).toBe(2);
  expect(await runCommand(command, ['--help'], context)).toBe(0);
  expect(out.at(-1)).toContain('validate-boundaries');
});

test('accepts local and pure modules without mock.module and rejects bare side effects', () => {
  const pure = [
    "import path from 'node:path';",
    "import { now } from './clock.js';",
    'export const join = (value: string) => path.join(now(), value);',
  ].join('\n');
  const bare = "import { test } from 'bun:test'; test('x', () => expect(1).toBe(1));";
  expect(() => validateExternalDependencyMocks(pure, bare)).not.toThrow();
  const effectful =
    "import { readFile } from 'node:fs/promises'; export const load = () => readFile('x');";
  expect(() => validateExternalDependencyMocks(effectful, bare)).toThrow(
    'External module boundaries',
  );
});

test('accepts visible dependency injection as boundary isolation', () => {
  const sut = [
    "import { readFile } from 'node:fs/promises';",
    'export const load = (deps = { readFile }) => deps.readFile("x");',
  ].join('\n');
  const injected = [
    "import { expect, test } from 'bun:test';",
    "test('load', () => { const deps = { readFile: async () => 'ok' }; expect(deps).toBeTruthy(); });",
  ].join('\n');
  const noFake =
    "import { expect, test } from 'bun:test'; test('load', () => expect(load()).toBe(1));";
  expect(() => validateExternalDependencyMocks(sut, injected)).not.toThrow();
  expect(() => validateExternalDependencyMocks(sut, noFake)).toThrow('External module');
  expect(() =>
    validateExternalDependencyMocks('export const f = (value: string) => fetch(value);', injected),
  ).toThrow('fetch');
});

test('flags type suppression only in type positions', () => {
  const ok = "import { test } from 'bun:test'; test('rejects any directory', () => {});";
  expect(() => validateBunTestSource(ok)).not.toThrow();
  for (const bad of ['const x: any = 1;', 'const y = z as any;', '// @ts-ignore']) {
    expect(() => validateBunTestSource(`import { test } from 'bun:test'; ${bad}`)).toThrow(
      'suppress type checking',
    );
  }
});

test('reports a side-effect module that lacks its mock.module registration', () => {
  const sut =
    "import { readFile } from 'node:fs/promises'; export const load = () => readFile('x');";
  const unmocked =
    "import { mock, test } from 'bun:test'; test('x', () => expect(mock()).toBeTruthy());";
  expect(() => validateExternalDependencyMocks(sut, unmocked)).toThrow('node:fs/promises');
});

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
  expect(testPathFor('/repo/', '/repo/.agents/skill.ts')).toBe('/repo/tests/.agents/skill.test.ts');
  expect(() => testPathFor('/repo', '/other/file.ts')).toThrow('inside');
  expect(() => testPathFor('/repo', '/repo/file.txt')).toThrow('JavaScript');
  expect(
    projectRootFor('/repo/packages/a/file.ts', [
      '/repo/package.json',
      '/repo/packages/a/package.json',
    ]),
  ).toBe('/repo/packages/a');
  expect(() => projectRootFor('/repo/file.ts', [])).toThrow('package.json');
  expect(canonicalTestPathFor('/repo/a.ts', ['/repo/package.json'])).toBe('/repo/tests/a.test.ts');
  expect(jestTestPathsFor('/repo/tests/a.test.ts')).toContain('/repo/tests/a.test.js');
});
test('requires complete behavior-quality rows', () => {
  expect(() => validateBehaviorMatrix([])).toThrow('At least one');
  expect(() => validateBehaviorMatrix([row()])).not.toThrow();
  expect(() => validateBehaviorMatrix([row({ assertion: '' })])).toThrow('complete');
});

test('rejects Jest and type suppressions while requiring Bun APIs', () => {
  expect(() => validateBunTestSource('test("x", () => {})')).toThrow('bun:test');
  expect(() =>
    validateBunTestSource('test("x", () => {})', "import { describe } from 'bun:test';"),
  ).not.toThrow();
  expect(() => validateBunTestSource('test("x", () => {})', 'const clock = 1;')).toThrow(
    'bun:test',
  );
  expect(() => validateBunTestSource('import { test } from "bun:test"; jest.fn();')).toThrow(
    'Jest',
  );
  expect(() => validateBunTestSource('import { test } from "bun:test"; // @ts-ignore')).toThrow(
    'suppress',
  );
  expect(() =>
    validateBunTestSource('import { test } from "bun:test"; test("x", () => {});'),
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
    // biome-ignore lint/security/noSecrets: deterministic test or regex fixture content, not a credential
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
  expect(externalModuleSpecifiersFor(sutSource)).toEqual(['./clock.js', 'node:fs/promises']);
  expect(externalModuleSpecifiersFor("import { test } from 'bun:test';")).toEqual([]);
  expect(() => validateExternalDependencyMocks(sutSource, testSource)).not.toThrow();
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      `${testSource}\nmock.module('./sut.js', () => ({ load: mock() }));`,
      './sut.js',
    ),
  ).toThrow('selected SUT');
  expect(() => validateExternalDependencyMocks(sutSource, testSource, ' ')).toThrow(
    'must not be blank',
  );
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      testSource.replace("mock.module('./clock.js', () => ({ now: mock() }));\n", ''),
    ),
  ).not.toThrow();
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      testSource.replace('const consoleLog = mock();\n', '').replace('void consoleLog;\n', ''),
    ),
  ).toThrow('console');
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      testSource,
      undefined,
      'isolated-unit',
      "import { mock } from 'bun:test';",
    ),
  ).not.toThrow();
  expect(() =>
    validateExternalDependencyMocks(
      sutSource,
      testSource.replace("import { expect, mock, test } from 'bun:test';", ''),
      undefined,
      'isolated-unit',
    ),
  ).toThrow('mock import');
  expect(() =>
    validateExternalDependencyMocks(
      '/** @example console.log(result); */\nexport const id = (value: string): string => value;',
      "import { test } from 'bun:test'; test('x', () => {});",
    ),
  ).not.toThrow();
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
    validateExternalDependencyMocks(sutSource, sharedTest, './sut.js', 'shared-suite-integration'),
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
  expect(source).toContain('mock.module("./clock.js", () => ({\n  now: mock(),\n}));');
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
  expect(() => convertJestToBun("import { jest } from '@jest/globals'; jest.mock('x');")).toThrow(
    'explicit Bun mock',
  );
  expect(() => convertJestToBun('test("x", () => {})')).toThrow('@jest/globals');
});

test.each([
  {
    label: 'default parameter object',
    sut: "import { readFile } from 'node:fs/promises'; export const f = (deps = { readFile }) => deps;",
    test: "import { test } from 'bun:test'; test('x', () => { const deps = { readFile: async () => '' }; });",
  },
  {
    label: 'typed default parameter',
    sut: "import { readFile } from 'node:fs/promises'; export const f = (io: Io = { readFile }) => io;",
    test: "import { test } from 'bun:test'; test('x', () => { const io = { readFile: async () => '' }; });",
  },
  {
    label: 'property key fake',
    sut: "import { readFile } from 'node:fs/promises'; export const f = (deps = { readFile }) => deps;",
    test: "import { test } from 'bun:test'; test('x', () => f({ readFile: async () => '' }));",
  },
  {
    label: 'property wrapper',
    sut: "import { Glob } from 'bun'; export const f = () => ({ scan: (p) => new Glob(p).scan() });",
    test: "import { test } from 'bun:test'; test('x', () => { const scan = (p) => []; });",
  },
  {
    label: 'shorthand variable',
    sut: "import { readFile } from 'node:fs/promises'; export const f = (reader = readFile) => reader;",
    test: "import { test } from 'bun:test'; const reader = async () => ''; test('x', () => f({ reader }));",
  },
])('accepts per-boundary injection: $label', ({ sut, test: source }) => {
  expect(() => validateExternalDependencyMocks(sut, source)).not.toThrow();
});

test('a single injection does not exempt unrelated boundaries', () => {
  const sut = [
    "import { readFile } from 'node:fs/promises';",
    "import { spawnSync } from 'node:child_process';",
    'export const f = (deps = { readFile }) => deps;',
    'export const h = () => spawnSync("x");',
  ].join('\n');
  const source = [
    "import { mock, test } from 'bun:test';",
    "test('x', () => { const deps = { readFile: async () => '' }; });",
  ].join('\n');
  expect(() => validateExternalDependencyMocks(sut, source)).toThrow('node:child_process');
  expect(() =>
    validateExternalDependencyMocks(
      `${sut}\nexport const g = () => fetch("/x");`,
      `${source}\nmock.module('node:child_process', () => ({ spawnSync: mock() }));`,
    ),
  ).toThrow('fetch');
});

test('treats third-party packages as pure and bun or node side effects as boundaries', () => {
  const bare = "import { test } from 'bun:test'; test('x', () => {});";
  expect(() =>
    validateExternalDependencyMocks(
      "import matter from 'gray-matter'; export const m = matter;",
      bare,
    ),
  ).not.toThrow();
  for (const specifier of ['bun', 'bun:sqlite', 'node:os', 'axios']) {
    expect(() =>
      validateExternalDependencyMocks(`import x from '${specifier}'; export const v = x;`, bare),
    ).toThrow('External module boundaries');
  }
});

test('accepts a fake clock and counts only impure Date reads and string-free sources', () => {
  const clock =
    "import { setSystemTime, test } from 'bun:test'; setSystemTime(); test('x', () => {});";
  const bare = "import { test } from 'bun:test'; test('x', () => {});";
  expect(() =>
    validateExternalDependencyMocks('export const n = () => Date.now();', clock),
  ).not.toThrow();
  expect(() => validateExternalDependencyMocks('export const n = () => Date.now();', bare)).toThrow(
    'Date',
  );
  expect(() =>
    validateExternalDependencyMocks(
      "export const d = (v: string) => new Date(v); const p = 'process.js';",
      bare,
    ),
  ).not.toThrow();
});

test('ignores Jest, any, and filler text inside strings and comments', () => {
  const header = "import { test } from 'bun:test';";
  expect(() =>
    validateBunTestSource(
      `${header} const f = "import { jest } from '@jest/globals'; jest.fn(); x: any; .toBeDefined()"; // jest.fn()`,
    ),
  ).not.toThrow();
  expect(() => validateBunTestSource(`import { jest } from '@jest/globals';\n${header}`)).toThrow(
    'Jest',
  );
  expect(() => validateBunTestSource(`${header} jest.fn();`)).toThrow('Jest');
  expect(() => validateBunTestSource(`${header} expect(1).toBeDefined();`)).toThrow('filler');
});
