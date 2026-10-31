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
  activeQueriesOf,
  appendLedgerEntry,
  baselineEntryFor,
  blindBundleFor,
  buildSkillCatalog,
  candidateDescriptionOf,
  decideNeverWorseGate,
  decideRollbackGate,
  defaultLedgerRootFor,
  editorMeasurementOf,
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
  queryRatchetViolations,
  querySetBalanceProblems,
  readLedger,
  selectWinningAttempt,
  TriggerQuerySetError,
  withCandidateDescription,
} = await import('../../../utils/quality-engine/train.js');

const SOURCE_PATH = '/agents/skills/skill-manager/evals/trigger-queries.json';

const querySetJson = JSON.stringify(
  {
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
    kind: 'routing',
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

test('rejects an unknown kind and a comprehension set without a target', () => {
  const base = JSON.parse(querySetJson) as Record<string, unknown>;
  expect(() =>
    parseTriggerQuerySet(JSON.stringify({ ...base, kind: 'other' }), SOURCE_PATH),
  ).toThrow('routing or comprehension');
  expect(() =>
    parseTriggerQuerySet(JSON.stringify({ ...base, kind: 'comprehension' }), SOURCE_PATH),
  ).toThrow('requires a target');
});

test('rejects a blank retirement reason on a query', () => {
  const parsed = JSON.parse(querySetJson) as { queries: Record<string, unknown>[] };
  parsed.queries[0] = { ...parsed.queries[0], retired: ' ' };
  expect(() => parseTriggerQuerySet(JSON.stringify(parsed), SOURCE_PATH)).toThrow('reason string');
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

test('scores per-query rates and passes only unanimous runs', () => {
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
      unstable: false,
    },
    {
      hits: 0,
      id: 'train-02',
      passed: true,
      rate: 0,
      runs: 3,
      shouldTrigger: false,
      split: 'train',
      unstable: false,
    },
    {
      hits: 3,
      id: 'validation-01',
      passed: true,
      rate: 1,
      runs: 3,
      shouldTrigger: true,
      split: 'validation',
      unstable: false,
    },
    {
      hits: 2,
      id: 'validation-02',
      passed: false,
      rate: 2 / 3,
      runs: 3,
      shouldTrigger: false,
      split: 'validation',
      unstable: true,
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

const measuredFor = (answers: Readonly<Record<string, readonly string[]>>) =>
  measurementFromRecords(querySet, recordsFor(answers));

const ALL_OTHER = ['knowledge-base', 'knowledge-base', 'knowledge-base'];
const ALL_TARGET = ['skill-manager', 'skill-manager', 'skill-manager'];

const failingBaseline = measuredFor({
  'train-01': ALL_OTHER,
  'train-02': ALL_OTHER,
  'validation-01': ALL_TARGET,
  'validation-02': ALL_OTHER,
});

const gateEntry = (
  attempt: number,
  status: LedgerEntry['status'],
  measurement: LedgerEntryInput['measurement'],
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry => ({
  attempt,
  boundary: 'in-session',
  id: `skill-manager-${status}-${attempt}`,
  matrixFingerprint: 'matrix',
  measurement,
  sourceFingerprint: `source-${attempt}`,
  status,
  timestamp: '2026-10-30T00:00:00.000Z',
  ...overrides,
});

const gateBaseline = gateEntry(0, 'baseline', failingBaseline);

const improved = measuredFor({
  'train-01': ALL_TARGET,
  'train-02': ALL_OTHER,
  'validation-01': ALL_TARGET,
  'validation-02': ALL_OTHER,
});

test('selects the latest recorded baseline for the never-worse gate', () => {
  expect(baselineEntryFor([entryFor(1, 'attempt', 0.6, 0.6)])).toBeUndefined();
  expect(
    baselineEntryFor([
      entryFor(1, 'baseline', 0.4, 0.4),
      entryFor(2, 'attempt', 0.6, 0.6),
      entryFor(3, 'baseline', 0.5, 0.5),
    ]),
  ).toEqual(entryFor(3, 'baseline', 0.5, 0.5));
});

test('accepts a candidate with a unanimous gain and no regression', () => {
  const accepted = decideNeverWorseGate(
    gateBaseline,
    baselineInput({ attempt: 1, measurement: improved, status: 'attempt' }),
  );
  expect(accepted.decision).toBe('accepted');
  expect(accepted.reason).toBe('Gained 1 queries (train 1, validation 0) with no regressions.');
  expect(accepted.gained).toEqual({ train: 1, validation: 0 });
  expect(accepted.regressed).toEqual({ train: 0, validation: 0 });
  expect(accepted.candidate).toEqual({ attempt: 1, sourceFingerprint: 'baseline-source' });
});

test('blocks a candidate that regresses any previously passing query even with a gain', () => {
  const regressed = measuredFor({
    'train-01': ALL_TARGET,
    'train-02': ALL_OTHER,
    'validation-01': ALL_OTHER,
    'validation-02': ALL_OTHER,
  });
  const decision = decideNeverWorseGate(
    gateBaseline,
    baselineInput({ attempt: 1, measurement: regressed, status: 'attempt' }),
  );
  expect(decision.decision).toBe('blocked');
  expect(decision.reason).toBe('Regressed 1 previously passing queries (train 0, validation 1).');
  expect(decision.regressed).toEqual({ train: 0, validation: 1 });
  expect(decision.gained).toEqual({ train: 1, validation: 0 });
});

test('requires a unanimous newly passing query before accepting a gain', () => {
  const unstable = measuredFor({
    'train-01': ['skill-manager', 'skill-manager', 'knowledge-base'],
    'train-02': ALL_OTHER,
    'validation-01': ALL_TARGET,
    'validation-02': ALL_OTHER,
  });
  const decision = decideNeverWorseGate(
    gateBaseline,
    baselineInput({ attempt: 1, measurement: unstable, status: 'attempt' }),
  );
  expect(decision.decision).toBe('blocked');
  expect(decision.reason).toBe('No query newly passes on every run.');
});

test('reports saturation when the baseline already passes every query', () => {
  const saturated = gateEntry(
    0,
    'baseline',
    measuredFor({
      'train-01': ALL_TARGET,
      'train-02': ALL_OTHER,
      'validation-01': ALL_TARGET,
      'validation-02': ALL_OTHER,
    }),
  );
  const decision = decideNeverWorseGate(
    saturated,
    baselineInput({ attempt: 1, measurement: improved, status: 'attempt' }),
  );
  expect(decision.decision).toBe('blocked');
  expect(decision.reason).toContain('No headroom');
});

test('blocks a deterministic failure, a changed query set, and an unchanged source', () => {
  const candidate = baselineInput({ attempt: 1, measurement: improved, status: 'attempt' });
  const hard = decideNeverWorseGate(gateBaseline, candidate, {
    hardFailure: 'description too long',
    requireGain: true,
  });
  expect(hard.reason).toBe('Deterministic check failed: description too long');
  const weakened = decideNeverWorseGate(gateBaseline, {
    ...candidate,
    matrixFingerprint: 'weakened-matrix',
  });
  expect(weakened.decision).toBe('blocked');
  expect(weakened.reason).toContain('frozen query set changed');
  const unchanged = decideNeverWorseGate(gateBaseline, {
    ...candidate,
    sourceFingerprint: gateBaseline.sourceFingerprint,
  });
  expect(unchanged.reason).toBe('The candidate source is identical to the baseline source.');
  expect(
    decideNeverWorseGate(
      gateBaseline,
      { ...candidate, sourceFingerprint: gateBaseline.sourceFingerprint },
      { requireGain: false },
    ).decision,
  ).toBe('accepted');
});

test('verifies a rollback restored the baseline source', () => {
  const restored = decideRollbackGate(
    gateBaseline,
    baselineInput({ sourceFingerprint: gateBaseline.sourceFingerprint, status: 'rollback' }),
  );
  expect(restored.decision).toBe('accepted');
  const diverged = decideRollbackGate(
    gateBaseline,
    baselineInput({ sourceFingerprint: 'other', status: 'rollback' }),
  );
  expect(diverged.decision).toBe('blocked');
  expect(diverged.reason).toContain('copy the baseline snapshot back');
});

test('selects the winning attempt by validation, train score, then earliest attempt', () => {
  const winnerBaseline = gateEntry(
    0,
    'baseline',
    measuredFor({
      'train-01': ALL_OTHER,
      'train-02': ALL_OTHER,
      'validation-01': ALL_OTHER,
      'validation-02': ALL_OTHER,
    }),
  );
  const trainOnly = measuredFor({
    'train-01': ALL_TARGET,
    'train-02': ALL_OTHER,
    'validation-01': ALL_OTHER,
    'validation-02': ALL_OTHER,
  });
  const validationToo = measuredFor({
    'train-01': ALL_TARGET,
    'train-02': ALL_OTHER,
    'validation-01': ALL_TARGET,
    'validation-02': ALL_OTHER,
  });
  const validationOnly = measuredFor({
    'train-01': ALL_OTHER,
    'train-02': ALL_OTHER,
    'validation-01': ALL_TARGET,
    'validation-02': ALL_OTHER,
  });
  const entries = [
    winnerBaseline,
    gateEntry(1, 'attempt', trainOnly),
    gateEntry(2, 'attempt', validationOnly),
    gateEntry(3, 'attempt', validationToo),
    gateEntry(4, 'attempt', validationToo),
    gateEntry(5, 'attempt', validationToo, { hardFailure: 'broken' }),
  ];
  expect(selectWinningAttempt(entries, winnerBaseline)?.attempt).toBe(3);
  expect(
    selectWinningAttempt(
      [winnerBaseline, gateEntry(1, 'attempt', trainOnly), gateEntry(2, 'attempt', validationOnly)],
      winnerBaseline,
    )?.attempt,
  ).toBe(2);
  expect(
    selectWinningAttempt(
      [winnerBaseline, gateEntry(1, 'attempt', validationToo, { hardFailure: 'broken' })],
      winnerBaseline,
    ),
  ).toBeUndefined();
});

test('shows the editor train detail while hiding held-out validation queries', () => {
  const view = editorMeasurementOf(
    measuredFor({
      'train-01': ALL_OTHER,
      'train-02': ALL_OTHER,
      'validation-01': ALL_OTHER,
      'validation-02': ALL_OTHER,
    }),
  );
  expect(view.trainQueries.map(({ id }) => id)).toEqual(['train-01', 'train-02']);
  expect(view.validationFailures).toBe(1);
  expect(view.validation.totalQueries).toBe(2);
  expect(JSON.stringify(view)).not.toContain('validation-01');
});

test('builds a blind bundle without labels, splits, or the skill under test', () => {
  const bundle = blindBundleFor(querySet, [{ description: 'KB.', name: 'knowledge-base' }]);
  expect(bundle.prompts).toHaveLength(12);
  expect(bundle.prompts[0]).toEqual({
    query: 'Create a new Agent Skill.',
    query_id: 'train-01',
    run: 1,
  });
  const serialized = JSON.stringify(bundle);
  expect(serialized).not.toContain('should_trigger');
  expect(serialized).not.toContain('shouldTrigger');
  expect(serialized).not.toContain('"split"');
  expect(serialized).not.toContain('skillName');
  expect(bundle.boundary).toBe('in-session');
});

test('substitutes the candidate description into a sorted catalog', () => {
  expect(
    withCandidateDescription(
      [
        { description: 'old', name: 'skill-manager' },
        { description: 'KB', name: 'knowledge-base' },
      ],
      'skill-manager',
      'new',
    ),
  ).toEqual([
    { description: 'KB', name: 'knowledge-base' },
    { description: 'new', name: 'skill-manager' },
  ]);
  expect(withCandidateDescription([], 'solo', 'added')).toEqual([
    { description: 'added', name: 'solo' },
  ]);
  expect(candidateDescriptionOf('---\nname: x\ndescription:  spaced out \n---\nbody')).toBe(
    'spaced out',
  );
  expect(candidateDescriptionOf('no frontmatter')).toBe('');
});

const balancedSet = (overrides: Record<string, unknown> = {}, queries?: unknown[]) =>
  parseTriggerQuerySet(
    JSON.stringify({
      pass_threshold: 0.5,
      queries: queries ?? [
        ...['a', 'b'].flatMap((suffix) =>
          ['train', 'validation'].flatMap((split) => [
            {
              id: `${split}-yes-${suffix}`,
              query: `yes ${split} ${suffix}`,
              should_trigger: true,
              split,
            },
            {
              id: `${split}-no-${suffix}`,
              query: `no ${split} ${suffix}`,
              should_trigger: false,
              split,
            },
          ]),
        ),
      ],
      runs_per_query: 3,
      skill_name: 'skill-manager',
      ...overrides,
    }),
    SOURCE_PATH,
  );

test('accepts a balanced query set and reports imbalance and duplicate text', () => {
  expect(querySetBalanceProblems(balancedSet())).toEqual([]);
  const skewed = balancedSet({}, [
    { id: 't1', query: 'Same text', should_trigger: true, split: 'train' },
    { id: 't2', query: ' same   TEXT ', should_trigger: true, split: 'train' },
    { id: 't3', query: 'other', should_trigger: false, split: 'train' },
    { id: 'v1', query: 'v one', should_trigger: true, split: 'validation' },
    { id: 'v2', query: 'v two', should_trigger: true, split: 'validation' },
    { id: 'v3', query: 'v three', should_trigger: false, split: 'validation' },
    { id: 'v4', query: 'v four', should_trigger: false, split: 'validation' },
  ]);
  const problems = querySetBalanceProblems(skewed);
  expect(problems[0]).toBe('Query t2 duplicates the text of an earlier query.');
  expect(problems[1]).toContain('Split train needs at least two');
  expect(problems).toHaveLength(2);
  const lopsided = balancedSet({}, [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `p${index}`,
      query: `positive ${index}`,
      should_trigger: true,
      split: 'train',
    })),
    { id: 'n1', query: 'neg 1', should_trigger: false, split: 'train' },
    { id: 'n2', query: 'neg 2', should_trigger: false, split: 'train' },
    { id: 'v1', query: 'v1', should_trigger: true, split: 'validation' },
    { id: 'v2', query: 'v2', should_trigger: true, split: 'validation' },
    { id: 'v3', query: 'v3', should_trigger: false, split: 'validation' },
    { id: 'v4', query: 'v4', should_trigger: false, split: 'validation' },
  ]);
  expect(querySetBalanceProblems(lopsided)).toHaveLength(1);
});

test('rejects a query-set edit that removes, changes, or weakens the frozen set', () => {
  const previous = balancedSet();
  expect(queryRatchetViolations(previous, previous)).toEqual([]);
  const extended = balancedSet({}, [
    ...(JSON.parse(querySetJson) as { queries: unknown[] }).queries,
  ]);
  const violations = queryRatchetViolations(previous, extended);
  expect(violations).toContain('Query train-yes-a was removed.');
  const editedQueries = previous.queries.map((query, index) =>
    index === 0
      ? { ...query, query: 'edited', should_trigger: query.shouldTrigger }
      : { ...query, should_trigger: query.shouldTrigger },
  );
  const edited = balancedSet({}, editedQueries);
  expect(queryRatchetViolations(previous, edited)).toEqual([
    `Query ${previous.queries[0]?.id} was changed.`,
  ]);
  const appended = balancedSet({}, [
    ...previous.queries.map((query) => ({ ...query, should_trigger: query.shouldTrigger })),
    { id: 'extra', query: 'extra query', should_trigger: false, split: 'train' },
  ]);
  expect(queryRatchetViolations(previous, appended)).toEqual([]);
  const settingsChanged = balancedSet({ runs_per_query: 4, skill_name: 'other' });
  expect(queryRatchetViolations(settingsChanged, previous)).toEqual([
    'The skill name changed.',
    'The runs per query decreased.',
  ]);
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

test('excludes retired queries from prompts and balance, but not from the fingerprint', () => {
  const live = balancedSet();
  const retiredQueries = live.queries.map((query, index) => ({
    ...query,
    should_trigger: query.shouldTrigger,
    ...(index === 0 ? { retired: 'Ambiguous label.' } : {}),
  }));
  const retired = balancedSet({}, retiredQueries);
  expect(promptsFor(retired, []).length).toBe(promptsFor(live, []).length - 3);
  expect(matrixFingerprintForQuerySet(retired)).not.toBe(matrixFingerprintForQuerySet(live));
  expect(activeQueriesOf(retired)).toHaveLength(live.queries.length - 1);
  expect(queryRatchetViolations(live, retired)).toEqual([]);
});
