import { expect, mock, test } from 'bun:test';
import * as path from 'node:path';
import realMatter from 'gray-matter';
import type { FileSystem } from '../../../utils/filesystem.js';
import * as realFilesystem from '../../../utils/filesystem.js';
import * as realPacket from '../../../utils/quality-engine/packet.js';
import * as realProvider from '../../../utils/quality-engine/provider.js';
import type { LedgerEntry, LedgerEntryInput } from '../../../utils/quality-engine/train.js';
import * as realTrainErrors from '../../../utils/quality-engine/train-errors.js';

mock.module('node:path', () => path);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../filesystem.js', () => realFilesystem);
mock.module('./packet.js', () => realPacket);
mock.module('./provider.js', () => realProvider);
mock.module('./train-errors.js', () => realTrainErrors);

const {
  appendLedgerEntry,
  baselineEntryFor,
  buildSkillCatalog,
  decideNeverWorseGate,
  defaultLedgerRootFor,
  LedgerError,
  ledgerPathFor,
  loadResponses,
  loadTriggerQuerySet,
  matrixFingerprintForQuerySet,
  MeasurementError,
  measurementFromRecords,
  measureTriggerBehavior,
  parseResponses,
  parseTriggerQuerySet,
  plansIndexFor,
  promptsFor,
  readLedger,
  selectWinningAttempt,
  TriggerQuerySetError,
} = await import('../../../utils/quality-engine/train.js');

const SOURCE_PATH = '/agents/skills/skill-manager/evals/trigger-queries.json';

const querySetJson = JSON.stringify(
  {
    pass_threshold: 0.5,
    queries: [
      { id: 'train-01', query: 'Create a new Agent Skill.', should_trigger: true, split: 'train' },
      {
        id: 'train-02',
        query: 'Install the spreadsheet skill.',
        should_trigger: false,
        split: 'train',
      },
      {
        id: 'validation-01',
        query: 'Review this skill package.',
        should_trigger: true,
        split: 'validation',
      },
      {
        id: 'validation-02',
        query: 'Convert this JSON to YAML.',
        should_trigger: false,
        split: 'validation',
      },
    ],
    runs_per_query: 3,
    skill_name: 'skill-manager',
    splits: {
      train: 'Use only failures from this split to revise description.',
      validation: 'Keep fixed and hidden from revision decisions.',
    },
  },
  null,
  2,
);

const querySet = parseTriggerQuerySet(querySetJson, SOURCE_PATH);

const readFileSystemFor = (
  files: Readonly<Record<string, string>>,
): Pick<FileSystem, 'readFile'> => ({
  readFile: async (filePath: string) => {
    const content = files[filePath];
    if (content === undefined) {
      throw new Error(`Missing ${filePath}`);
    }
    return content;
  },
});

const recordsFor = (answers: Readonly<Record<string, readonly string[]>>) =>
  querySet.queries.flatMap(({ id }) =>
    (answers[id] ?? []).map((skillName, runIndex) => ({
      queryId: id,
      run: runIndex + 1,
      skillName,
    })),
  );

const alwaysSkillManager = recordsFor({
  'train-01': ['skill-manager', 'skill-manager', 'skill-manager'],
  'train-02': ['knowledge-base', 'knowledge-base', 'knowledge-base'],
  'validation-01': ['skill-manager', 'skill-manager', 'skill-manager'],
  'validation-02': ['skill-manager', 'skill-manager', 'knowledge-base'],
});

const measurementFor = (
  trainScore: number,
  validationScore: number,
): LedgerEntryInput['measurement'] => ({
  boundary: 'in-session',
  passThreshold: 0.5,
  perQuery: [],
  runsPerQuery: 3,
  skillName: 'skill-manager',
  train: { passedQueries: trainScore * 4, score: trainScore, totalQueries: 4 },
  validation: { passedQueries: validationScore * 4, score: validationScore, totalQueries: 4 },
});

const entryFor = (
  attempt: number,
  status: LedgerEntry['status'],
  trainScore: number,
  validationScore: number,
): LedgerEntry => ({
  attempt,
  boundary: 'in-session',
  id: `skill-manager-${status}-${attempt}`,
  matrixFingerprint: 'matrix',
  measurement: measurementFor(trainScore, validationScore),
  sourceFingerprint: `source-${attempt}`,
  status,
  timestamp: '2026-10-30T00:00:00.000Z',
});

test('parses the authored query set without re-splitting it', () => {
  expect(querySet).toEqual({
    passThreshold: 0.5,
    queries: [
      { id: 'train-01', query: 'Create a new Agent Skill.', shouldTrigger: true, split: 'train' },
      {
        id: 'train-02',
        query: 'Install the spreadsheet skill.',
        shouldTrigger: false,
        split: 'train',
      },
      {
        id: 'validation-01',
        query: 'Review this skill package.',
        shouldTrigger: true,
        split: 'validation',
      },
      {
        id: 'validation-02',
        query: 'Convert this JSON to YAML.',
        shouldTrigger: false,
        split: 'validation',
      },
    ],
    runsPerQuery: 3,
    skillName: 'skill-manager',
    sourcePath: SOURCE_PATH,
    splits: {
      train: 'Use only failures from this split to revise description.',
      validation: 'Keep fixed and hidden from revision decisions.',
    },
  });
});

test('rejects a query set with too few repeated runs', () => {
  const content = JSON.stringify({ ...JSON.parse(querySetJson), runs_per_query: 2 });
  expect(() => parseTriggerQuerySet(content, SOURCE_PATH)).toThrow(TriggerQuerySetError);
  expect(() => parseTriggerQuerySet(content, SOURCE_PATH)).toThrow('at least 3');
  const fractional = JSON.stringify({ ...JSON.parse(querySetJson), runs_per_query: 3.5 });
  expect(() => parseTriggerQuerySet(fractional, SOURCE_PATH)).toThrow('integer');
});

test('rejects a pass threshold outside the open interval', () => {
  for (const passThreshold of [0, 1, '0.5', null]) {
    const content = JSON.stringify({ ...JSON.parse(querySetJson), pass_threshold: passThreshold });
    expect(() => parseTriggerQuerySet(content, SOURCE_PATH)).toThrow('between 0 and 1');
  }
});

test('rejects duplicate query ids', () => {
  const parsed = JSON.parse(querySetJson) as { queries: { id: string }[] };
  parsed.queries[1] = { ...(parsed.queries[1] ?? {}), id: 'train-01' };
  const content = JSON.stringify(parsed);
  expect(() => parseTriggerQuerySet(content, SOURCE_PATH)).toThrow('duplicate query id train-01');
});

test('rejects an unknown split name', () => {
  const parsed = JSON.parse(querySetJson) as { queries: { split: string }[] };
  parsed.queries[0] = { ...(parsed.queries[0] ?? {}), split: 'heldout' };
  expect(() => parseTriggerQuerySet(JSON.stringify(parsed), SOURCE_PATH)).toThrow(
    'unknown split heldout',
  );
});

test('rejects incomplete query records and non-objects', () => {
  const base = JSON.parse(querySetJson) as { queries: unknown[] };
  expect(() =>
    parseTriggerQuerySet(JSON.stringify({ ...base, queries: [{}] }), SOURCE_PATH),
  ).toThrow('requires an id, a query string');
  expect(() =>
    parseTriggerQuerySet(JSON.stringify({ ...base, queries: ['nope'] }), SOURCE_PATH),
  ).toThrow('not an object');
  const noBoolean = JSON.parse(querySetJson) as { queries: { should_trigger: unknown }[] };
  noBoolean.queries[0] = { ...(noBoolean.queries[0] ?? {}), should_trigger: 'yes' };
  expect(() => parseTriggerQuerySet(JSON.stringify(noBoolean), SOURCE_PATH)).toThrow(
    'boolean should_trigger',
  );
  expect(() => parseTriggerQuerySet(JSON.stringify({ ...base, queries: [] }), SOURCE_PATH)).toThrow(
    'nonempty query array',
  );
  expect(() =>
    parseTriggerQuerySet(JSON.stringify({ ...base, skill_name: '  ' }), SOURCE_PATH),
  ).toThrow('nonempty query array');
  expect(() =>
    parseTriggerQuerySet(JSON.stringify({ ...base, splits: 'fixed' }), SOURCE_PATH),
  ).toThrow('splits must map split names');
});

test('names the file and line of malformed query-set JSON', () => {
  const content = '{\n  "skill_name": "skill-manager",\n  bad\n}';
  expect(() => parseTriggerQuerySet(content, SOURCE_PATH)).toThrow(
    `${SOURCE_PATH}:3 is not valid JSON`,
  );
  const escaped = '{\n  "skill_name": "a\\"b",\n  bad\n}';
  expect(() => parseTriggerQuerySet(escaped, SOURCE_PATH)).toThrow(
    `${SOURCE_PATH}:3 is not valid JSON`,
  );
  const unterminated = '{\n  "skill_name": "skill-manager"';
  expect(() => parseTriggerQuerySet(unterminated, SOURCE_PATH)).toThrow(
    `${SOURCE_PATH}:1 is not valid JSON`,
  );
});

test('loads a missing query set as a typed missing input', async () => {
  await expect(
    loadTriggerQuerySet(readFileSystemFor({}), '/missing/trigger-queries.json'),
  ).rejects.toThrow('the trigger query set is missing');
});

test('loads an authored query set through the injected reader', async () => {
  await expect(
    loadTriggerQuerySet(readFileSystemFor({ [SOURCE_PATH]: querySetJson }), SOURCE_PATH),
  ).resolves.toEqual(querySet);
});

test('builds the skill catalog from frontmatter and sorts it deterministically', async () => {
  const files: Record<string, string> = {
    '/agents/skills/knowledge-base/SKILL.md':
      '---\nname: knowledge-base\ndescription: KB owner.\n---\n# KB',
    '/agents/skills/no-name/SKILL.md': '---\ndescription: Missing name.\n---\n# No name',
    '/agents/skills/skill-manager/SKILL.md':
      '---\nname: skill-manager\ndescription: Skill owner.\n---\n# SM',
  };
  const fileSystem: Pick<FileSystem, 'readFile' | 'readdir'> = {
    readdir: async () => [
      { isDirectory: () => true, name: 'skill-manager' },
      { isDirectory: () => true, name: 'knowledge-base' },
      { isDirectory: () => true, name: 'no-name' },
      { isDirectory: () => true, name: 'broken' },
      { isDirectory: () => false, name: 'README.md' },
    ],
    readFile: async (filePath: string) => {
      const content = files[filePath];
      if (content === undefined) {
        throw new Error(`Missing ${filePath}`);
      }
      return content;
    },
  };
  await expect(buildSkillCatalog(fileSystem, '/agents/skills')).resolves.toEqual([
    { description: 'KB owner.', name: 'knowledge-base' },
    { description: 'Missing name.', name: 'no-name' },
    { description: 'Skill owner.', name: 'skill-manager' },
  ]);
});

test('requires directory listing support for the catalog', async () => {
  await expect(buildSkillCatalog(readFileSystemFor({}), '/agents/skills')).rejects.toThrow(
    'directory listing support',
  );
});

test('scores per-query trigger rates with the threshold applied per class', () => {
  const measurement = measurementFromRecords(querySet, alwaysSkillManager);
  expect(measurement.perQuery).toEqual([
    {
      hits: 3,
      id: 'train-01',
      passed: true,
      rate: 1,
      runs: 3,
      shouldTrigger: true,
      split: 'train',
    },
    {
      hits: 0,
      id: 'train-02',
      passed: true,
      rate: 0,
      runs: 3,
      shouldTrigger: false,
      split: 'train',
    },
    {
      hits: 3,
      id: 'validation-01',
      passed: true,
      rate: 1,
      runs: 3,
      shouldTrigger: true,
      split: 'validation',
    },
    {
      hits: 2,
      id: 'validation-02',
      passed: false,
      rate: 2 / 3,
      runs: 3,
      shouldTrigger: false,
      split: 'validation',
    },
  ]);
  expect(measurement.train).toEqual({ passedQueries: 2, score: 1, totalQueries: 2 });
  expect(measurement.validation).toEqual({ passedQueries: 1, score: 0.5, totalQueries: 2 });
  expect(measurement.boundary).toBe('in-session');
  expect(measurement.skillName).toBe('skill-manager');
});

test('records an inherited-child boundary route on the measurement', () => {
  expect(measurementFromRecords(querySet, alwaysSkillManager, 'inherited-child').boundary).toBe(
    'inherited-child',
  );
});

test('rejects incomplete run sets and an empty split', () => {
  const incomplete = alwaysSkillManager.filter(
    ({ queryId, run }) => queryId !== 'train-02' || run < 3,
  );
  expect(() => measurementFromRecords(querySet, incomplete)).toThrow('train-02 has 2 of 3 runs');
  const trainOnly = parseTriggerQuerySet(
    JSON.stringify({
      ...JSON.parse(querySetJson),
      queries: (JSON.parse(querySetJson) as { queries: unknown[] }).queries.slice(0, 2),
    }),
    SOURCE_PATH,
  );
  expect(() => measurementFromRecords(trainOnly, alwaysSkillManager)).toThrow(
    'train and validation queries',
  );
});

test('emits one deterministic router prompt per query and run', () => {
  const prompts = promptsFor(querySet, [{ description: 'Skill owner.', name: 'skill-manager' }]);
  expect(prompts).toHaveLength(12);
  expect(prompts.map(({ queryId, run }) => `${queryId}#${run}`)).toEqual([
    'train-01#1',
    'train-01#2',
    'train-01#3',
    'train-02#1',
    'train-02#2',
    'train-02#3',
    'validation-01#1',
    'validation-01#2',
    'validation-01#3',
    'validation-02#1',
    'validation-02#2',
    'validation-02#3',
  ]);
  expect(prompts[0]?.prompt.query).toBe('Create a new Agent Skill.');
});

test('measures trigger behavior through the injected boundary', async () => {
  const answers = [
    'skill-manager',
    'skill-manager',
    'skill-manager',
    'knowledge-base',
    'knowledge-base',
    'knowledge-base',
    'skill-manager',
    'skill-manager',
    'skill-manager',
    'knowledge-base',
    'knowledge-base',
    'knowledge-base',
  ];
  let call = 0;
  const outcome = await measureTriggerBehavior(
    querySet,
    [
      { description: 'Skill owner.', name: 'skill-manager' },
      { description: 'KB owner.', name: 'knowledge-base' },
    ],
    async () => answers[call++] ?? 'skill-manager',
  );
  expect(outcome.status).toBe('measured');
  if (outcome.status !== 'measured') {
    throw new Error('Expected a measured outcome.');
  }
  expect(outcome.measurement.train.score).toBe(1);
  expect(outcome.measurement.validation.score).toBe(1);
});

test('stops the run with a blocked receipt on an unparseable boundary answer', async () => {
  const outcome = await measureTriggerBehavior(
    querySet,
    [
      { description: 'Skill owner.', name: 'skill-manager' },
      { description: 'KB owner.', name: 'knowledge-base' },
    ],
    async () => 'not-a-skill',
  );
  expect(outcome.status).toBe('blocked');
  if (outcome.status !== 'blocked') {
    throw new Error('Expected a blocked outcome.');
  }
  expect(outcome.problem).toContain('not one catalog skill name');
  expect(outcome.nextAction).toContain('re-ask the in-session boundary');
});

test('stops the run with a blocked receipt on a thrown boundary failure', async () => {
  const outcome = await measureTriggerBehavior(
    querySet,
    [
      { description: 'Skill owner.', name: 'skill-manager' },
      { description: 'KB owner.', name: 'knowledge-base' },
    ],
    async () => {
      throw new Error('Session model unavailable.');
    },
  );
  expect(outcome.status).toBe('blocked');
  if (outcome.status !== 'blocked') {
    throw new Error('Expected a blocked outcome.');
  }
  expect(outcome.problem).toContain('Session model unavailable.');
});

test('parses router response lines with their field aliases', () => {
  const records = parseResponses(
    [
      JSON.stringify({ query_id: 'train-01', run: 1, skill_name: 'skill-manager' }),
      JSON.stringify({ answer: 'knowledge-base', id: 'train-02', run: 1 }),
      '',
    ].join('\n'),
    '/responses.jsonl',
  );
  expect(records).toEqual([
    { queryId: 'train-01', run: 1, skillName: 'skill-manager' },
    { queryId: 'train-02', run: 1, skillName: 'knowledge-base' },
  ]);
});

test('rejects malformed, duplicate, and incomplete response lines', () => {
  expect(() => parseResponses('{oops', '/responses.jsonl')).toThrow('/responses.jsonl:1');
  expect(() => parseResponses('"a string"', '/responses.jsonl')).toThrow('not a router answer');
  expect(() => parseResponses('{"query_id":"train-01","run":1}', '/responses.jsonl')).toThrow(
    'query_id, run, and skill_name',
  );
  expect(() => parseResponses('{"query_id":"t","run":0.5,"skill_name":"a"}', '/r.jsonl')).toThrow(
    'query_id, run, and skill_name',
  );
  expect(() =>
    parseResponses(
      [
        JSON.stringify({ query_id: 'train-01', run: 1, skill_name: 'skill-manager' }),
        JSON.stringify({ query_id: 'train-01', run: 1, skill_name: 'knowledge-base' }),
      ].join('\n'),
      '/responses.jsonl',
    ),
  ).toThrow('duplicate router answer train-01#1');
});

test('loads router responses or reports the missing input', async () => {
  const content = JSON.stringify({ query_id: 'train-01', run: 1, skill_name: 'skill-manager' });
  await expect(
    loadResponses(readFileSystemFor({ '/responses.jsonl': content }), '/responses.jsonl'),
  ).resolves.toEqual([{ queryId: 'train-01', run: 1, skillName: 'skill-manager' }]);
  await expect(loadResponses(readFileSystemFor({}), '/missing.jsonl')).rejects.toThrow(
    'router responses file is missing',
  );
  await expect(
    loadResponses(readFileSystemFor({ '/bad.jsonl': '{oops' }), '/bad.jsonl'),
  ).rejects.toThrow(MeasurementError);
  await expect(
    loadResponses(readFileSystemFor({ '/bad.jsonl': '{oops' }), '/bad.jsonl'),
  ).rejects.toThrow('/bad.jsonl:1 is not valid JSON');
});

test('reads an append-only ledger and rejects corrupt lines', async () => {
  const entry = entryFor(1, 'baseline', 0.5, 0.5);
  await expect(readLedger(readFileSystemFor({}), '/ledger.json')).resolves.toEqual([]);
  await expect(
    readLedger(readFileSystemFor({ '/ledger.json': `${JSON.stringify(entry)}\n` }), '/ledger.json'),
  ).resolves.toEqual([entry]);
  expect(() => parseResponses('', '/r.jsonl')).not.toThrow();
  await expect(
    readLedger(readFileSystemFor({ '/ledger.json': 'not json\n' }), '/ledger.json'),
  ).rejects.toThrow(LedgerError);
  await expect(
    readLedger(readFileSystemFor({ '/ledger.json': 'not json\n' }), '/ledger.json'),
  ).rejects.toThrow('/ledger.json:1 is not valid JSON');
  await expect(
    readLedger(readFileSystemFor({ '/ledger.json': '{"attempt":1}\n' }), '/ledger.json'),
  ).rejects.toThrow('ledger entry with an id');
});

test('derives the gitignored ledger path from the agents root at run time', () => {
  expect(plansIndexFor('/Users/rhuang/.agents')).toBe('Users-rhuang-.agents');
  expect(plansIndexFor('/Users/demo/.agents')).toBe('Users-demo-.agents');
  expect(ledgerPathFor('/plans/index/quality', 'skill-manager')).toBe(
    '/plans/index/quality/skill-manager.json',
  );
  expect(defaultLedgerRootFor('/Users/rhuang/.agents')).toBe(
    '/Users/rhuang/.agents/plans/Users-rhuang-.agents/quality',
  );
});

const baselineInput = (overrides: Partial<LedgerEntryInput> = {}): LedgerEntryInput => ({
  attempt: 0,
  boundary: 'in-session',
  matrixFingerprint: 'matrix',
  measurement: measurementFor(0.5, 0.5),
  sourceFingerprint: 'baseline-source',
  status: 'baseline',
  timestamp: '2026-10-30T00:00:00.000Z',
  ...overrides,
});

const ledgerFileSystem = (initial: Readonly<Record<string, string>> = {}) => {
  const files = new Map<string, string>(Object.entries(initial));
  const directories: string[] = [];
  const fileSystem: FileSystem = {
    exists: async (filePath: string) => files.has(filePath),
    mkdir: async (directory: string) => {
      directories.push(directory);
      return directory;
    },
    readdir: async () => [],
    readFile: async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`Missing ${filePath}`);
      }
      return content;
    },
    rm: async () => undefined,
    writeFile: async (filePath: string, content: string) => {
      files.set(filePath, content);
    },
  };
  return { directories, fileSystem, files };
};

test('appends ledger entries without rewriting prior lines', async () => {
  const { directories, files, fileSystem } = ledgerFileSystem();
  const first = await appendLedgerEntry(fileSystem, '/ledger/skill-manager.json', baselineInput());
  expect(first.id).toBe('skill-manager-baseline-1');
  expect(directories).toEqual(['/ledger']);
  const second = await appendLedgerEntry(
    fileSystem,
    '/ledger/skill-manager.json',
    baselineInput({ attempt: 1, sourceFingerprint: 'candidate-source', status: 'attempt' }),
  );
  expect(second.id).toBe('skill-manager-attempt-2');
  const lines = (files.get('/ledger/skill-manager.json') ?? '').split('\n').filter(Boolean);
  expect(lines).toHaveLength(2);
  expect(JSON.parse(lines[0] ?? '')).toEqual(first);
  await expect(readLedger(fileSystem, '/ledger/skill-manager.json')).resolves.toEqual([
    first,
    second,
  ]);
});

test('appends after authored content that lacks a trailing newline', async () => {
  const seeded = JSON.stringify(entryFor(1, 'baseline', 0.5, 0.5));
  const { files, fileSystem } = ledgerFileSystem({ '/ledger.json': seeded });
  const entry = await appendLedgerEntry(fileSystem, '/ledger.json', baselineInput());
  expect(files.get('/ledger.json')).toBe(`${seeded}\n${JSON.stringify(entry)}\n`);
});

test('selects the recorded baseline for the never-worse gate', () => {
  expect(baselineEntryFor([entryFor(1, 'attempt', 0.6, 0.6)])).toBeUndefined();
  expect(
    baselineEntryFor([entryFor(1, 'attempt', 0.6, 0.6), entryFor(2, 'baseline', 0.5, 0.5)]),
  ).toEqual(entryFor(2, 'baseline', 0.5, 0.5));
});

test('accepts a candidate only when train is strictly greater and validation holds', () => {
  const baseline = entryFor(0, 'baseline', 0.5, 0.5);
  const accepted = decideNeverWorseGate(
    baseline,
    baselineInput({
      attempt: 1,
      measurement: measurementFor(0.75, 0.5),
    }),
  );
  expect(accepted.decision).toBe('accepted');
  expect(accepted.reason).toContain('0.75 > baseline 0.5');
  expect(accepted.baseline).toEqual(baseline);
  expect(accepted.candidate).toEqual({ attempt: 1, sourceFingerprint: 'baseline-source' });
});

test('blocks an equal-or-worse train score at the strictly-greater boundary', () => {
  const baseline = entryFor(0, 'baseline', 0.5, 0.5);
  const equal = decideNeverWorseGate(
    baseline,
    baselineInput({ attempt: 1, measurement: measurementFor(0.5, 1) }),
  );
  expect(equal.decision).toBe('blocked');
  expect(equal.reason).toContain('0.5 <= baseline 0.5');
  const worse = decideNeverWorseGate(
    baseline,
    baselineInput({ attempt: 2, measurement: measurementFor(0.25, 1) }),
  );
  expect(worse.decision).toBe('blocked');
});

test('blocks a candidate that regresses the held-out validation split', () => {
  const decision = decideNeverWorseGate(
    entryFor(0, 'baseline', 0.5, 0.5),
    baselineInput({ attempt: 1, measurement: measurementFor(1, 0.25) }),
  );
  expect(decision.decision).toBe('blocked');
  expect(decision.reason).toContain('validation 0.25 < baseline 0.5');
});

test('selects the winning attempt by validation score and earliest attempt', () => {
  const baseline = entryFor(0, 'baseline', 0.5, 0.5);
  const attempts = [
    baseline,
    entryFor(1, 'attempt', 0.75, 0.5),
    entryFor(2, 'attempt', 0.75, 0.75),
    entryFor(3, 'attempt', 0.75, 0.75),
    entryFor(4, 'attempt', 1, 0.25),
  ];
  expect(selectWinningAttempt(attempts, baseline)).toEqual(entryFor(2, 'attempt', 0.75, 0.75));
  expect(
    selectWinningAttempt([baseline, entryFor(4, 'attempt', 1, 0.25)], baseline),
  ).toBeUndefined();
});

test('fingerprints the frozen query matrix independently of authoring order', () => {
  const reversed = parseTriggerQuerySet(
    JSON.stringify({
      ...JSON.parse(querySetJson),
      queries: [...(JSON.parse(querySetJson) as { queries: unknown[] }).queries].reverse(),
    }),
    SOURCE_PATH,
  );
  expect(matrixFingerprintForQuerySet(querySet)).toBe(matrixFingerprintForQuerySet(reversed));
  expect(matrixFingerprintForQuerySet(querySet)).not.toBe(
    matrixFingerprintForQuerySet(
      parseTriggerQuerySet(
        JSON.stringify({ ...JSON.parse(querySetJson), runs_per_query: 4 }),
        SOURCE_PATH,
      ),
    ),
  );
});
