import { describe, expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realFsPromises from 'node:fs/promises';
import * as realOs from 'node:os';
import path from 'node:path';
import type {
  Baseline,
  GateDependencies,
  Measurement,
  Receipt,
} from '../../scripts/instruction-gate.js';
import type { CommandResult, CommandSpec } from '../../utils/contracts.js';

interface Harness {
  readonly deps: GateDependencies;
  readonly executor: ReturnType<typeof mock>;
  readonly files: Map<string, string>;
  readonly output: string[];
}

const realProcess = await import('../../utils/process.js');
const realWeakReader = await import('../../scripts/weak-reader.js');

const fsReaddir = mock(async () => [] as unknown[]);
const fsMkdtemp = mock(async (prefix: string) => `${prefix}abc123`);
const fsReadFile = mock(async (file: string) => `content of ${file}`);
const fsMkdir = mock(async () => undefined);
const fsWriteFile = mock(async () => undefined);

mock.module('node:fs/promises', () => ({
  ...realFsPromises,
  mkdir: fsMkdir,
  mkdtemp: fsMkdtemp,
  readdir: fsReaddir,
  readFile: fsReadFile,
  writeFile: fsWriteFile,
}));
mock.module('node:os', () => ({ ...realOs, tmpdir: mock(() => '/os-temp') }));
mock.module('node:path', () => ({ default: path }));
mock.module('node:crypto', () => realCrypto);
mock.module('../utils/process.js', () => realProcess);
mock.module('./weak-reader.js', () => realWeakReader);

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
  parseRecordArguments,
  processExit,
  receiptPathFor,
  record,
  run,
  runCli,
  sealReceipt,
  setPathFor,
  usage,
  verify,
  verifyTarget,
} = await import('../../scripts/instruction-gate.js');

const ROOT = '/agents';
const DOCUMENT = 'skills/aidp/SKILL.md';
const SET = 'skills/aidp/evals/comprehension/SKILL.json';
const RECEIPT = receiptPathFor(DOCUMENT);
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

const scriptedResult = (
  spec: CommandSpec,
  files: Map<string, string>,
  measure: string | undefined,
  readerStderr = '',
): CommandResult => {
  if (spec.args.includes('bundle')) {
    const router = !(spec.args.at(-1) ?? '').endsWith('.json');
    return { ...OK, stdout: router ? JSON.stringify({ catalog: CATALOG }) : '{"bundle":true}' };
  }
  if (spec.args.includes('measure')) {
    return { ...OK, stdout: measure ?? measureStdout(['t1', 't2'], []) };
  }
  if (spec.args.includes('suggest')) {
    files.set(
      '/work/suggestions.jsonl',
      '{"id":"t1","suggestion":"Say it plainly."}\n{"id":"t2","suggestion":"Shorten it."}\n',
    );
    return OK;
  }
  files.set(
    '/work/answers.jsonl',
    '{"answer":"B","query_id":"t1","run":1}\n{"answer":"C","query_id":"t2","run":1}\n',
  );
  return { ...OK, stderr: readerStderr };
};

const makeHarness = (
  options: {
    readonly measure?: string;
    readonly readerStderr?: string;
    readonly overrides?: (spec: CommandSpec) => CommandResult | undefined;
    readonly tree?: Record<string, readonly { isDirectory: boolean; name: string }[]>;
  } = {},
): Harness => {
  const files = new Map<string, string>([
    [path.join(ROOT, DOCUMENT), 'document text'],
    [path.join(ROOT, SET), SET_TEXT],
    [path.join(ROOT, 'skills', 'aidp', 'evals', 'trigger-queries.json'), TRIGGER_SET],
  ]);
  const output: string[] = [];
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    return (
      options.overrides?.(spec)
      ?? scriptedResult(spec, files, options.measure, options.readerStderr)
    );
  });
  const deps: GateDependencies = {
    agentsRoot: ROOT,
    executor,
    listDirectory: mock(async (directory: string) => options.tree?.[directory] ?? []),
    makeTempDir: mock(async () => '/work'),
    readText: mock(async (file: string) => files.get(file)),
    sha256: hash,
    toolsRoot: ROOT,
    write: (message: string) => {
      output.push(message);
    },
    writeText: mock(async (file: string, content: string) => {
      files.set(file, content);
    }),
  };
  return { deps, executor, files, output };
};

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

  test.each([
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

describe('paths and fingerprints', () => {
  test('maps a document to its receipt and comprehension set', () => {
    expect(receiptPathFor('skills/aidp/SKILL.md')).toBe(
      path.join(RECEIPT_DIRECTORY, 'skills--aidp--SKILL.json'),
    );
    expect(setPathFor('AGENTS.md')).toBe(path.join('evals', 'AGENTS.json'));
    expect(setPathFor('skills/aidp/SKILL.md')).toBe(SET);
    expect(setPathFor('skills/aidp/references/deep/guide.md')).toBe(
      path.join('skills', 'aidp', 'evals', 'comprehension', 'references-deep-guide.json'),
    );
  });

  test('the root document pattern accepts instruction files only', () => {
    for (const name of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'AGENTS.local.md']) {
      expect(ROOT_DOCUMENT_PATTERN.test(name)).toBe(true);
    }
    for (const name of ['README.md', 'agents.md', 'AGENTS.json', 'MYAGENTS.md']) {
      expect(ROOT_DOCUMENT_PATTERN.test(name)).toBe(false);
    }
  });

  test.each(['bundleSha256', 'maxNewTokens', 'modelRevision', 'readerVersion'] as const)(
    'a different %s is a different reader',
    (field) => {
      const current = currentFingerprint();
      const other = { ...current, [field]: typeof current[field] === 'number' ? 999 : 'other' };

      expect(fingerprintMatches(current, current)).toBe(true);
      expect(fingerprintMatches(current, other)).toBe(false);
    },
  );

  test('a sealed receipt has sorted keys at every depth, whatever the construction order', () => {
    const shuffled = sealReceipt(
      {
        baseline: null,
        decision: 'baseline',
        document: DOCUMENT,
        documentSha256: hash('document text'),
        fingerprint: { bundleSha256: 'b', maxNewTokens: 8, modelRevision: 'm', readerVersion: 'v' },
        measurement: {
          trainFailed: ['t2'],
          trainPassed: ['t1'],
          validationPassed: 2,
          validationTotal: 3,
        },
        reason: '',
        schema: 1,
        setPath: SET,
        setSha256: hash(SET_TEXT),
      },
      hash,
    );

    expect(Object.keys(shuffled)).toEqual(Object.keys(shuffled).sort());
    expect(Object.keys(shuffled.measurement)).toEqual(Object.keys(shuffled.measurement).sort());
    expect(Object.keys(shuffled.fingerprint)).toEqual(Object.keys(shuffled.fingerprint).sort());
    expect(shuffled.selfSha256).toBe(
      sealReceipt(
        { ...shuffled, selfSha256: undefined } as unknown as Omit<Receipt, 'selfSha256'>,
        hash,
      ).selfSha256,
    );
  });

  test('sealing is deterministic and depends on every field', () => {
    expect(sealed().selfSha256).toBe(sealed().selfSha256);
    expect(sealed({ reason: 'x' }).selfSha256).not.toBe(sealed().selfSha256);
  });
});

describe('formatReceipt', () => {
  const many = Array.from(
    { length: 30 },
    (_value, index) => `train-${String(index).padStart(2, '0')}`,
  );

  test('keeps short arrays on one line, expands long ones, and ends with a newline', () => {
    const text = formatReceipt(sealed({ measurement: measurement(many, []) }));

    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('"trainFailed": [],');
    expect(text).toContain('"trainPassed": [\n      "train-00",\n');
    expect(formatReceipt(sealed())).toContain('"trainFailed": ["t2"],');
    const lines = text.split('\n').filter((line) => !line.includes('Sha256'));
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(100);
  });

  test('round-trips through JSON and expands arrays that hold objects', () => {
    const odd = { ...sealed(), empty: {}, nested: [{ a: 1 }, [2, 3]] } as unknown as Receipt;
    const text = formatReceipt(odd);

    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(odd)));
    expect(text).toContain('"empty": {},');
    expect(text).toContain('"nested": [\n    {\n      "a": 1\n    },\n    [2, 3]\n  ]');
  });
});

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
      `${path.join(ROOT, 'scripts', 'weak-reader.ts')} /work/bundle.json /work/answers.jsonl`,
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
    expect(harness.output.join('')).toContain('REJECTED skills/aidp/SKILL.md');
    expect(harness.output.join('')).toContain('Train probe t1 passed at baseline and now fails.');
    expect(harness.output.join('')).toContain('A baseline-passing train probe regressed.');
    expect(harness.output.join('')).toContain('Preserve wording outside the cited rule');
    expect(harness.output.join('')).toContain('smallest local edit');
    expect(harness.output.join('')).toContain('not accepted');
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

  test('a rejected edit prints each failing probe with the source rule and the reader view', async () => {
    const harness = withRichSet(
      withReceipt(
        makeHarness({ measure: measureStdout(['t2'], ['t1']) }),
        sealed({ measurement: measurement(['t1'], ['t2']) }),
      ),
    );
    harness.files.set(path.join(ROOT, SET), richSet);
    harness.files.set(
      path.join(ROOT, RECEIPT),
      JSON.stringify(
        sealed({ measurement: measurement(['t1'], ['t2']), setSha256: hash(richSet) }),
      ),
    );

    expect(await record([DOCUMENT], {}, harness.deps)).toBe(1);

    const text = harness.output.join('');
    expect(text).toContain('DIAGNOSIS skills/aidp/SKILL.md');
    expect(text).toContain('--- t1: expected A, the reader answered B');
    expect(text).toContain('Which letter?');
    expect(text).toContain('Source rule: Rule one.');
    expect(text).toContain("Reader's view: Say it plainly.");
    const suggestCall = harness.executor.mock.calls
      .map(([spec]) => (spec as CommandSpec).args)
      .find((args) => args.includes('suggest'));
    expect(suggestCall?.slice(-3)).toEqual([
      '/work/bundle.json',
      '/work/failures.json',
      '/work/suggestions.jsonl',
    ]);
    expect(JSON.parse(harness.files.get('/work/failures.json') ?? '[]')).toEqual([
      { expected: 'A', given: 'B', id: 't1', query: 'Which letter?\nA) one\nB) two' },
    ]);
  });

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
          spec.args.some((arg) => arg.endsWith('weak-reader.ts'))
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

describe('record failures', () => {
  test.each([
    [
      'train bundle',
      (spec: CommandSpec) =>
        spec.args.includes('bundle') ? { code: 1, stderr: 'no set', stdout: '' } : undefined,
      'train bundle failed: no set',
    ],
    [
      'the reader without a GPU',
      (spec: CommandSpec) =>
        spec.args.some((a) => a.endsWith('weak-reader.ts'))
          ? { code: 2, stderr: 'no adapter', stdout: '' }
          : undefined,
      'outside the sandbox',
    ],
    [
      'the reader failing otherwise',
      (spec: CommandSpec) =>
        spec.args.some((a) => a.endsWith('weak-reader.ts'))
          ? { code: 3, stderr: 'bad blob', stdout: '' }
          : undefined,
      'weak reader exited 3: bad blob',
    ],
    [
      'train measure',
      (spec: CommandSpec) =>
        spec.args.includes('measure') ? { code: 1, stderr: 'bad answers', stdout: '' } : undefined,
      'train measure failed: bad answers',
    ],
    [
      'unusable measure output',
      (spec: CommandSpec) =>
        spec.args.includes('measure')
          ? { code: 0, stderr: '', stdout: '{"measurement":{}}' }
          : undefined,
      'returned no trainQueries',
    ],
    [
      'unusable measure output shape',
      (spec: CommandSpec) =>
        spec.args.includes('measure') ? { code: 0, stderr: '', stdout: '[]' } : undefined,
      'returned no trainQueries',
    ],
  ])(
    '%s fails the document with its reason and writes no receipt',
    async (_label, overrides, message) => {
      const harness = makeHarness({ overrides });

      expect(await record([DOCUMENT], {}, harness.deps)).toBe(1);
      expect(harness.output.join('')).toContain(`FAILED ${DOCUMENT}`);
      expect(harness.output.join('')).toContain(message);
      expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(false);
    },
  );

  test('a thrown non-error value is still reported', async () => {
    const harness = makeHarness();
    const failing = {
      ...harness.deps,
      executor: mock(async () => {
        throw 'plain text';
      }),
    };

    expect(await record([DOCUMENT], {}, failing)).toBe(1);
    expect(harness.output.join('')).toContain('FAILED skills/aidp/SKILL.md: plain text');
  });
});

describe('arguments, run, and the command line', () => {
  test('parses paths and reasons', () => {
    expect(parseRecordArguments(['a.md', '--allow-equal', 'typo fix', 'b.md'])).toEqual({
      documents: ['a.md', 'b.md'],
      options: { allowEqualReason: 'typo fix', rebaselineReason: undefined },
    });
    expect(parseRecordArguments(['--rebaseline', 'new model']).options.rebaselineReason).toBe(
      'new model',
    );
    expect(parseRecordArguments([]).documents).toEqual([]);
  });

  test.each<[readonly string[]]>([
    [['--allow-equal']],
    [['--rebaseline', ' ']],
    [['--allow-equal', '--rebaseline', 'x']],
  ])('a flag without a written reason is refused: %p', (args) => {
    expect(() => parseRecordArguments(args)).toThrow('needs a written reason');
  });

  test('run routes verify and record and rejects everything else', async () => {
    const harness = makeHarness();

    expect(await run(['verify'], harness.deps)).toBe(1);
    expect(await run(['record', DOCUMENT], harness.deps)).toBe(0);
    for (const bad of [[], ['verify', 'extra'], ['unknown']]) {
      await expect(run(bad, harness.deps)).rejects.toThrow('Usage:');
    }
    expect(usage()).toContain('instruction-gate.ts verify');
  });

  test('runCli sets the exit code from run and reports errors', async () => {
    const harness = makeHarness();
    const codes: number[] = [];

    await runCli(['verify'], harness.deps, (code) => codes.push(code));
    await runCli(['bogus'], harness.deps, (code) => codes.push(code));
    await runCli(
      ['verify'],
      {
        ...harness.deps,
        listDirectory: mock(async () => {
          throw 'not an error';
        }),
      },
      (code) => codes.push(code),
    );

    expect(codes).toEqual([1, 1, 1]);
    expect(harness.output.join('')).toContain('Usage:');
    expect(harness.output.join('')).toContain('not an error');
  });

  test.each(['--help', '-h'])('runCli prints the usage for %s without running', async (flag) => {
    const harness = makeHarness();
    const codes: number[] = [];

    await runCli([flag], harness.deps, (code) => codes.push(code));

    expect(harness.output.join('')).toContain('Usage:');
    expect(codes).toEqual([]);
    expect(harness.executor).not.toHaveBeenCalled();
  });

  test('runCli defaults its exit-code setter to the process boundary', async () => {
    const harness = makeHarness();
    const original = processExit.setExitCode;
    const setter = mock();
    processExit.setExitCode = setter;
    try {
      await runCli(['bogus'], harness.deps);
    } finally {
      processExit.setExitCode = original;
    }

    expect(setter).toHaveBeenCalledWith(1);
  });

  test('processExit writes to a supplied target', () => {
    const exitTarget: { exitCode?: number } = {};
    processExit.setExitCode(3, exitTarget);

    expect(exitTarget.exitCode).toBe(3);
  });
});

describe('--agents-root', () => {
  const PROJECT = '/project/.agents';
  const projectTree = {
    [PROJECT]: [{ isDirectory: true, name: 'skills' }],
    [path.join(PROJECT, 'skills')]: [{ isDirectory: true, name: 'aidp' }],
    [path.join(PROJECT, 'skills', 'aidp')]: [{ isDirectory: false, name: 'SKILL.md' }],
  };
  const commandsOf = (harness: Harness): string[] =>
    harness.executor.mock.calls.map(([spec]) => (spec as CommandSpec).args.join(' '));
  const projectHarness = (): Harness => {
    const harness = makeHarness({ tree: projectTree });
    for (const relative of [DOCUMENT, SET]) {
      harness.files.set(
        path.join(PROJECT, relative),
        harness.files.get(path.join(ROOT, relative)) ?? '',
      );
      harness.files.delete(path.join(ROOT, relative));
    }
    return harness;
  };

  test('without the flag the content root stays the package root', async () => {
    const harness = makeHarness();

    expect(await run(['record', DOCUMENT], harness.deps)).toBe(0);
    expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(true);
    expect(commandsOf(harness)[0]).toContain(`train bundle ${path.join(ROOT, SET)}`);
  });

  test('record resolves the document, set, and receipt under the flag root', async () => {
    const harness = projectHarness();

    expect(await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps)).toBe(0);

    expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(false);
    expect(JSON.parse(harness.files.get(path.join(PROJECT, RECEIPT)) ?? '{}')).toMatchObject({
      document: DOCUMENT,
      setPath: SET,
    });
    expect(commandsOf(harness)[0]).toContain(`train bundle ${path.join(PROJECT, SET)}`);
  });

  test('tools still resolve from the package root', async () => {
    const harness = projectHarness();

    await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps);

    const commands = commandsOf(harness);
    expect(commands[0]).toContain(path.join(ROOT, 'scripts', 'skill-manager.ts'));
    expect(commands[1]).toContain(path.join(ROOT, 'scripts', 'weak-reader.ts'));
    expect(commands.some((command) => command.includes(path.join(PROJECT, 'scripts')))).toBe(false);
  });

  test('verify checks the documents under the flag root and skips the routing receipt', async () => {
    const harness = projectHarness();
    await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps);
    harness.output.length = 0;

    expect(await run(['verify', '--agents-root', PROJECT], harness.deps)).toBe(0);
    expect(harness.output.join('')).toContain('passed - 1 instruction documents have');
  });

  test.each<[string[], string]>([
    [['relative/path'], 'an absolute path'],
    [['/project/../etc'], 'without ".." segments'],
    [['/missing'], 'an existing directory'],
    [['/empty'], 'contains a skills or evals directory'],
    [[], 'an absolute path'],
  ])('the root %p is rejected before any measurement', async (value, message) => {
    const harness = makeHarness();
    const deps: GateDependencies = {
      ...harness.deps,
      listDirectory: mock(async (directory: string) => {
        if (directory === '/missing') {
          throw new Error('ENOENT');
        }
        return directory === '/empty' ? [{ isDirectory: false, name: 'notes.md' }] : [];
      }),
    };

    await expect(run(['record', '--agents-root', ...value], deps)).rejects.toThrow(message);
    expect(harness.executor).not.toHaveBeenCalled();
  });

  test('descriptions are rejected for a non-default root and documented in the usage', async () => {
    const harness = projectHarness();

    await expect(
      run(['record', '--agents-root', PROJECT, 'descriptions'], harness.deps),
    ).rejects.toThrow('gated only for the default root');
    expect(harness.executor).not.toHaveBeenCalled();
    expect(usage()).toContain('--agents-root <absolute-path>');
  });
});

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
      expect(deps.agentsRoot.endsWith('.agents') || deps.agentsRoot.length > 0).toBe(true);
    } finally {
      process.stdout.write = original;
    }

    expect(writeSpy).toHaveBeenCalledWith('hello');
  });
});
