import { expect, mock, test } from 'bun:test';
import { join } from 'node:path';

type FakeBabel = {
  availablePlugins: Record<string, (() => void) | undefined>;
  availablePresets: Record<string, (() => void) | undefined>;
  transform(source: string, options: TransformOptions): { code: string };
};

type FakeDocument = {
  head: FakeHead;
  createElement(tagName: string): FakeScript;
  querySelector(selector: string): FakeHead;
};

type FakeHead = {
  appendChild(script: FakeScript): void;
  insertAdjacentHTML(position: string, html: string): void;
};

type FakeScript = {
  text: string;
  type?: string;
};

type Harness = {
  loader: LoaderApi;
  babel: FakeBabel | null;
  fetchCalls: string[];
  transformCalls: TransformCall[];
  scripts: FakeScript[];
  styles: string[];
  errors: string[];
  setFetchError(error: Error | null): void;
  setTransformError(error: Error | null): void;
  setAppendError(error: Error | null): void;
};

type HarnessOptions = {
  babel?: FakeBabel | null;
  moduleResolver?: (() => void) | null;
};

type LoaderApi = {
  loadTransforms(
    paths: unknown,
    globals?: unknown,
    imports?: unknown,
  ): LoaderResult;
  loadStyles(styles: unknown): boolean;
  loadUmds(paths: unknown): LoaderResult;
};

type LoaderResult = Promise<boolean>;

type TransformCall = {
  source: string;
  options: TransformOptions;
};

type TransformOptions = {
  filename?: unknown;
  sourceFileName?: unknown;
  presets?: unknown[];
  plugins?: unknown[];
};

const SUT_PATH = join(import.meta.dir, '../../../bin/devel.umd.js');

const createBabel = (
  transformCalls: TransformCall[],
  getTransformError: () => Error | null,
): FakeBabel => ({
  availablePlugins: {
    'transform-class-properties': () => undefined,
    'transform-modules-umd': () => undefined,
  },
  availablePresets: {
    env: () => undefined,
    react: () => undefined,
    typescript: () => undefined,
  },
  transform(source, options) {
    transformCalls.push({ options, source });
    const error = getTransformError();
    if (error) {
      throw error;
    }
    return { code: `/* transformed ${source} */` };
  },
});

const sourceText = async () => Bun.file(SUT_PATH).text();

const createHarness = async (
  options: HarnessOptions = {},
): Promise<Harness> => {
  const transformCalls: TransformCall[] = [];
  const fetchCalls: string[] = [];
  const scripts: FakeScript[] = [];
  const styles: string[] = [];
  const errors: string[] = [];
  let fetchError: Error | null = null;
  let transformError: Error | null = null;
  let appendError: Error | null = null;

  const head: FakeHead = {
    appendChild(script) {
      if (appendError) {
        throw appendError;
      }
      scripts.push(script);
    },
    insertAdjacentHTML(_position, html) {
      styles.push(html);
    },
  };
  const documentObject: FakeDocument = {
    createElement: (_tagName) => ({ text: '' }),
    head,
    querySelector: (_selector) => head,
  };
  const transformBabel = createBabel(transformCalls, () => transformError);
  const babel = options.babel === undefined ? transformBabel : options.babel;
  const fakeFetch = mock(async (url: string) => {
    fetchCalls.push(url);
    if (fetchError) {
      throw fetchError;
    }
    return {
      status: 200,
      text: async () => `export const loadedFrom = '${url}';`,
    };
  });
  const fakeSetInterval = mock((callback: () => void) => {
    queueMicrotask(callback);
    return 1;
  });
  const fakeClearInterval = mock((_id: number) => undefined);
  const timers = {
    clearInterval: fakeClearInterval,
    setInterval: fakeSetInterval,
  };
  const mockedTimers = mock(() => timers)();
  const fakeError = mock((message: unknown) => {
    errors.push(String(message));
  });
  const fakeConsole = { error: fakeError };
  const dateValue = mock(() => Date)();
  const sandboxGlobal = {
    Babel: babel,
    document: documentObject,
    fetch: fakeFetch,
    moduleResolver:
      options.moduleResolver === undefined
        ? () => undefined
        : options.moduleResolver,
  };
  const windowObject = {
    location: {
      origin: 'http://localhost',
      pathname: '/sprint-pulse/',
      protocol: 'http:',
    },
  };
  const evaluate = new Function(
    'globalThis',
    'window',
    'setInterval',
    'clearInterval',
    'Date',
    'console',
    `${await sourceText()}
return { loadTransforms, loadStyles, loadUmds };`,
  ) as unknown as (
    globalObject: typeof sandboxGlobal,
    windowValue: typeof windowObject,
    setIntervalValue: (callback: () => void) => number,
    clearIntervalValue: (_id: number) => void,
    dateValue: DateConstructor,
    consoleValue: typeof fakeConsole,
  ) => LoaderApi;
  const loader = evaluate(
    sandboxGlobal,
    windowObject,
    mockedTimers.setInterval,
    mockedTimers.clearInterval,
    dateValue,
    fakeConsole,
  );

  return {
    babel,
    errors,
    fetchCalls,
    loader,
    scripts,
    setAppendError(error) {
      appendError = error;
    },
    setFetchError(error) {
      fetchError = error;
    },
    setTransformError(error) {
      transformError = error;
    },
    styles,
    transformCalls,
  };
};

test('selects source-aware presets and passes both filename fields', async () => {
  const typescript = await createHarness();
  expect(await typescript.loader.loadTransforms(['src/core/result.ts'])).toBe(
    true,
  );
  expect(typescript.transformCalls).toHaveLength(1);
  expect(typescript.transformCalls[0]?.options.filename).toBe(
    'src/core/result.ts',
  );
  expect(typescript.transformCalls[0]?.options.sourceFileName).toBe(
    'src/core/result.ts',
  );
  expect(typescript.transformCalls[0]?.options.presets).toHaveLength(2);

  const tsx = await createHarness();
  expect(await tsx.loader.loadTransforms(['src/app/AppShell.tsx'])).toBe(true);
  expect(tsx.transformCalls[0]?.options.presets).toHaveLength(3);

  const javascript = await createHarness();
  expect(await javascript.loader.loadTransforms(['src/app/legacy.jsx'])).toBe(
    true,
  );
  expect(javascript.transformCalls[0]?.options.presets).toHaveLength(3);
});

test('preserves ordered transforms, UMDs, and styles', async () => {
  const harness = await createHarness();
  expect(await harness.loader.loadTransforms(['src/a.ts', 'src/b.ts'])).toBe(
    true,
  );
  expect(harness.fetchCalls).toEqual([
    'http://localhost/sprint-pulse/src/a.ts',
    'http://localhost/sprint-pulse/src/b.ts',
  ]);
  expect(harness.scripts.map((script) => script.type)).toEqual([
    'module',
    'module',
  ]);

  expect(harness.loader.loadStyles(['src/a.css', 'src/b.css'])).toBe(true);
  expect(harness.styles[0]).toContain("@import'src/a.css';@import'src/b.css'");

  expect(await harness.loader.loadUmds(['vendor/a.js', 'vendor/b.js'])).toBe(
    true,
  );
  expect(harness.scripts.map((script) => script.type)).toEqual([
    'module',
    'module',
    undefined,
    undefined,
  ]);
});

test('rejects invalid public inputs without external side effects', async () => {
  const harness = await createHarness();
  for (const invalid of [undefined, null, 'src/a.ts', [null], ['']]) {
    expect(await harness.loader.loadTransforms(invalid)).toBe(false);
    expect(await harness.loader.loadUmds(invalid)).toBe(false);
  }
  for (const invalid of [undefined, null, 'src/a.css', [null]]) {
    expect(harness.loader.loadStyles(invalid)).toBe(false);
  }
  expect(await harness.loader.loadTransforms([])).toBe(true);
  expect(await harness.loader.loadUmds([])).toBe(true);
  expect(harness.fetchCalls).toHaveLength(0);
  expect(harness.scripts).toHaveLength(0);
  expect(harness.styles).toHaveLength(0);
});

test('reports missing Babel and required capabilities before fetching', async () => {
  const noBabel = await createHarness({ babel: null });
  expect(await noBabel.loader.loadTransforms(['src/a.ts'])).toBe(false);
  expect(noBabel.errors.join('\n')).toContain('Babel global');
  expect(noBabel.fetchCalls).toHaveLength(0);
  expect(noBabel.scripts).toHaveLength(0);

  const missingPlugin = await createHarness();
  if (missingPlugin.babel) {
    missingPlugin.babel.availablePlugins['transform-modules-umd'] = undefined;
    missingPlugin.babel.availablePresets.react = undefined;
  }
  expect(await missingPlugin.loader.loadTransforms(['src/a.tsx'])).toBe(false);
  expect(missingPlugin.errors.join('\n')).toContain('transform-modules-umd');
  expect(missingPlugin.errors.join('\n')).toContain('preset react');
  expect(missingPlugin.fetchCalls).toHaveLength(0);

  const missingResolver = await createHarness({ moduleResolver: null });
  expect(
    await missingResolver.loader.loadTransforms(
      ['src/a.ts'],
      {},
      { react: 'React' },
    ),
  ).toBe(false);
  expect(missingResolver.errors.join('\n')).toContain(
    'module-resolver-standalone',
  );
  expect(missingResolver.fetchCalls).toHaveLength(0);
});

test('recovers after fetch, transform, and script failures so retry succeeds', async () => {
  const fetchFailure = await createHarness();
  fetchFailure.setFetchError(new Error('network down'));
  expect(await fetchFailure.loader.loadTransforms(['src/a.ts'])).toBe(false);
  expect(fetchFailure.scripts).toHaveLength(0);
  fetchFailure.setFetchError(null);
  expect(await fetchFailure.loader.loadTransforms(['src/a.ts'])).toBe(true);
  expect(fetchFailure.scripts).toHaveLength(1);

  const transformFailure = await createHarness();
  transformFailure.setTransformError(new Error('transform failed'));
  expect(await transformFailure.loader.loadTransforms(['src/a.ts'])).toBe(
    false,
  );
  transformFailure.setTransformError(null);
  expect(await transformFailure.loader.loadTransforms(['src/a.ts'])).toBe(true);

  const appendFailure = await createHarness();
  appendFailure.setAppendError(new Error('append failed'));
  expect(await appendFailure.loader.loadUmds(['vendor/a.js'])).toBe(false);
  appendFailure.setAppendError(null);
  expect(await appendFailure.loader.loadUmds(['vendor/a.js'])).toBe(true);
});
