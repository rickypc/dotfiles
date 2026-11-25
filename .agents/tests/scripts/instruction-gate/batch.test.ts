import { expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as realPath from 'node:path';
import * as realIntent from '../../../scripts/instruction-gate/intent.js';
import type { CommandResult, CommandSpec } from '../../../utils/contracts.js';
import * as realProcess from '../../../utils/process.js';
import * as realTrain from '../../../utils/quality-engine/train/index.js';

type Hooks = Parameters<typeof evaluateBatch<{ readonly reader: string }>>[2];

interface ManifestItem {
  readonly answersPath: string;
  readonly bundlePath: string;
  readonly expected?: Record<string, string>;
  readonly rawRepliesPath: string;
  readonly suggestionsPath: string;
}

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:path', () => realPath);
mock.module('./instruction-gate-intent.js', () => realIntent);
mock.module('../utils/process.js', () => realProcess);
mock.module('../utils/quality-engine/train.js', () => realTrain);

const { MAX_BATCH_CANDIDATES, evaluateBatch, parseBatchRequest } = await import(
  '../../../scripts/instruction-gate/batch.js'
);

const probe = (id: string, split: string, expected: string, extra = {}) => ({
  evidence: 'rule',
  expected,
  id,
  query: `${id}?\nA) one\nB) two`,
  split,
  ...extra,
});

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

const setText = JSON.stringify({
  kind: 'comprehension',
  queries: [
    probe('train-01', 'train', 'A'),
    probe('train-02', 'train', 'B'),
    probe('train-03', 'train', 'A', { retired: 'obsolete' }),
    probe('validation-01', 'validation', 'A'),
  ],
  runs_per_query: 3,
  skill_name: 'demo--doc',
  splits: { train: 't', validation: 'v' },
  target: '../doc.md',
});

const hooks: Hooks = {
  fingerprint: () => ({ reader: 'v1' }),
  measurementOf: (stdout) => {
    const { measurement } = JSON.parse(stdout) as {
      measurement: {
        trainQueries: { id: string; passed: boolean }[];
        validation: { passedQueries: number; totalQueries: number };
      };
    };
    return {
      trainFailed: measurement.trainQueries.filter((q) => !q.passed).map((q) => q.id),
      trainPassed: measurement.trainQueries.filter((q) => q.passed).map((q) => q.id),
      validationPassed: measurement.validation.passedQueries,
      validationTotal: measurement.validation.totalQueries,
    };
  },
  targetOf: (document) =>
    document === 'routing.md'
      ? { setPath: 'sets/routing.json', skill: 'demo' }
      : { setPath: `sets/${document}.json` },
};

// The fake reader answers every probe correctly unless the bundled document says BAD, in which
// case train-01 gets the wrong letter; it also writes raw replies and suggestions like the real one.
const failedReader = (exitCode: number): CommandResult => ({
  code: 1,
  stderr: exitCode === 3 ? '' : 'boom',
  stdout:
    exitCode === 2
      ? '{"data":{"reason":"no-adapter"}}'
      : exitCode === 3
        ? '{"data":{"reason":"integrity"}}'
        : '',
});

const letterFor = (
  expected: Record<string, string> | undefined,
  document: string,
  id: string,
): string => {
  if (expected === undefined) {
    return document.includes('NEW') ? 'B' : 'A';
  }
  if (document.includes('BAD') && id === 'train-01') {
    return 'B';
  }
  return expected[id] ?? 'A';
};

const readerSetup = (extraFiles: Record<string, string> = {}, exitCode = 0) => {
  const files = new Map<string, string>([
    ['/root/doc.md', 'current text'],
    ['/root/sets/doc.md.json', setText],
    ['/root/other.md', 'other text'],
    ['/root/sets/other.md.json', setText],
    ...Object.entries(extraFiles),
  ]);
  const calls: CommandSpec[] = [];
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    calls.push(spec);
    if (exitCode !== 0) {
      return failedReader(exitCode);
    }
    const manifest = JSON.parse(files.get(spec.args[2] ?? '') ?? '{}') as {
      items: ManifestItem[];
    };
    for (const item of manifest.items) {
      const bundle = JSON.parse(files.get(item.bundlePath) ?? '{}') as {
        document: string;
        prompts: { query_id: string; run: number }[];
      };
      const bad = bundle.document.includes('BAD');
      const given = (id: string): string => letterFor(item.expected, bundle.document, id);
      files.set(
        item.answersPath,
        bundle.prompts
          .map((p) =>
            JSON.stringify({ answer: given(p.query_id), query_id: p.query_id, run: p.run }),
          )
          .join('\n'),
      );
      if (bad) {
        files.set(item.rawRepliesPath, '{"query_id":"train-01","raw_reply":"B)"}\n');
        files.set(item.suggestionsPath, '{"id":"train-01","suggestion":"read rule"}\n');
      }
    }
    return { code: 0, stderr: ' GPU ready ', stdout: '' };
  });
  const deps = {
    agentsRoot: '/root',
    executor,
    makeTempDir: async () => '/work',
    readText: async (file: string) => files.get(file),
    sha256: sha,
    toolsRoot: '/tools',
    writeText: async (file: string, content: string) => {
      files.set(file, content);
    },
  };
  return { calls, deps, executor, files };
};

const request = (targets: unknown[]): string => JSON.stringify({ schemaVersion: 1, targets });

test('scores every candidate of every document in one reader session without writing receipts', async () => {
  const { calls, deps, files } = readerSetup();
  const result = await evaluateBatch(
    request([
      {
        candidates: [{ id: 'current' }, { id: 'edit', source: 'BAD edit' }],
        document: 'doc.md',
      },
      { candidates: [{ id: 'current' }], document: 'other.md' },
    ]),
    deps,
    hooks,
  );

  expect(calls.map((c) => [c.command, c.args[0], c.args[1]])).toEqual([
    ['bun', '/tools/scripts/weak-reader/index.ts', 'batch'],
  ]);
  expect(result.fingerprint).toEqual({ reader: 'v1' });
  expect(result.reader).toBe('GPU ready');
  expect(
    result.targets.map((t) => [t.document, t.setSha256, t.candidates.map((c) => c.id)]),
  ).toEqual([
    ['doc.md', sha(setText), ['current', 'edit']],
    ['other.md', sha(setText), ['current']],
  ]);
  const [current, edit] = result.targets[0]?.candidates ?? [];
  expect(current?.sourceSha256).toBe(sha('current text'));
  expect(current?.measurement).toEqual({
    trainFailed: [],
    trainPassed: ['train-01', 'train-02'],
    validationPassed: 1,
    validationTotal: 1,
  });
  expect(current?.passed).toEqual({ 'train-01': true, 'train-02': true, 'validation-01': true });
  expect(current?.failures).toEqual([]);
  expect(edit?.sourceSha256).toBe(sha('BAD edit'));
  expect(edit?.measurement.trainFailed).toEqual(['train-01']);
  expect(edit?.failures).toEqual([
    {
      expected: 'A',
      given: 'B',
      id: 'train-01',
      query: 'train-01?\nA) one\nB) two',
      rawReply: 'B)',
      suggestion: 'read rule',
    },
  ]);
  const manifest = JSON.parse(files.get('/work/batch.json') ?? '{}') as { items: ManifestItem[] };
  expect(manifest.items.map((item) => item.expected)).toEqual([
    { 'train-01': 'A', 'train-02': 'B' },
    { 'train-01': 'A', 'train-02': 'B' },
    { 'train-01': 'A', 'train-02': 'B' },
  ]);
  expect(
    [...files.keys()].some((file) => file.includes('receipts') || file.includes('ledger')),
  ).toBe(false);
});

const intents = [
  { expected: 'B', id: 'gain', op: 'add', options: ['old', 'new'], prompt: 'Which rule now?' },
  { expected: 'B', id: 'gone', op: 'retire', options: ['old', 'new'], prompt: 'Which rule now?' },
];

test('scores intent probes on the text before and after the edit in the same reader run', async () => {
  const { deps, files } = readerSetup();
  const result = await evaluateBatch(
    request([
      {
        candidates: [{ id: 'current' }, { id: 'edit', intents, source: 'NEW rule' }],
        document: 'doc.md',
      },
    ]),
    deps,
    hooks,
  );
  const [current, edit] = result.targets[0]?.candidates ?? [];
  expect(current?.intents).toEqual([]);
  expect(edit?.intents).toEqual([
    { after: true, before: false, id: 'gain', op: 'add', proven: true },
    { after: true, before: false, id: 'gone', op: 'retire', proven: false },
  ]);
  const manifest = JSON.parse(files.get('/work/batch.json') ?? '{}') as { items: ManifestItem[] };
  expect(manifest.items).toHaveLength(4);
  const documentOf = (suffix: string): string =>
    (JSON.parse(files.get(`/work/1.intent-${suffix}.bundle.json`) ?? '{}') as { document: string })
      .document;
  expect([documentOf('before'), documentOf('after')]).toEqual(['current text', 'NEW rule']);
  expect(manifest.items.slice(2).every((item) => item.expected === undefined)).toBe(true);
});

test('fails when the reader wrote no intent answers', async () => {
  const { deps, executor, files } = readerSetup();
  const base = executor.getMockImplementation() as typeof executor;
  executor.mockImplementation(async (spec) => {
    const result = await base(spec);
    for (const key of [...files.keys()].filter((file) => file.includes('.intent-'))) {
      if (key.endsWith('.answers.jsonl')) {
        files.delete(key);
      }
    }
    return result;
  });
  await expect(
    evaluateBatch(
      request([{ candidates: [{ id: 'edit', intents, source: 'NEW rule' }], document: 'doc.md' }]),
      deps,
      hooks,
    ),
  ).rejects.toThrow('The reader wrote no intent answers for doc.md (edit).');
});

test('reports a failed reader with the sandbox hint only for a no-adapter envelope', async () => {
  const request1 = request([{ candidates: [{ id: 'c' }], document: 'doc.md' }]);
  await expect(evaluateBatch(request1, readerSetup({}, 2).deps, hooks)).rejects.toThrow(
    'weak reader exited 1 (no GPU adapter: run this command outside the sandbox): boom',
  );
  await expect(evaluateBatch(request1, readerSetup({}, 1).deps, hooks)).rejects.toThrow(
    'weak reader exited 1: boom',
  );
  await expect(evaluateBatch(request1, readerSetup({}, 3).deps, hooks)).rejects.toThrow(
    'weak reader exited 1: {"data":{"reason":"integrity"}}',
  );
});

test('fails when the reader wrote no answers for a candidate', async () => {
  const { deps, executor } = readerSetup();
  executor.mockImplementation(async () => ({ code: 0, stderr: '', stdout: '' }));
  await expect(
    evaluateBatch(request([{ candidates: [{ id: 'c' }], document: 'doc.md' }]), deps, hooks),
  ).rejects.toThrow('The reader wrote no answers for doc.md (c).');
});

test.each([
  ['a routing document', { 'routing.md': 'x' }, 'routing.md', 'not routing'],
  ['a missing document', {}, 'absent.md', 'Missing document or comprehension set for absent.md.'],
  [
    'a routing query set',
    {
      '/root/sets/doc.md.json': JSON.stringify({
        kind: 'routing',
        queries: [{ id: 't1', query: 'q', should_trigger: true, split: 'train' }],
        runs_per_query: 3,
        skill_name: 'demo',
        splits: {},
      }),
    },
    'doc.md',
    'is not a comprehension set',
  ],
])('rejects %s before the reader runs', async (_name, files, document, message) => {
  const setup = readerSetup(files);
  await expect(
    evaluateBatch(request([{ candidates: [{ id: 'c' }], document }]), setup.deps, hooks),
  ).rejects.toThrow(message);
  expect(setup.executor).not.toHaveBeenCalled();
});

const candidates = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `c${i}` }));

test.each([
  ['invalid JSON', 'not json'],
  ['a non-object request', '[]'],
  ['another schema version', JSON.stringify({ schemaVersion: 2, targets: [] })],
  ['no targets', request([])],
  ['a non-array targets value', JSON.stringify({ schemaVersion: 1, targets: 'x' })],
  ['a non-object target', request(['x'])],
  ['an absolute document', request([{ candidates: candidates(1), document: '/etc/x' }])],
  ['a parent traversal', request([{ candidates: candidates(1), document: 'a/../b.md' }])],
  ['a non-string document', request([{ candidates: candidates(1), document: 3 }])],
  ['missing candidates', request([{ document: 'a.md' }])],
  ['zero candidates', request([{ candidates: [], document: 'a.md' }])],
  [
    'too many candidates',
    request([{ candidates: candidates(MAX_BATCH_CANDIDATES + 1), document: 'a.md' }]),
  ],
  ['a blank candidate id', request([{ candidates: [{ id: ' ' }], document: 'a.md' }])],
  ['a non-string source', request([{ candidates: [{ id: 'c', source: 3 }], document: 'a.md' }])],
  [
    'intents that are not a list',
    request([{ candidates: [{ id: 'c', intents: 'x' }], document: 'a.md' }]),
  ],
  [
    'an incomplete intent',
    request([{ candidates: [{ id: 'c', intents: [{ id: 'x' }] }], document: 'a.md' }]),
  ],
  [
    'duplicate intent ids',
    request([{ candidates: [{ id: 'c', intents: [intents[0], intents[0]] }], document: 'a.md' }]),
  ],
  [
    'too many intents',
    request([
      {
        candidates: [
          {
            id: 'c',
            intents: Array.from({ length: 11 }, (_, i) => ({ ...intents[0], id: `i${i}` })),
          },
        ],
        document: 'a.md',
      },
    ]),
  ],
  ['a non-object candidate', request([{ candidates: ['c'], document: 'a.md' }])],
  [
    'duplicate candidate ids',
    request([{ candidates: [{ id: 'c' }, { id: 'c' }], document: 'a.md' }]),
  ],
  [
    'duplicate documents',
    request([
      { candidates: candidates(1), document: 'a.md' },
      { candidates: candidates(1), document: 'a.md' },
    ]),
  ],
])('parseBatchRequest rejects %s', (_name, content) => {
  expect(() => parseBatchRequest(content)).toThrow(/evaluate-batch request/u);
});

test('parseBatchRequest accepts candidates with and without a source', () => {
  const targets = [
    { candidates: [{ id: 'current' }, { id: 'edit', source: 'text' }], document: 'a.md' },
  ];
  expect(parseBatchRequest(request(targets))).toEqual({ targets });
});
