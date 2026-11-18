import { describe, expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realFsPromises from 'node:fs/promises';
import * as realOs from 'node:os';
import path from 'node:path';
import * as realUrl from 'node:url';
import type {
  Baseline,
  GateDependencies,
  Measurement,
  Receipt,
} from '../../../scripts/instruction-gate/index.js';
import type { CommandResult, CommandSpec } from '../../../utils/contracts.js';

interface Harness {
  readonly deps: GateDependencies;
  readonly executor: ReturnType<typeof mock>;
  readonly executorCalls: () => number;
  readonly files: Map<string, string>;
  readonly output: string[];
  readonly readPaths: string[];
}

const realProcess = await import('../../../utils/process.js');
const realAgentsRoot = await import('../../../utils/agents-root.js');
const realWeakReader = await import('../../../scripts/weak-reader/index.js');
const realInstructionGateBatch = await import('../../../scripts/instruction-gate/batch.js');
const realInstructionGateCalibrate = await import('../../../scripts/instruction-gate/calibrate.js');
const realInstructionGatePolicy = await import('../../../scripts/instruction-gate/policy.js');
const realInstructionGatePaths = await import('../../../scripts/instruction-gate/paths.js');
const realInstructionGateRouting = await import('../../../scripts/instruction-gate/routing.js');

const fsReaddir = mock(async () => [] as unknown[]);
const fsMkdtemp = mock(async (prefix: string) => `${prefix}abc123`);
const fsReadFile = mock(async (file: string) => `content of ${file}`);
const fsMkdir = mock(async () => undefined);
const fsWriteFile = mock(async () => undefined);
const osHome = mock(() => '/test-home');

mock.module('node:fs/promises', () => ({
  ...realFsPromises,
  mkdir: fsMkdir,
  mkdtemp: fsMkdtemp,
  readdir: fsReaddir,
  readFile: fsReadFile,
  writeFile: fsWriteFile,
}));
mock.module('node:os', () => ({ ...realOs, homedir: osHome, tmpdir: mock(() => '/os-temp') }));
mock.module('node:path', () => ({ default: path }));
mock.module('node:crypto', () => realCrypto);
mock.module('node:url', () => realUrl);
mock.module('../utils/agents-root.js', () => realAgentsRoot);
mock.module('../utils/process.js', () => realProcess);
mock.module('./instruction-gate-batch.js', () => realInstructionGateBatch);
mock.module('./instruction-gate-calibrate.js', () => realInstructionGateCalibrate);
mock.module('./instruction-gate-paths.js', () => realInstructionGatePaths);
mock.module('./instruction-gate-policy.js', () => realInstructionGatePolicy);
mock.module('./instruction-gate-routing.js', () => realInstructionGateRouting);
mock.module('./weak-reader.js', () => realWeakReader);
const centralPathCases = await import('./central-cases.js');
const catalogGenerationCases = await import('./routing-generation-cases.js');
const catalogGenerationRejectionCases = await import('./routing-generation-rejection-cases.js');
const gateValueCases = await import('./value-cases.js');
const gateCommandCases = await import('./command-cases.js');
mock.module('./central-cases.js', () => centralPathCases);

const {
  RECEIPT_DIRECTORY,
  ROUTING_RECEIPT,
  ROOT_DOCUMENT_PATTERN,
  currentFingerprint,
  decide,
  formatReceipt,
  defaultDependencies,
  fingerprintMatches,
  instructionDocuments,
  createCommand,
  parseRecordArguments,
  receiptPathFor,
  record,
  run,
  sealReceipt,
  setPathFor,
  usage,
  verify,
  verifyRouting,
  verifyTarget,
} = await import('../../../scripts/instruction-gate/index.js');

const ROOT = '/agents';
const GLOBAL_ROOT = '/test-home/.agents';
const DOCUMENT = 'skills/aidp/SKILL.md';
const SET = 'skills/aidp/evals/comprehension/SKILL.json';
const CENTRAL_SET = 'evals/skills/aidp/comprehension/SKILL.json';
const RECEIPT = receiptPathFor(DOCUMENT);
const CENTRAL_RECEIPT = 'evals/skills/aidp/receipts/SKILL.json';
const hash = (text: string): string => `h(${text})`;

const SET_TEXT = JSON.stringify({
  queries: [
    { id: 't1', split: 'train' },
    { id: 't2', split: 'train' },
    { id: 't3', retired: 'obsolete', split: 'train' },
    { id: 'v1', split: 'validation' },
  ],
});

const measurement = (
  passed: readonly string[],
  failed: readonly string[],
  valid = 2,
): Measurement => ({
  trainFailed: failed,
  trainPassed: passed,
  validationPassed: valid,
  validationTotal: 3,
});

const OK: CommandResult = { code: 0, stderr: '', stdout: '' };
const CATALOG = [{ description: 'd', name: 'aidp' }];
const CATALOG_SHA = hash(JSON.stringify(CATALOG));
const TRIGGER_SET = JSON.stringify({
  queries: [
    { id: 'a1', query: 'Plan it', should_trigger: true, split: 'train' },
    { id: 'a2', query: 'Hello', should_trigger: false, split: 'train' },
    { id: 'av', split: 'validation' },
  ],
});

const measureStdout = (passed: readonly string[], failed: readonly string[], valid = 2): string =>
  JSON.stringify({
    measurement: {
      trainQueries: [
        ...passed.map((id) => ({ id, passed: true })),
        ...failed.map((id) => ({ id, passed: false })),
      ],
      validation: { passedQueries: valid, totalQueries: 3 },
    },
  });

const ROUTING_PROMPTS = [
  { query: 'Plan it', query_id: 'a1', run: 1 },
  { query: 'Hello', query_id: 'a2', run: 1 },
  { query: 'Held out', query_id: 'av', run: 1 },
] as const;

const ROUTING_BUNDLE = JSON.stringify({
  catalog: CATALOG,
  document: 'Skill catalog:\n- aidp: d',
  instructions: 'Return the matching skill name or NO_SKILL.',
  names: ['aidp'],
  prompts: ROUTING_PROMPTS,
});

const bundleCommandResult = (
  spec: CommandSpec,
  readerBundle: string | undefined,
): CommandResult | undefined =>
  spec.args.includes('bundle')
    ? {
        ...OK,
        stdout: (spec.args.at(-1) ?? '').endsWith('.json')
          ? '{"bundle":true}'
          : (readerBundle ?? ROUTING_BUNDLE),
      }
    : undefined;

const fallbackCommandResult = (files: Map<string, string>, readerStderr: string): CommandResult => {
  files.set(
    '/work/answers.jsonl',
    '{"answer":"B","query_id":"t1","run":1}\n{"answer":"C","query_id":"t2","run":1}\n',
  );
  return { ...OK, stderr: readerStderr };
};

const measureCommandResult = (
  spec: CommandSpec,
  measure: string | undefined,
): CommandResult | undefined =>
  spec.args.includes('measure')
    ? { ...OK, stdout: measure ?? measureStdout(['t1', 't2'], []) }
    : undefined;

const parsedBundleHasCatalog = (bundleText: string): boolean => {
  try {
    const parsedBundle = JSON.parse(bundleText) as { readonly catalog?: unknown };
    return Array.isArray(parsedBundle.catalog);
  } catch {
    return false;
  }
};

const routingPromptsOf = (
  bundleText: string,
): readonly { readonly query: string; readonly query_id: string; readonly run: number }[] => {
  try {
    const parsed = JSON.parse(bundleText) as {
      readonly prompts?: readonly {
        readonly query: string;
        readonly query_id: string;
        readonly run: number;
      }[];
    };
    return parsed.prompts ?? ROUTING_PROMPTS;
  } catch {
    return ROUTING_PROMPTS;
  }
};

const routingAnswersFor = (bundleText: string): string => {
  return `${routingPromptsOf(bundleText)
    .map((prompt) =>
      JSON.stringify({
        query_id: prompt.query_id,
        run: prompt.run,
        skill_name: prompt.query_id === 'a2' ? 'NO_SKILL' : 'aidp',
      }),
    )
    .join('\n')}\n`;
};

const routingRawRepliesFor = (bundleText: string): string => {
  return `${routingPromptsOf(bundleText)
    .map((prompt) =>
      JSON.stringify({
        query_id: prompt.query_id,
        raw_reply: `raw-${prompt.query_id}`,
        run: prompt.run,
      }),
    )
    .join('\n')}\n`;
};

const suggestionCommandResult = (
  spec: CommandSpec,
  files: Map<string, string>,
): CommandResult | undefined => {
  if (!spec.args.includes('suggest')) {
    return undefined;
  }
  files.set(
    '/work/suggestions.jsonl',
    '{"id":"t1","suggestion":"Say it plainly."}\n{"id":"t2","suggestion":"Shorten it."}\n',
  );
  return OK;
};

const writeRawReplies = (
  files: Map<string, string>,
  target: string | undefined,
  contents: string,
): void => {
  if (target !== undefined) {
    files.set(target, contents);
  }
};

const weakReaderCommandResult = (
  spec: CommandSpec,
  files: Map<string, string>,
  readerStderr: string,
  readerOptions: {
    readonly answers?: string;
    readonly bundle?: string;
    readonly log?: string;
  },
): CommandResult | undefined => {
  if (!spec.args.some((arg) => arg.endsWith('/weak-reader/index.ts'))) {
    return undefined;
  }
  const bundlePath = spec.args.at(-2) ?? '';
  const answersPath = spec.args.at(-1) ?? '/work/answers.jsonl';
  const rawRepliesFlag = spec.args.indexOf('--raw-replies');
  const rawRepliesPath = rawRepliesFlag === -1 ? undefined : spec.args[rawRepliesFlag + 1];
  const bundleText = files.get(bundlePath) ?? ROUTING_BUNDLE;
  if (readerOptions.bundle === undefined && !parsedBundleHasCatalog(bundleText)) {
    files.set(
      answersPath,
      '{"answer":"B","query_id":"t1","run":1}\n{"answer":"C","query_id":"t2","run":1}\n',
    );
    writeRawReplies(
      files,
      rawRepliesPath,
      '{"query_id":"t1","raw_reply":"raw-t1","run":1}\n{"query_id":"t2","raw_reply":"raw-t2","run":1}\n',
    );
    return { ...OK, stderr: readerStderr };
  }
  files.set(answersPath, readerOptions.answers ?? routingAnswersFor(bundleText));
  writeRawReplies(files, rawRepliesPath, routingRawRepliesFor(bundleText));
  const prompts = routingPromptsOf(bundleText);
  const fingerprint = currentFingerprint(true);
  const log =
    readerOptions.log
    ?? `[weak-reader] GPU ready; context 3/10 tokens; answered ${prompts.length} probes from ${new Set(prompts.map((prompt) => prompt.query)).size} queries; load 0.001 s, warmup 0.001 s, total 0.002 s; last query first token 0.001 s, total 0.001 s; model revision ${fingerprint.modelRevision}; runtime bundle ${fingerprint.bundleSha256}`;
  return { ...OK, stderr: [log, readerStderr].filter(Boolean).join('\n') };
};

const scriptedResult = (
  spec: CommandSpec,
  files: Map<string, string>,
  measure: string | undefined,
  readerStderr = '',
  readerOptions: {
    readonly answers?: string;
    readonly bundle?: string;
    readonly log?: string;
  } = {},
): CommandResult =>
  bundleCommandResult(spec, readerOptions.bundle)
  ?? measureCommandResult(spec, measure)
  ?? suggestionCommandResult(spec, files)
  ?? weakReaderCommandResult(spec, files, readerStderr, readerOptions)
  ?? fallbackCommandResult(files, readerStderr);

const makeHarness = (
  options: {
    readonly agentsRoot?: string;
    readonly measure?: string;
    readonly readerStderr?: string;
    readonly readerAnswers?: readonly string[];
    readonly readerBundles?: readonly string[];
    readonly readerLogs?: readonly string[];
    readonly missingReadPaths?: readonly string[];
    readonly overrides?: (spec: CommandSpec) => CommandResult | undefined;
    readonly tempDirs?: readonly string[];
    readonly transformRead?: (file: string, text: string | undefined) => string | undefined;
    readonly tree?: Record<string, readonly { isDirectory: boolean; name: string }[]>;
    readonly toolsRoot?: string;
  } = {},
): Harness => {
  const agentsRoot = options.agentsRoot ?? ROOT;
  const files = new Map<string, string>([
    [path.join(agentsRoot, DOCUMENT), 'document text'],
    [path.join(agentsRoot, SET), SET_TEXT],
    [path.join(agentsRoot, 'skills', 'aidp', 'evals', 'trigger-queries.json'), TRIGGER_SET],
  ]);
  const output: string[] = [];
  const readPaths: string[] = [];
  let readerCalls = 0;
  let tempDirCalls = 0;
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    const isReader =
      spec.args.some((arg) => arg.endsWith('/weak-reader/index.ts'))
      && !spec.args.includes('suggest');
    const readerIndex = readerCalls;
    if (isReader) {
      readerCalls += 1;
    }
    return (
      options.overrides?.(spec)
      ?? scriptedResult(spec, files, options.measure, options.readerStderr, {
        answers: options.readerAnswers?.[readerIndex],
        bundle: options.readerBundles?.[readerIndex],
        log: options.readerLogs?.[readerIndex],
      })
    );
  });
  const deps: GateDependencies = {
    agentsRoot,
    executor,
    listDirectory: mock(async (directory: string) => options.tree?.[directory] ?? []),
    makeTempDir: mock(async () => {
      const configured = options.tempDirs?.[tempDirCalls];
      tempDirCalls += 1;
      return configured ?? '/work';
    }),
    now: mock(() => new Date('2026-11-14T18:00:00.000Z')),
    readText: mock(async (file: string) => {
      readPaths.push(file);
      if (options.missingReadPaths?.includes(file)) {
        return undefined;
      }
      const text = files.get(file);
      return text === undefined ? undefined : (options.transformRead?.(file, text) ?? text);
    }),
    sha256: hash,
    toolsRoot: options.toolsRoot ?? ROOT,
    write: (message: string) => {
      output.push(message);
    },
    writeText: mock(async (file: string, content: string) => {
      files.set(file, content);
    }),
  };
  return {
    deps,
    executor,
    executorCalls: () => executor.mock.calls.length,
    files,
    output,
    readPaths,
  };
};

const centralTestContext = {
  centralReceipt: CENTRAL_RECEIPT,
  centralSet: CENTRAL_SET,
  currentFingerprint,
  document: DOCUMENT,
  formatReceipt,
  globalRoot: GLOBAL_ROOT,
  instructionDocuments,
  join: path.join,
  makeHarness,
  receipt: RECEIPT,
  receiptPathFor,
  record,
  routingReceipt: ROUTING_RECEIPT,
  sealReceipt: (receipt: Omit<Receipt, 'selfSha256'>) => sealReceipt(receipt, hash),
  set: SET,
  setPathFor,
  setText: SET_TEXT,
  triggerSet: TRIGGER_SET,
  verifyRouting,
};

centralPathCases.registerCentralPathTests(centralTestContext);
catalogGenerationCases.registerCatalogGenerationTests(centralTestContext);
catalogGenerationRejectionCases.registerCatalogGenerationRejectionTests(centralTestContext);

const sealed = (overrides: Partial<Omit<Receipt, 'selfSha256'>> = {}): Receipt =>
  sealReceipt(
    {
      baseline: null,
      decision: 'baseline',
      document: DOCUMENT,
      documentSha256: hash('document text'),
      fingerprint: currentFingerprint(),
      measurement: measurement(['t1'], ['t2']),
      reason: '',
      schema: 1,
      setPath: SET,
      setSha256: hash(SET_TEXT),
      ...overrides,
    },
    hash,
  );

const withReceipt = (harness: Harness, receipt: Receipt | string): Harness => {
  harness.files.set(
    path.join(ROOT, RECEIPT),
    typeof receipt === 'string' ? receipt : JSON.stringify(receipt),
  );
  return harness;
};

const target = { document: DOCUMENT, receiptPath: RECEIPT, setPath: SET };

const gateTestContext = {
  CENTRAL_SET,
  createCommand,
  currentFingerprint,
  DOCUMENT,
  decide,
  fingerprintMatches,
  formatReceipt,
  GLOBAL_ROOT,
  hash,
  makeHarness,
  measurement,
  parseRecordArguments,
  RECEIPT,
  RECEIPT_DIRECTORY,
  ROOT,
  ROOT_DOCUMENT_PATTERN,
  receiptPathFor,
  record,
  run,
  SET,
  SET_TEXT,
  sealed,
  sealReceipt,
  setPathFor,
  usage,
};

const withActivationReceipt = (harness: Harness): Harness => {
  harness.files.set(
    path.join(ROOT, ROUTING_RECEIPT),
    JSON.stringify(
      sealed({
        document: 'skills/*/SKILL.md',
        documentSha256: CATALOG_SHA,
        fingerprint: currentFingerprint(true),
        measurement: measurement(['aidp/a1', 'aidp/a2'], []),
        setPath: 'skills/*/evals/trigger-queries.json',
        setSha256: hash(`aidp\0${TRIGGER_SET}`),
      }),
    ),
  );
  return harness;
};
const fingerprintOptions = { fingerprintChanged: false };

describe('decide', () => {
  const baseline: Baseline = { trainPassed: ['t1'], validationPassed: 2 };

  test('the first measurement becomes the baseline', () => {
    expect(decide(measurement(['t1'], ['t2']), null, fingerprintOptions)).toEqual({
      accepted: true,
      decision: 'baseline',
      problems: [],
    });
  });

  test('a changed reader blocks comparison unless a reason rebaselines', () => {
    const changed = { fingerprintChanged: true };

    expect(decide(measurement(['t1'], []), baseline, changed).accepted).toBe(false);
    expect(
      decide(measurement(['t1'], []), baseline, { ...changed, rebaselineReason: 'new model' }),
    ).toMatchObject({ accepted: true, decision: 'rebaseline' });
  });

  test('a train probe that passed at baseline and now fails is a regression', () => {
    const verdict = decide(measurement(['t2'], ['t1']), baseline, fingerprintOptions);

    expect(verdict.accepted).toBe(false);
    expect(verdict.problems).toEqual(['Train probe t1 passed at baseline and now fails.']);
  });

  test('losing a held-out validation pass is a regression, and both problems are reported', () => {
    const verdict = decide(measurement(['t2'], ['t1'], 1), baseline, fingerprintOptions);

    expect(verdict.problems).toHaveLength(2);
    expect(verdict.problems[1]).toContain('fell from 2 to 1');
  });

  test.each<[string, Measurement, number]>([
    ['a newly passing train probe', measurement(['t1', 't2'], []), 2],
    ['a validation gain', measurement(['t1'], ['t2']), 3],
  ])('%s is an improvement', (_label, candidate, valid) => {
    expect(
      decide({ ...candidate, validationPassed: valid }, baseline, fingerprintOptions),
    ).toMatchObject({ accepted: true, decision: 'improved' });
  });

  test('an unchanged result is accepted only when nothing fails', () => {
    expect(decide(measurement(['t1'], []), baseline, fingerprintOptions)).toMatchObject({
      accepted: true,
      decision: 'perfect',
    });
  });

  test('an unchanged result with failing probes needs a written reason', () => {
    const candidate = measurement(['t1'], ['t2']);

    expect(decide(candidate, baseline, fingerprintOptions).accepted).toBe(false);
    expect(
      decide(candidate, baseline, { ...fingerprintOptions, allowEqualReason: 'typo fix' }),
    ).toMatchObject({ accepted: true, decision: 'allowed-equal' });
  });
});

gateValueCases.registerGateValueCases(gateTestContext);

describe('verifyTarget', () => {
  const problemsFor = async (harness: Harness): Promise<readonly string[]> =>
    verifyTarget(target, harness.deps);

  test('a current, sealed, never-worse receipt has no problems', async () => {
    expect(await problemsFor(withReceipt(makeHarness(), sealed()))).toEqual([]);
  });

  test.each([
    ['the document', path.join(ROOT, DOCUMENT), 'The instruction document is missing.'],
    ['the comprehension set', path.join(ROOT, SET), 'No comprehension set at'],
  ])('reports a missing %s', async (_label, file, message) => {
    const harness = withReceipt(makeHarness(), sealed());
    harness.files.delete(file);

    expect((await problemsFor(harness))[0]).toContain(message);
  });

  test.each([
    ['no receipt', undefined],
    ['unparseable JSON', '{nope'],
    ['a different schema', JSON.stringify({ schema: 2 })],
    ['a non-object', '"text"'],
  ])('reports %s', async (_label, content) => {
    const harness = makeHarness();
    if (content !== undefined) {
      withReceipt(harness, content);
    }

    expect((await problemsFor(harness))[0]).toContain('No valid receipt');
  });

  test('probe coverage ignores the order of the recorded ids', async () => {
    const reordered = sealed({ measurement: measurement(['t2'], ['t1']) });

    expect(await problemsFor(withReceipt(makeHarness(), reordered))).toEqual([]);
  });

  test('a document edited after recording is stale', async () => {
    const harness = withReceipt(makeHarness(), sealed());
    harness.files.set(path.join(ROOT, DOCUMENT), 'edited text');

    expect(await problemsFor(harness)).toEqual([
      'The document changed after its receipt was recorded.',
    ]);
  });

  test('a comprehension set edited after recording is stale', async () => {
    const harness = withReceipt(makeHarness(), sealed());
    harness.files.set(path.join(ROOT, SET), SET_TEXT.replace('v1', 'v9'));

    expect((await problemsFor(harness))[0]).toContain('comprehension set changed');
  });

  test('a hand-edited receipt fails its seal', async () => {
    const forged = { ...sealed(), measurement: measurement(['t1', 't2'], []) };

    expect((await problemsFor(withReceipt(makeHarness(), forged as Receipt)))[0]).toContain(
      'edited by hand',
    );
  });

  test('a receipt from another reader must be rebaselined', async () => {
    const other = sealed({ fingerprint: { ...currentFingerprint(), readerVersion: 'old' } });

    expect((await problemsFor(withReceipt(makeHarness(), other)))[0]).toContain('different reader');
  });

  test('a receipt must cover exactly the active train probes', async () => {
    const partial = sealed({ measurement: measurement(['t1'], []) });

    expect((await problemsFor(withReceipt(makeHarness(), partial)))[0]).toContain(
      'exactly the active train probes',
    );
  });

  test('a receipt whose own baseline shows a regression is rejected', async () => {
    const worse = sealed({
      baseline: { trainPassed: ['t2'], validationPassed: 2 },
      decision: 'improved',
      measurement: measurement(['t1'], ['t2']),
    });

    expect((await problemsFor(withReceipt(makeHarness(), worse)))[0]).toContain(
      'Recorded result is worse',
    );
  });

  test.each(['allowed-equal', 'rebaseline'] as const)(
    'a %s decision without a reason is rejected',
    async (decision) => {
      const unexplained = sealed({
        baseline: { trainPassed: ['t1'], validationPassed: 2 },
        decision,
        measurement: measurement(['t1'], ['t2']),
        reason: ' ',
      });
      const problems = await problemsFor(withReceipt(makeHarness(), unexplained));

      expect(problems.some((problem) => problem.includes('no recorded reason'))).toBe(true);
    },
  );

  test('a rebaseline is not compared with the old baseline', async () => {
    const rebased = sealed({
      baseline: { trainPassed: ['t1', 't2'], validationPassed: 3 },
      decision: 'rebaseline',
      measurement: measurement(['t1'], ['t2'], 1),
      reason: 'new model',
    });

    expect(await problemsFor(withReceipt(makeHarness(), rebased))).toEqual([]);
  });
});

describe('instructionDocuments and verify', () => {
  const tree = {
    [ROOT]: [
      { isDirectory: false, name: 'AGENTS.md' },
      { isDirectory: false, name: 'README.md' },
      { isDirectory: false, name: 'CLAUDE.md' },
      { isDirectory: true, name: 'skills' },
    ],
    [path.join(ROOT, 'skills')]: [
      { isDirectory: true, name: 'aidp' },
      { isDirectory: false, name: 'stray.md' },
    ],
    [path.join(ROOT, 'skills', 'aidp')]: [
      { isDirectory: false, name: 'SKILL.md' },
      { isDirectory: false, name: 'notes.txt' },
      { isDirectory: true, name: 'references' },
    ],
    [path.join(ROOT, 'skills', 'aidp', 'references')]: [{ isDirectory: false, name: 'deep.md' }],
  };

  test('lists root instruction files and every Markdown file inside skill packages', async () => {
    expect(await instructionDocuments(makeHarness({ tree }).deps)).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'skills/aidp/SKILL.md',
      'skills/aidp/references/deep.md',
    ]);
  });

  test('verify fails with a fix hint when a document lacks a receipt', async () => {
    const harness = makeHarness({ tree });

    expect(await verify(harness.deps)).toBe(1);
    const text = harness.output.join('');
    expect(text).toContain('instruction-gate: AGENTS.md');
    expect(text).toContain('failed - 5 of 5 checks need a receipt');
    expect(text).toContain('instruction-gate: descriptions');
    expect(text).toContain('record');
  });

  test('verify passes when every document has a current receipt', async () => {
    const harness = makeHarness({
      tree: {
        [ROOT]: [{ isDirectory: true, name: 'skills' }],
        [path.join(ROOT, 'skills')]: [{ isDirectory: true, name: 'aidp' }],
        [path.join(ROOT, 'skills', 'aidp')]: [{ isDirectory: false, name: 'SKILL.md' }],
      },
    });
    withActivationReceipt(withReceipt(harness, sealed()));

    expect(await verify(harness.deps)).toBe(0);
    expect(harness.output.join('')).toContain(
      'passed - 1 instruction documents and the skill description routing',
    );
  });
});

describe('record', () => {
  const rootTree = {
    [ROOT]: [{ isDirectory: true, name: 'skills' }],
    [path.join(ROOT, 'skills')]: [{ isDirectory: true, name: 'aidp' }],
    [path.join(ROOT, 'skills', 'aidp')]: [{ isDirectory: false, name: 'SKILL.md' }],
  };

  test('measures through bundle, reader, and measure, then seals an accepted receipt', async () => {
    const harness = makeHarness({ tree: rootTree });

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(0);

    const commands = harness.executor.mock.calls.map(([spec]) =>
      (spec as CommandSpec).args.join(' '),
    );
    expect(commands[0]).toContain(`train bundle ${path.join(ROOT, SET)}`);
    expect(commands[1]).toBe(
      `${path.join(ROOT, 'scripts', 'weak-reader', 'index.ts')} --raw-replies /work/raw-replies.jsonl `
        + '/work/bundle.json /work/answers.jsonl',
    );
    expect(commands[2]).toContain('--measure-only --ledger-root /work/ledger');
    expect(harness.files.get('/work/bundle.json')).toBe('{"bundle":true}');
    expect(await verifyTarget(target, harness.deps)).toEqual([]);
    expect(JSON.parse(harness.files.get(path.join(ROOT, RECEIPT)) ?? '{}')).toMatchObject({
      baseline: null,
      decision: 'baseline',
    });
    expect(harness.output.join('')).toContain(
      'ACCEPTED skills/aidp/SKILL.md (train 2/2, validation 2/3) as baseline',
    );
  });

  test('without paths it records only stale documents and skips current ones', async () => {
    const harness = withActivationReceipt(withReceipt(makeHarness({ tree: rootTree }), sealed()));

    expect(await record([], {}, harness.deps)).toBe(0);
    expect(harness.executor).toHaveBeenCalledTimes(1);
    expect(harness.output.join('')).toContain('record complete');
  });

  test('without paths it records a stale document', async () => {
    const harness = makeHarness({ tree: rootTree });

    expect(await record([], {}, harness.deps)).toBe(0);
    expect(harness.executor).toHaveBeenCalledTimes(8);
  });

  test('a regression is rejected, named, and leaves the old receipt untouched', async () => {
    const harness = withReceipt(
      makeHarness({ measure: measureStdout(['t2'], ['t1']) }),
      sealed({ measurement: measurement(['t1'], ['t2']) }),
    );
    const before = harness.files.get(path.join(ROOT, RECEIPT));

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(1);

    expect(harness.files.get(path.join(ROOT, RECEIPT))).toBe(before);
    const output = harness.output.join('');
    expect(output).toMatch(
      /For a placement issue[\s\S]*beside the output it governs without changing the rule/u,
    );
    expect(output).toContain('there is no edit-size cap');
  });

  test('an improvement is accepted and the old result becomes the stored baseline', async () => {
    const harness = withReceipt(
      makeHarness(),
      sealed({ measurement: measurement(['t1'], ['t2']) }),
    );

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(0);

    expect(JSON.parse(harness.files.get(path.join(ROOT, RECEIPT)) ?? '{}')).toMatchObject({
      baseline: { trainPassed: ['t1'], validationPassed: 2 },
      decision: 'improved',
    });
  });

  test('--allow-equal writes its reason into the receipt of an unchanged result', async () => {
    const harness = withReceipt(
      makeHarness({ measure: measureStdout(['t1'], ['t2']) }),
      sealed({ measurement: measurement(['t1'], ['t2']) }),
    );

    expect(await record([DOCUMENT], { allowEqualReason: 'typo only' }, harness.deps)).toBe(0);

    expect(JSON.parse(harness.files.get(path.join(ROOT, RECEIPT)) ?? '{}')).toMatchObject({
      decision: 'allowed-equal',
      reason: 'typo only',
    });
  });

  test('--rebaseline accepts a new reader result and records why', async () => {
    const harness = withReceipt(
      makeHarness({ measure: measureStdout(['t1'], ['t2']) }),
      sealed({ fingerprint: { ...currentFingerprint(), readerVersion: 'old' } }),
    );

    expect(await record([DOCUMENT], { rebaselineReason: 'new model' }, harness.deps)).toBe(0);

    expect(JSON.parse(harness.files.get(path.join(ROOT, RECEIPT)) ?? '{}')).toMatchObject({
      decision: 'rebaseline',
      reason: 'new model',
    });
  });

  test('a missing document or set is reported without measuring', async () => {
    const harness = makeHarness();
    harness.files.delete(path.join(ROOT, SET));

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(1);
    expect(harness.executor).not.toHaveBeenCalled();
    expect(harness.output.join('')).toContain('missing document or comprehension set');
  });
});

describe('record diagnosis', () => {
  const richSet = JSON.stringify({
    queries: [
      {
        evidence: 'Rule one.',
        expected: 'A',
        id: 't1',
        query: 'Which letter?\nA) one\nB) two',
        split: 'train',
      },
      { id: 't2', split: 'train' },
      { id: 'v1', split: 'validation' },
    ],
  });
  const withRichSet = (harness: Harness): Harness => {
    harness.files.set(path.join(ROOT, SET), richSet);
    return harness;
  };

  test('replies the reader could not parse are shown with the diagnosis, at most five', async () => {
    const lines = Array.from(
      { length: 7 },
      (_value, index) => `[weak-reader] unparseable reply for "q${index}": "odd"`,
    );
    const harness = withRichSet(
      makeHarness({
        measure: measureStdout(['t2'], ['t1']),
        readerStderr: ['[weak-reader] load 1 s', ...lines].join('\n'),
      }),
    );

    expect(await record([DOCUMENT], { allowEqualReason: 'x' }, harness.deps)).toBe(0);

    const text = harness.output.join('');
    expect(text).toContain('Replies the reader gave that were not a skill name or letter:');
    expect(text).toContain('unparseable reply for "q4"');
    expect(text).not.toContain('unparseable reply for "q5"');
    expect(text).not.toContain('load 1 s');
  });

  test('an accepted result that still has failing probes also prints the diagnosis', async () => {
    const harness = withRichSet(makeHarness({ measure: measureStdout(['t1'], ['t2']) }));

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(0);

    const text = harness.output.join('');
    expect(text).toContain('ACCEPTED');
    expect(text).toContain('--- t2: expected , the reader answered C');
    expect(text).toContain("Reader's view: Shorten it.");
  });

  test('a failed suggestion run is reported without failing the record', async () => {
    const harness = withRichSet(
      makeHarness({
        measure: measureStdout(['t1'], ['t2']),
        overrides: (spec) =>
          spec.args.includes('suggest') ? { code: 1, stderr: 'boom', stdout: '' } : undefined,
      }),
    );

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(0);
    expect(harness.output.join('')).toContain("Reader's view: (no suggestion available)");
  });

  test('a perfect result prints no diagnosis and never asks for suggestions', async () => {
    const harness = withRichSet(makeHarness());

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(0);
    expect(harness.output.join('')).not.toContain('DIAGNOSIS');
    expect(harness.executor).toHaveBeenCalledTimes(3);
  });

  test('a probe missing from the set or the answers still produces an entry', async () => {
    const harness = makeHarness({ measure: measureStdout(['t1'], ['t9']) });
    harness.files.set('/work/answers.jsonl', '');
    const deps = {
      ...harness.deps,
      executor: mock(async (spec: CommandSpec) => {
        const result = await harness.executor(spec);
        if (
          spec.args.some((arg) => arg.endsWith('weak-reader/index.ts'))
          && !spec.args.includes('suggest')
        ) {
          harness.files.set('/work/answers.jsonl', '');
        }
        return result;
      }),
    };

    expect(await record([DOCUMENT], { allowEqualReason: 'x' }, deps)).toBe(0);
    expect(harness.output.join('')).toContain('--- t9: expected , the reader answered ');
  });
});

describe('record diagnosis evidence', () => {
  test('a rejection prints the scored reply separately and keeps raw text out of answers', async () => {
    const set = JSON.stringify({
      queries: [
        {
          evidence: 'Rule one.',
          expected: 'A',
          id: 't1',
          query: 'Which letter?\nA) one\nB) two',
          split: 'train',
        },
      ],
    });
    const harness = makeHarness({
      measure: measureStdout(['t2'], ['t1']),
    });
    harness.files.set(path.join(ROOT, SET), set);
    withReceipt(
      harness,
      sealed({ measurement: measurement(['t1'], ['t2']), setSha256: hash(set) }),
    );

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(1);

    const text = harness.output.join('');
    expect(text).toContain('--- t1: expected A, the reader answered B');
    expect(text).toContain('Source rule: Rule one.');
    expect(text).toContain("Reader's original reply: " + '"raw-t1"');
    expect(text).toContain("Reader's view: Say it plainly.");
    expect(harness.files.get('/work/answers.jsonl')).not.toContain('raw_reply');
    expect(harness.files.get('/work/raw-replies.jsonl')).toContain('raw-t1');
    const readerCall = harness.executor.mock.calls
      .map(([spec]) => (spec as CommandSpec).args)
      .find((args) => args.some((arg) => arg.endsWith('/weak-reader/index.ts')));
    expect(readerCall).toContain('--raw-replies');
    expect(JSON.parse(harness.files.get('/work/failures.json') ?? '[]')).toEqual([
      {
        expected: 'A',
        given: 'B',
        id: 't1',
        query: 'Which letter?\nA) one\nB) two',
        rawReply: 'raw-t1',
      },
    ]);
  });
});

gateCommandCases.registerGateCommandCases(gateTestContext);

describe('defaultDependencies', () => {
  test('wires the process boundaries to node primitives', async () => {
    const deps = defaultDependencies('/custom-root');
    fsReaddir.mockImplementationOnce(async () => [
      { isDirectory: () => true, name: 'dir' },
      { isDirectory: () => false, name: 'file.md' },
    ]);

    expect(deps.agentsRoot).toBe('/custom-root');
    expect(await deps.listDirectory('/x')).toEqual([
      { isDirectory: true, name: 'dir' },
      { isDirectory: false, name: 'file.md' },
    ]);
    expect(await deps.makeTempDir()).toBe('/os-temp/instruction-gate-abc123');
    expect(await deps.readText('/f')).toBe('content of /f');
    fsReadFile.mockImplementationOnce(async () => {
      throw new Error('ENOENT');
    });
    expect(await deps.readText('/missing')).toBeUndefined();
    expect(deps.sha256('abc')).toBe(realCrypto.createHash('sha256').update('abc').digest('hex'));
    await deps.writeText('/out/dir/file.json', 'data');
    expect(fsMkdir).toHaveBeenCalledWith('/out/dir', { recursive: true });
    expect(fsWriteFile).toHaveBeenCalledWith('/out/dir/file.json', 'data', 'utf8');
  });

  test('writes output to standard out and defaults the root next to the scripts', () => {
    const writeSpy = mock(() => true);
    const original = process.stdout.write;
    process.stdout.write = writeSpy as unknown as typeof process.stdout.write;
    try {
      const deps = defaultDependencies();
      deps.write('hello');
      expect(typeof deps.agentsRoot).toBe('string');
      expect(deps.now()).toBeInstanceOf(Date);
    } finally {
      process.stdout.write = original;
    }

    expect(writeSpy).toHaveBeenCalledWith('hello');
  });
});
