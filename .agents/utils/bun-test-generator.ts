export interface BehaviorMatrixRow {
  readonly assertion: string;
  readonly boundary: string;
  readonly condition: string;
  readonly externalMock: string;
  readonly outcome: string;
  readonly path: string;
  readonly selectedBehavior: string;
}

interface BunTestExternalMock {
  readonly exports: readonly string[];
  readonly specifier: string;
}

export interface BunTestTemplate {
  readonly actualExpression: string;
  readonly cases: readonly {
    readonly expected: unknown;
    readonly input: unknown;
    readonly label: string;
  }[];
  readonly externalMocks: readonly BunTestExternalMock[];
  readonly importPath: string;
  readonly matcher: 'toBe' | 'toEqual';
}

const sourceExtension = /\.(?:[cm]?[jt]sx?)$/u;

const isBelow = (root: string, path: string): boolean =>
  path === root || path.startsWith(`${root}/`);

const normalizedPath = (path: string): string => path.replace(/\/$/u, '');

export const projectRootFor = (
  sutPath: string,
  packageJsonPaths: readonly string[],
): string => {
  const roots = packageJsonPaths
    .filter((path) => path.endsWith('/package.json'))
    .map((path) => normalizedPath(path.slice(0, -'/package.json'.length)))
    .filter((root) => isBelow(root, sutPath))
    .sort((left, right) => right.length - left.length);
  const root = roots[0];
  if (!root) {
    throw new Error('No package.json root contains the SUT.');
  }
  return root;
};

export const testPathFor = (projectRoot: string, sutPath: string): string => {
  const prefix = `${projectRoot.replace(/\/$/u, '')}/`;
  if (!sutPath.startsWith(prefix)) {
    throw new Error('SUT must be inside the project root.');
  }
  const relative = sutPath.slice(prefix.length).replace(sourceExtension, '');
  if (!relative || relative === sutPath.slice(prefix.length)) {
    throw new Error('SUT must be a JavaScript or TypeScript file.');
  }
  return `${projectRoot.replace(/\/$/u, '')}/tests/${relative}.test.ts`;
};

export const validateBehaviorMatrix = (
  rows: readonly BehaviorMatrixRow[],
): void => {
  if (rows.length === 0) {
    throw new Error('At least one behavior matrix row is required.');
  }
  for (const row of rows) {
    if (Object.values(row).some((value) => !value.trim())) {
      throw new Error('Behavior matrix rows must be complete.');
    }
  }
};

const jestApi =
  /\b(?:jest\.|describe\.(?:only|skip)|it\.(?:only|skip))|from ['"]@jest\/globals['"]/u;
const bunImport = /from ['"]bun:test['"]/u;
const bunMockImport =
  /import\s*\{[^}]*\bmock\b[^}]*\}\s*from\s*['"]bun:test['"]/u;
const testEach = /test\.each\(/u;
const moduleSpecifier =
  /(?:\bfrom\s*|\b(?:import|require)\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/gu;

const globalBoundaries = [
  ['Bun', /\bBun\./u],
  ['Date', /\b(?:new\s+Date|Date\.)/u],
  ['Math.random', /\bMath\.random\s*\(/u],
  ['console', /\bconsole\./u],
  ['crypto', /\bcrypto\./u],
  ['fetch', /\bfetch\s*\(/u],
  ['process', /\bprocess\./u],
  ['timers', /\b(?:setInterval|setTimeout|clearInterval|clearTimeout)\s*\(/u],
] as const;

export const canonicalTestPathFor = (
  sutPath: string,
  packageJsonPaths: readonly string[],
): string => testPathFor(projectRootFor(sutPath, packageJsonPaths), sutPath);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const externalModuleSpecifiersFor = (
  source: string,
): readonly string[] =>
  [
    ...new Set(
      [...source.matchAll(moduleSpecifier)]
        .map((match) => match[1])
        .filter((specifier): specifier is string => Boolean(specifier)),
    ),
  ]
    .filter((specifier) => specifier !== 'bun:test')
    .sort((left, right) => left.localeCompare(right, 'en'));

export const jestTestPathsFor = (canonicalPath: string): readonly string[] => {
  const stem = canonicalPath.replace(/\.test\.ts$/u, '');
  return [
    `${stem}.test.js`,
    `${stem}.spec.js`,
    `${stem}.test.ts`,
    `${stem}.spec.ts`,
  ];
};

const mockedModuleSpecifiersFor = (source: string): readonly string[] =>
  [...source.matchAll(/\bmock\.module\(\s*['"]([^'"]+)['"]/gu)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier));

export const requireDataProvider = (
  rows: readonly BehaviorMatrixRow[],
): void => {
  const repeated = new Map<string, number>();
  for (const row of rows) {
    repeated.set(
      row.selectedBehavior,
      (repeated.get(row.selectedBehavior) ?? 0) + 1,
    );
  }
  if (
    [...repeated.values()].some((count) => count > 1) &&
    !testEach.test(rows.map((row) => row.assertion).join('\n'))
  ) {
    throw new Error('Repeated behavior partitions must use test.each.');
  }
};

export const validateBunTestSource = (source: string): void => {
  if (!bunImport.test(source)) {
    throw new Error('Generated tests must import from bun:test.');
  }
  if (jestApi.test(source)) {
    throw new Error('Generated tests must not contain Jest APIs.');
  }
  if (/\b(?:any|ts-ignore|ts-expect-error)\b/u.test(source)) {
    throw new Error('Generated tests must not suppress type checking.');
  }
  if (/\bvoid\s+sut\b/u.test(source) || /\.toBeDefined\(\)/u.test(source)) {
    throw new Error('Generated tests must not use filler assertions.');
  }
};

export const convertJestToBun = (source: string): string => {
  if (/\bjest\.(?:mock|resetModules|isolateModules)\b/u.test(source)) {
    throw new Error(
      'This Jest module behavior needs an explicit Bun mock conversion.',
    );
  }
  const importMatch =
    /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]@jest\/globals['"];?/u.exec(
      source,
    );
  if (!importMatch) {
    throw new Error('Jest conversion requires an @jest/globals import.');
  }
  const imports = importMatch[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value === 'jest' ? 'mock' : value));
  if (!imports.includes('mock') && /\bjest\.fn\(/u.test(source)) {
    imports.push('mock');
  }
  const converted = source
    .replace(
      importMatch[0],
      `import { ${[...new Set(imports)].join(', ')} } from 'bun:test';`,
    )
    .replaceAll('jest.fn(', 'mock(');
  validateBunTestSource(converted);
  return converted;
};

export const validateExternalDependencyMocks = (
  sutSource: string,
  testSource: string,
  sutModuleSpecifier?: string,
): void => {
  if (sutModuleSpecifier !== undefined && !sutModuleSpecifier.trim()) {
    throw new Error('The selected SUT module specifier must not be blank.');
  }
  if (
    sutModuleSpecifier &&
    mockedModuleSpecifiersFor(testSource).includes(sutModuleSpecifier)
  ) {
    throw new Error(
      `The selected SUT ${sutModuleSpecifier} must remain real and must not be mocked.`,
    );
  }
  const externalModules = externalModuleSpecifiersFor(sutSource);
  if (externalModules.length > 0 && !bunMockImport.test(testSource)) {
    throw new Error(
      'External module boundaries require mock.module() and a mock import from bun:test.',
    );
  }
  const missingModules = externalModules.filter(
    (specifier) =>
      !new RegExp(
        `\\bmock\\.module\\(\\s*['"]${escapeRegExp(specifier)}['"]`,
        'u',
      ).test(testSource),
  );
  const missingGlobals = globalBoundaries
    .filter(([, pattern]) => pattern.test(sutSource))
    .filter(([name]) => {
      const root = name.split('.')[0] ?? name;
      const mockPattern = new RegExp(
        `${escapeRegExp(root)}[\\s\\S]*?\\bmock\\s*\\(|\\bmock\\s*\\([\\s\\S]*?${escapeRegExp(root)}`,
        'u',
      );
      return !mockPattern.test(testSource);
    })
    .map(([name]) => name);
  const missing = [
    ...(missingModules.length > 0
      ? [
          `mock.module() for SUT module dependencies: ${missingModules.join(', ')}`,
        ]
      : []),
    ...(missingGlobals.length > 0
      ? [`mock() for SUT global boundaries: ${missingGlobals.join(', ')}`]
      : []),
  ];
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join('; ')}.`);
  }
};

const validateExternalMockDefinitions = (
  externalMocks: readonly BunTestExternalMock[],
  sutModuleSpecifier?: string,
): void => {
  const mockSpecifiers = new Set<string>();
  for (const externalMock of externalMocks) {
    if (!externalMock.specifier.trim()) {
      throw new Error('Every external mock needs a module specifier.');
    }
    if (mockSpecifiers.has(externalMock.specifier)) {
      throw new Error(
        `External module ${externalMock.specifier} has duplicate mocks.`,
      );
    }
    mockSpecifiers.add(externalMock.specifier);
    if (externalMock.specifier === sutModuleSpecifier) {
      throw new Error(
        `The selected SUT ${sutModuleSpecifier} must remain real and must not be mocked.`,
      );
    }
    if (
      externalMock.exports.some(
        (exportName) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(exportName),
      )
    ) {
      throw new Error(
        `External mock ${externalMock.specifier} has an invalid export name.`,
      );
    }
  }
};

const validateBunTestTemplate = (template: BunTestTemplate): void => {
  if (!template.importPath.trim() || template.cases.length === 0) {
    throw new Error('Bun test template needs an import path and cases.');
  }
  if (
    !/^sut(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+\(input\)$/u.test(
      template.actualExpression,
    )
  ) {
    throw new Error(
      'Bun test actual expression must call the imported SUT with input.',
    );
  }
  if (template.cases.some((item) => !item.label.trim())) {
    throw new Error('Every Bun test case needs a label.');
  }
  validateExternalMockDefinitions(template.externalMocks, template.importPath);
};

export const renderBunTestTemplate = (template: BunTestTemplate): string => {
  validateBunTestTemplate(template);
  const mockModules = template.externalMocks.flatMap(
    ({ exports: exportNames, specifier }) => [
      `mock.module(${JSON.stringify(specifier)}, () => ({`,
      ...exportNames.map((exportName) => `  ${exportName}: mock(),`),
      '}));',
      '',
    ],
  );
  return [
    "import { expect, mock, test } from 'bun:test';",
    '',
    ...mockModules,
    `import * as sut from '${template.importPath}';`,
    '',
    `const cases = ${JSON.stringify(template.cases)};`,
    '',
    "test.each(cases)('$label', ({ input, expected }) => {",
    `  expect(${template.actualExpression}).${template.matcher}(expected);`,
    '});',
    '',
  ].join('\n');
};
