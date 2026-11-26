import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realFs from 'node:fs/promises';
import * as realOs from 'node:os';
import * as realPath from 'node:path';
import * as realProcess from 'node:process';
import realMatter from 'gray-matter';
import * as realBatch from '../../../scripts/instruction-gate/batch.js';
import * as realGate from '../../../scripts/instruction-gate/index.js';
import * as realIntent from '../../../scripts/instruction-gate/intent.js';
import * as realPolicy from '../../../scripts/instruction-gate/policy.js';
import * as realFilesystem from '../../../utils/filesystem.js';
import * as realOkf from '../../../utils/okf.js';
import * as realBehavior from '../../../utils/quality-engine/atom/behavior.js';
import * as realBuild from '../../../utils/quality-engine/atom/build.js';
import * as realDelta from '../../../utils/quality-engine/atom/delta.js';
import * as realAtoms from '../../../utils/quality-engine/atom/index.js';
import * as realSeal from '../../../utils/quality-engine/behavior/seal.js';
import * as realFrontier from '../../../utils/quality-engine/candidate-frontier.js';
import * as realController from '../../../utils/quality-engine/controller.js';
import * as realReflow from '../../../utils/reflow/file.js';

interface Harness {
  readonly calls: { evaluate: string[]; rebuild: string[] };
  readonly deps: ReturnType<typeof makeDeps>;
  readonly files: Map<string, string>;
}

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:crypto', () => realCrypto);
mock.module('node:fs/promises', () => realFs);
mock.module('node:os', () => realOs);
mock.module('node:path', () => realPath);
mock.module('node:process', () => realProcess);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('./instruction-gate.js', () => realGate);
mock.module('./instruction-gate-batch.js', () => realBatch);
mock.module('./instruction-gate-intent.js', () => realIntent);
mock.module('./instruction-gate-policy.js', () => realPolicy);
mock.module('../utils/filesystem.js', () => realFilesystem);
mock.module('../utils/okf.js', () => realOkf);
mock.module('../utils/quality-engine/atom-build.js', () => realBuild);
mock.module('../utils/quality-engine/atom-behavior.js', () => realBehavior);
mock.module('../utils/quality-engine/atom-delta.js', () => realDelta);
mock.module('../utils/quality-engine/behavior-seal.js', () => realSeal);
mock.module('../utils/quality-engine/atoms.js', () => realAtoms);
mock.module('../utils/quality-engine/candidate-frontier.js', () => realFrontier);
mock.module('../utils/quality-engine/controller.js', () => realController);
mock.module('../utils/reflow-file.js', () => realReflow);

const sut = await import('../../../scripts/skill-manager/librarian.js');

const DOC = [
  '# Doc',
  '',
  '## Rules',
  '',
  'Always run the gate. Never skip the record step.',
  '',
  '- Keep receipts current.',
  '- Reflow to 100 columns.',
  '',
].join('\n');

const RULES = ['Doc', 'Rules'];
const REASON = 'The rule was tightened to name the exact command.';
const ROOT = '/root';
const STORE = '/store';

const ref = (text: string) => ({ atomId: realDelta.atomIdOf(text), headingPath: RULES });

const row = (id: string, passed: string[], validation = 5, intentsProven = true) => ({
  failures: [{ expected: 'A', given: 'B', id: 't4', query: 'q', suggestion: 'fix it' }],
  id,
  intents: [{ after: true, before: false, id: 'i1', op: 'add' as const, proven: intentsProven }],
  measurement: {
    trainFailed: ['t1', 't2', 't3', 't4'].filter((probe) => !passed.includes(probe)),
    trainPassed: passed,
    validationPassed: validation,
    validationTotal: 5,
  },
  passed: Object.fromEntries(passed.map((probe) => [probe, true])),
  sourceSha256: id,
});

const sha = (text: string): string => realCrypto.createHash('sha256').update(text).digest('hex');

const atom = (text: string, probe: string, extra: Record<string, unknown> = {}) => ({
  behavioral: false,
  harmful: 0,
  helpful: 0,
  id: realDelta.atomIdOf(text),
  placements: [{ headingPath: RULES }],
  precedence: 0,
  probeIds: [probe],
  status: 'active' as const,
  tags: [],
  textSha256: sha(realAtoms.normalizeText(text)),
  ...extra,
});

const mapText = (extra: Record<string, unknown> = {}): string =>
  realBuild.renderAtomMap({
    atoms: [
      atom('Always run the gate.', 't1'),
      atom('Never skip the record step.', 't2', extra),
      atom('- Keep receipts current.', 't3'),
      atom('- Reflow to 100 columns.', 't4'),
    ],
    sensitivity: [
      { mutantsFlipped: 1, mutantsTried: 1, probeId: 't1' },
      { mutantsFlipped: 1, mutantsTried: 1, probeId: 't2' },
    ],
    source: 'AGENTS.md',
  });

const RECEIPT = JSON.stringify({
  measurement: {
    trainFailed: ['t4'],
    trainPassed: ['t1', 't2', 't3'],
    validationPassed: 5,
    validationTotal: 5,
  },
});

const makeDeps = (
  files: Map<string, string>,
  calls: { evaluate: string[]; rebuild: string[] },
  rows: () => unknown[],
) => ({
  agentsRoot: ROOT,
  evaluate: async (requestText: string) => {
    realBatch.parseBatchRequest(requestText);
    calls.evaluate.push(requestText);
    return { targets: [{ candidates: rows() }] } as never;
  },
  readText: async (file: string) => files.get(file),
  rebuild: async (ownerId: string) => {
    calls.rebuild.push(ownerId);
    return { manifests: [], maps: [{ unresolvedProbes: ['t2'] }], written: true } as never;
  },
  reflow: (text: string) => text,
  sha256: sha,
  storeRoot: STORE,
  targetOf: () => ({
    receiptPath: 'evals/receipts/AGENTS.json',
    setPath: 'evals/comprehension/AGENTS.json',
  }),
  writeText: async (file: string, content: string) => {
    files.set(file, content);
  },
});

const harness = (rows: () => unknown[] = () => [], mapExtra = {}): Harness => {
  const files = new Map<string, string>([
    [`${ROOT}/AGENTS.md`, DOC],
    [`${ROOT}/evals/atoms/AGENTS.md`, mapText(mapExtra)],
    [`${ROOT}/evals/comprehension/AGENTS.json`, '{"queries":[]}'],
    [`${ROOT}/evals/receipts/AGENTS.json`, RECEIPT],
  ]);
  const calls = { evaluate: [] as string[], rebuild: [] as string[] };
  return { calls, deps: makeDeps(files, calls, rows), files };
};

const proposal = (candidates: unknown[]): string => JSON.stringify({ candidates });

const tighten = {
  delta: {
    document: 'AGENTS.md',
    ops: [
      {
        atom: ref('Never skip the record step.'),
        op: 'modify',
        reason: REASON,
        text: 'Never skip the instruction-gate record step.',
      },
    ],
  },
  expectedBehavior: 'The reader names the command.',
  id: 'tighten',
};

const drop = {
  delta: {
    document: 'AGENTS.md',
    ops: [{ atom: ref('- Keep receipts current.'), op: 'retire', reason: REASON }],
  },
  id: 'drop',
};

const extra = {
  delta: {
    document: 'AGENTS.md',
    ops: [
      { after: ref('- Reflow to 100 columns.'), op: 'add', text: '- Seal before commit.' },
      { atom: ref('Always run the gate.'), op: 'retire', reason: REASON },
      { atomId: realDelta.atomIdOf('- Reflow to 100 columns.'), counter: 'helpful', op: 'tag' },
    ],
  },
  id: 'extra',
  intents: [
    { expected: 'A', id: 'i1', op: 'add', options: ['yes', 'no'], prompt: 'Seal before commit?' },
  ],
};

test('propose writes snapshots to the store and never touches the repository', async () => {
  const { deps, files } = harness();
  const before = [...files.keys()].filter((file) => file.startsWith(ROOT));
  const report = await sut.propose(deps, proposal([tighten, drop]));
  expect(report.round).toBe(1);
  expect(report.candidates.map(({ id }) => id)).toEqual(['tighten', 'drop']);
  expect(files.has(`${STORE}/${report.batchId}/manifest.json`)).toBe(true);
  expect(files.has(`${STORE}/${report.batchId}/tighten.json`)).toBe(true);
  expect(files.get(`${ROOT}/AGENTS.md`)).toBe(DOC);
  expect([...files.keys()].filter((file) => file.startsWith(ROOT))).toEqual(before);
});

test('propose counts rounds per document text and probe set, including legacy round rows', async () => {
  const { deps, files } = harness();
  const texts = ['Alpha one.', 'Beta two.', 'Gamma three.', 'Delta four.', 'Epsilon five.'];
  const run = (text: string) =>
    sut.propose(
      deps,
      proposal([
        {
          delta: {
            document: 'AGENTS.md',
            ops: [{ after: ref('- Reflow to 100 columns.'), op: 'add', text: `- ${text}` }],
          },
          id: 'c1',
        },
      ]),
    );
  const first = await run(texts[0] as string);
  expect(first.round).toBe(1);
  expect(first.setSha256).toBe(sha('{"queries":[]}'));
  const roundsPath = `${STORE}/rounds.jsonl`;
  const legacy = JSON.parse(files.get(roundsPath)?.trim().split('\n')[0] ?? '{}') as Record<
    string,
    unknown
  >;
  delete legacy.setSha256;
  files.set(roundsPath, `${JSON.stringify(legacy)}\n`);
  expect((await run(texts[1] as string)).round).toBe(2);
  expect((await run(texts[2] as string)).round).toBe(3);
  await expect(run(texts[3] as string)).rejects.toThrow('round budget');
  files.set(`${ROOT}/evals/comprehension/AGENTS.json`, '{"queries":[{"id":"fresh-probe"}]}');
  const fresh = await run(texts[4] as string);
  expect(fresh.round).toBe(1);
  expect(fresh.setSha256).toBe(sha('{"queries":[{"id":"fresh-probe"}]}'));
});

test('propose fails closed when prior round history cannot be verified', async () => {
  const { deps, files } = harness();
  const roundsPath = `${STORE}/rounds.jsonl`;
  const request = proposal([tighten]);
  files.set(roundsPath, '{broken\n');
  await expect(sut.propose(deps, request)).rejects.toThrow('round ledger contains invalid JSON');

  files.set(roundsPath, `${JSON.stringify({})}\n`);
  await expect(sut.propose(deps, request)).rejects.toThrow(
    'round ledger contains an invalid entry',
  );

  const legacy = {
    baselineSha256: sha(DOC),
    batchId: 'bad',
    document: 'AGENTS.md',
  };
  files.set(roundsPath, `${JSON.stringify(legacy)}\n`);
  await expect(sut.propose(deps, request)).rejects.toThrow('invalid batch id');

  legacy.batchId = '1111111111111111';
  files.set(roundsPath, `${JSON.stringify(legacy)}\n`);
  files.set(`${STORE}/${legacy.batchId}/manifest.json`, '{broken');
  await expect(sut.propose(deps, request)).rejects.toThrow('unreadable manifest');

  files.set(
    `${STORE}/${legacy.batchId}/manifest.json`,
    JSON.stringify({
      baselineSha256: legacy.baselineSha256,
      batchId: legacy.batchId,
      document: legacy.document,
    }),
  );
  await expect(sut.propose(deps, request)).rejects.toThrow('no verifiable probe-set fingerprint');
});

test('propose rejects malformed, oversized, duplicated, and cross-document proposals', async () => {
  const { deps } = harness();
  await expect(sut.propose(deps, 'not json')).rejects.toThrow('not valid JSON');
  await expect(sut.propose(deps, proposal([]))).rejects.toThrow('1 to 3 candidates');
  await expect(
    sut.propose(deps, proposal([tighten, drop, extra, { ...tighten, id: 'fourth' }])),
  ).rejects.toThrow('1 to 3 candidates');
  await expect(sut.propose(deps, proposal([tighten, { ...drop, id: 'tighten' }]))).rejects.toThrow(
    'unique',
  );
  const other = { ...drop, delta: { ...drop.delta, document: 'OTHER.md' } };
  await expect(sut.propose(deps, proposal([tighten, other]))).rejects.toThrow('same document');
  const absolute = { ...drop, delta: { ...drop.delta, document: '/etc/passwd' } };
  await expect(sut.propose(deps, proposal([absolute]))).rejects.toThrow('relative path');
  const parent = { ...drop, delta: { ...drop.delta, document: '../x.md' } };
  await expect(sut.propose(deps, proposal([parent]))).rejects.toThrow('relative path');
});

test('propose rejects a bad candidate id, intents, and expectedBehavior', async () => {
  const { deps } = harness();
  await expect(sut.propose(deps, proposal([{ ...drop, id: 'Bad Id' }]))).rejects.toThrow(
    'lowercase',
  );
  await expect(sut.propose(deps, proposal([{ ...drop, intents: [{ id: 1 }] }]))).rejects.toThrow(
    'malformed intents',
  );
  await expect(sut.propose(deps, proposal([{ ...drop, intents: 'x' }]))).rejects.toThrow(
    'malformed intents',
  );
  await expect(sut.propose(deps, proposal([{ ...drop, expectedBehavior: 4 }]))).rejects.toThrow(
    'expectedBehavior',
  );
  await expect(sut.propose(deps, '{}')).rejects.toThrow('1 to 3 candidates');
});

test('propose rejects a missing atom map and a candidate that leaves the text unchanged', async () => {
  const missing = harness();
  missing.files.delete(`${ROOT}/evals/atoms/AGENTS.md`);
  await expect(sut.propose(missing.deps, proposal([drop]))).rejects.toThrow('must all exist');
  const { deps } = harness();
  const same = {
    delta: {
      document: 'AGENTS.md',
      ops: [
        {
          atom: ref('Never skip the record step.'),
          op: 'modify',
          reason: REASON,
          text: 'Never skip the record step.',
        },
      ],
    },
    id: 'same',
  };
  await expect(sut.propose(deps, proposal([same]))).rejects.toThrow('does not change');
});

test('propose rejects a candidate that changes reflow-sensitive text or the description', async () => {
  const { deps, files } = harness();
  await expect(
    sut.propose({ ...deps, reflow: (text: string) => text.toUpperCase() }, proposal([drop])),
  ).rejects.toThrow('more than whitespace');
  const skill = ['---', 'name: demo', 'description: Use for demos.', '---', '', DOC].join('\n');
  files.set(`${ROOT}/AGENTS.md`, skill);
  const front = {
    delta: {
      document: 'AGENTS.md',
      ops: [{ atom: ref('- Keep receipts current.'), op: 'retire', reason: REASON }],
    },
    id: 'front',
  };
  expect((await sut.propose(deps, proposal([front]))).candidates).toHaveLength(1);
  const spans = realDelta.locateUnits(skill);
  const description = spans.find(({ text }) => text.startsWith('description:'));
  expect(description?.text).toBe('description: Use for demos.');
  const edited = skill.replace('Use for demos.', 'Use for everything.');
  files.set(`${ROOT}/AGENTS.md`, edited);
  files.set(
    `${ROOT}/evals/atoms/AGENTS.md`,
    realBuild.renderAtomMap({
      atoms: [
        {
          ...atom('description: Use for everything.', 't9'),
          placements: [{ headingPath: ['frontmatter'] }],
        },
      ],
      sensitivity: [],
      source: 'AGENTS.md',
    }),
  );
  const rename = {
    delta: {
      document: 'AGENTS.md',
      ops: [
        {
          atom: {
            atomId: realDelta.atomIdOf('description: Use for everything.'),
            headingPath: ['frontmatter'],
          },
          op: 'modify',
          reason: REASON,
          text: 'description: Use for nothing.',
        },
      ],
    },
    id: 'rename',
  };
  await expect(sut.propose(deps, proposal([rename]))).rejects.toThrow('skill description');
});

test('propose rejects two candidates that produce the same text', async () => {
  const { deps } = harness();
  await expect(sut.propose(deps, proposal([drop, { ...drop, id: 'drop-again' }]))).rejects.toThrow(
    'same document text',
  );
});

const proposeAndCheck = async (
  rows: () => unknown[],
  candidates: unknown[] = [tighten, drop, extra],
  mapExtra = {},
) => {
  const h = harness(rows, mapExtra);
  const proposed = await sut.propose(h.deps, proposal(candidates));
  return { ...h, proposed };
};

test('check selects the unique admissible winner and writes a bound verdict', async () => {
  const rows = () => [
    row('tighten', ['t1', 't2', 't3', 't4']),
    row('drop', ['t1', 't2', 't4']),
    row('extra', ['t2', 't3', 't4']),
  ];
  const { calls, deps, files, proposed } = await proposeAndCheck(rows);
  const report = await sut.check(deps, proposed.batchId);
  expect(report.selected).toBe('tighten');
  expect(report.stopReason).toBe('selected');
  expect(report.nextStep).toBe('select');
  const [tightenVerdict, dropVerdict, extraVerdict] = report.candidates;
  expect(tightenVerdict?.trainGained).toEqual(['t4']);
  expect(tightenVerdict?.expectedBehavior).toBe('The reader names the command.');
  expect(tightenVerdict?.diagnoses).toEqual([
    { expected: 'A', given: 'B', id: 't4', suggestion: 'fix it' },
  ]);
  expect(tightenVerdict?.atoms[0]?.probes).toEqual([{ id: 't2', passed: true }]);
  expect(dropVerdict?.problems[0]).toContain('swap');
  expect(extraVerdict?.problems[0]).toContain('Core train probe t1');
  expect(JSON.parse(calls.evaluate[0] as string).targets[0].candidates).toHaveLength(3);
  const verdict = JSON.parse(files.get(`${STORE}/${proposed.batchId}/verdict.json`) as string);
  expect(verdict.selected).toBe('tighten');
  expect(verdict.harmful).toEqual([realDelta.atomIdOf('Always run the gate.')]);
  expect(verdict.bound.baselineSha256).toBe(sha(DOC));
});

test('check with only a trade-off asks for repair, and a spent budget stops', async () => {
  const both = () => [
    row('tighten', ['t1', 't2', 't3', 't4']),
    row('extra', ['t1', 't2', 't3', 't4'], 4),
  ];
  const first = await proposeAndCheck(both, [tighten, extra]);
  const report = await sut.check(first.deps, first.proposed.batchId);
  expect(report.selected).toBe('tighten');
  const none = () => [row('tighten', ['t1', 't2', 't3'], 5, false)];
  const second = await proposeAndCheck(none, [tighten]);
  const verdict = await sut.check(second.deps, second.proposed.batchId);
  expect(verdict.selected).toBeNull();
  expect(verdict.nextStep).toBe('repair');
  expect(verdict.stopReason).toBe('no-admissible');
});

test('check stops at the round budget when no candidate is admissible', async () => {
  const none = () => [row('c1', ['t1', 't2', 't3'], 5, false)];
  const h = harness(none);
  let batchId = '';
  for (const text of ['One.', 'Two.', 'Three.']) {
    const request = proposal([
      {
        delta: {
          document: 'AGENTS.md',
          ops: [{ after: ref('- Reflow to 100 columns.'), op: 'add', text: `- ${text}` }],
        },
        id: 'c1',
      },
    ]);
    batchId = (await sut.propose(h.deps, request)).batchId;
  }
  const report = await sut.check(h.deps, batchId);
  expect(report.round).toBe(3);
  expect(report.nextStep).toBe('stop');
  expect(report.stopReason).toBe('budget');
});

test('check reports a structural failure without calling the reader', async () => {
  const { calls, deps, proposed } = await proposeAndCheck(() => [], [drop]);
  const report = await sut.check(
    { ...deps, reflow: (text: string) => `${text}\n` },
    proposed.batchId,
  );
  expect(report.stopReason).toBe('structural');
  expect(report.candidates[0]?.structural[0]).toContain('reflowed');
  expect(calls.evaluate).toEqual([]);
});

test('check fails closed on a missing batch, snapshot, hash, row, or receipt', async () => {
  let current: unknown[] = [row('drop', ['t1'])];
  const { deps, files, proposed } = await proposeAndCheck(() => current, [drop]);
  await expect(sut.check(deps, 'nobatch')).rejects.toThrow('Missing snapshot payload');
  files.set(`${STORE}/bad/manifest.json`, '{"batchId":"other","candidates":[]}');
  await expect(sut.check(deps, 'bad')).rejects.toThrow('manifest is malformed');
  const snapshotFile = `${STORE}/${proposed.batchId}/drop.json`;
  const snapshot = files.get(snapshotFile) as string;
  files.set(snapshotFile, '{"id":"drop"}');
  await expect(sut.check(deps, proposed.batchId)).rejects.toThrow('snapshot is malformed');
  files.set(snapshotFile, snapshot.replace('Never skip', 'Always skip'));
  await expect(sut.check(deps, proposed.batchId)).rejects.toThrow(
    'does not match its recorded hash',
  );
  files.set(snapshotFile, snapshot);
  current = [];
  await expect(sut.check(deps, proposed.batchId)).rejects.toThrow('no row for candidate drop');
  current = [row('drop', ['t1'])];
  files.set(`${ROOT}/evals/receipts/AGENTS.json`, '{}');
  await expect(sut.check(deps, proposed.batchId)).rejects.toThrow('accepted receipt');
  files.delete(`${ROOT}/evals/receipts/AGENTS.json`);
  await expect(sut.check(deps, proposed.batchId)).rejects.toThrow('accepted receipt');
});

test('check refuses a stale batch after the document, map, or set changes', async () => {
  const { deps, files, proposed } = await proposeAndCheck(() => [], [drop]);
  files.set(`${ROOT}/AGENTS.md`, `${DOC}\nEdited.\n`);
  await expect(sut.check(deps, proposed.batchId)).rejects.toThrow('Stale batch');
});

test('check treats a document with no calibrated core as all-core', async () => {
  const h = harness(() => [row('drop', ['t1', 't2', 't4'])]);
  h.files.set(`${ROOT}/evals/atoms/AGENTS.md`, 'not an atom map');
  await expect(sut.propose(h.deps, proposal([drop]))).rejects.toThrow();
});

const checked = async (rows: () => unknown[], mapExtra = {}) => {
  const h = await proposeAndCheck(rows, [tighten, extra], mapExtra);
  const report = await sut.check(h.deps, h.proposed.batchId);
  return { ...h, report };
};

const WINNER = () => [
  row('tighten', ['t1', 't2', 't3', 't4']),
  row('extra', ['t1', 't2', 't3', 't4'], 4),
];

test('commit writes the text, retirement rows, rebuilds the map, and bumps counters', async () => {
  const { deps, files, calls, proposed, report } = await checked(WINNER);
  expect(report.selected).toBe('tighten');
  const result = await sut.commit(deps, proposed.batchId);
  expect(result.retirementRows).toBe(1);
  expect(result.unresolvedProbes).toEqual(['t2']);
  expect(result.receipt).toContain('instruction-gate record AGENTS.md');
  expect(files.get(`${ROOT}/AGENTS.md`)).toContain('Never skip the instruction-gate record step.');
  const retirements = JSON.parse(files.get(`${ROOT}/evals/retirements.json`) as string);
  expect(retirements.retirements).toEqual([
    { caseId: `atom:${realDelta.atomIdOf('Never skip the record step.')}`, reason: REASON },
  ]);
  expect(calls.rebuild).toEqual(['root']);
});

test('commit applies helpful and harmful counters from tags and rejected core losses', async () => {
  const rows = () => [row('extra', ['t2', 't3', 't4']), row('tighten', ['t1', 't2', 't3', 't4'])];
  const h = await proposeAndCheck(rows, [extra, tighten]);
  await sut.check(h.deps, h.proposed.batchId);
  await sut.commit(h.deps, h.proposed.batchId);
  const written = realAtoms.parseAtomMap(h.files.get(`${ROOT}/evals/atoms/AGENTS.md`) as string);
  const gate = written.atoms.find(({ id }) => id === realDelta.atomIdOf('Always run the gate.'));
  expect(gate?.harmful).toBe(1);
  const reflowId = realDelta.atomIdOf('- Reflow to 100 columns.');
  const tagged = {
    delta: {
      document: 'AGENTS.md',
      ops: [
        { after: ref('- Reflow to 100 columns.'), op: 'add', text: '- Seal before commit.' },
        { atomId: reflowId, counter: 'helpful', op: 'tag' },
        { atomId: reflowId, counter: 'harmful', op: 'tag' },
      ],
    },
    id: 'tagged',
  };
  const h2 = await proposeAndCheck(() => [row('tagged', ['t1', 't2', 't3', 't4'])], [tagged]);
  await sut.check(h2.deps, h2.proposed.batchId);
  await sut.commit(h2.deps, h2.proposed.batchId);
  const second = realAtoms.parseAtomMap(h2.files.get(`${ROOT}/evals/atoms/AGENTS.md`) as string);
  const bumped = second.atoms.find(({ id }) => id === reflowId);
  expect([bumped?.helpful, bumped?.harmful]).toEqual([1, 1]);
});

test('commit keeps existing retirement rows and skips duplicates', async () => {
  const { deps, files, proposed } = await checked(WINNER);
  const id = realDelta.atomIdOf('Never skip the record step.');
  files.set(
    `${ROOT}/evals/retirements.json`,
    JSON.stringify({ retirements: [{ caseId: `atom:${id}`, reason: REASON }], schemaVersion: 1 }),
  );
  const result = await sut.commit(deps, proposed.batchId);
  expect(result.retirementRows).toBe(0);
  const kept = JSON.parse(files.get(`${ROOT}/evals/retirements.json`) as string);
  expect(kept.retirements).toHaveLength(1);
});

test('commit refuses with no selection, no verdict, or a stale input', async () => {
  const none = await checked(() => [
    row('tighten', ['t1', 't2', 't3'], 5, false),
    row('extra', ['t1'], 5, false),
  ]);
  await expect(sut.commit(none.deps, none.proposed.batchId)).rejects.toThrow(
    'selected no candidate',
  );
  const unchecked = await proposeAndCheck(WINNER, [tighten, extra]);
  await expect(sut.commit(unchecked.deps, unchecked.proposed.batchId)).rejects.toThrow(
    'Missing snapshot payload',
  );
  const stale = await checked(WINNER);
  stale.files.set(`${ROOT}/evals/comprehension/AGENTS.json`, '{"queries":[1]}');
  await expect(sut.commit(stale.deps, stale.proposed.batchId)).rejects.toThrow('stale');
});

const COVERAGE = JSON.stringify({
  root: { cases: [{ id: 'case-b', sourceRule: 'AGENTS.md:5-5 - never skip the record step' }] },
});

const behavioralBatch = async (coverage: string | undefined) => {
  const h = await proposeAndCheck(WINNER, [tighten, extra], { behavioral: true });
  if (coverage !== undefined) {
    h.files.set(`${ROOT}/evals/coverage-map.json`, coverage);
  }
  const tightenSha =
    h.proposed.candidates.find(({ id }) => id === 'tighten')?.candidateSha256 ?? '';
  return { ...h, tightenSha };
};

const sealLine = (caseId: string, documentSha256: string, passed = true) =>
  `${JSON.stringify({
    assertions: [],
    caseId,
    documentSha256,
    passed,
    runId: 'r',
    schema: 1,
    sessionId: 's',
    transcriptSha256: 't',
  })}\n`;

test('check blocks a candidate that touches a behavioral atom until its case is sealed', async () => {
  const unsealed = await behavioralBatch(COVERAGE);
  const first = await sut.check(unsealed.deps, unsealed.proposed.batchId);
  expect(first.selected).toBeNull();
  expect(first.candidates[0]?.problems).toEqual([
    'Behavior case case-b has no passing seal for this candidate.',
  ]);
  const unmapped = await behavioralBatch(undefined);
  const second = await sut.check(unmapped.deps, unmapped.proposed.batchId);
  expect(second.candidates[0]?.problems[0]).toContain('maps to no behavior case');
});

test('a sealed candidate is selected and committed; a failed or foreign seal is not enough', async () => {
  const h = await behavioralBatch(COVERAGE);
  const sealsFile = `${ROOT}/evals/behavior-seals.jsonl`;
  h.files.set(sealsFile, sealLine('case-b', h.tightenSha, false) + sealLine('case-b', 'other'));
  expect((await sut.check(h.deps, h.proposed.batchId)).selected).toBeNull();
  h.files.set(sealsFile, sealLine('case-b', h.tightenSha));
  expect((await sut.check(h.deps, h.proposed.batchId)).selected).toBe('tighten');
  h.files.delete(sealsFile);
  await expect(sut.commit(h.deps, h.proposed.batchId)).rejects.toThrow('no passing seal');
  h.files.set(sealsFile, sealLine('case-b', h.tightenSha));
  const result = await sut.commit(h.deps, h.proposed.batchId);
  expect(result.document).toBe('AGENTS.md');
});

test('commit refuses a verdict bound to another candidate', async () => {
  const { deps, files, proposed } = await checked(WINNER);
  const verdictFile = `${STORE}/${proposed.batchId}/verdict.json`;
  const verdict = JSON.parse(files.get(verdictFile) as string);
  files.set(
    verdictFile,
    JSON.stringify({ ...verdict, bound: { ...verdict.bound, candidateSha256: 'x' } }),
  );
  await expect(sut.commit(deps, proposed.batchId)).rejects.toThrow('not bound');
});

test('commit skips counters when the map vanished after the rebuild', async () => {
  const { deps, files, proposed } = await checked(WINNER);
  const result = await sut.commit(
    {
      ...deps,
      rebuild: async () => {
        files.delete(`${ROOT}/evals/atoms/AGENTS.md`);
        return { manifests: [], maps: [], written: true } as never;
      },
    },
    proposed.batchId,
  );
  expect(result.unresolvedProbes).toEqual([]);
});

test('commit maps a skill document to its owner id', async () => {
  const { deps, files, calls, proposed } = await checked(WINNER);
  const manifestFile = `${STORE}/${proposed.batchId}/manifest.json`;
  const manifest = JSON.parse(files.get(manifestFile) as string);
  files.set(manifestFile, JSON.stringify({ ...manifest, document: 'skills/demo/references/x.md' }));
  files.set(`${ROOT}/skills/demo/references/x.md`, DOC);
  await sut.commit(deps, proposed.batchId);
  expect(calls.rebuild).toEqual(['skill:demo']);
});

test('runLibrarian routes each verb and rejects bad arguments', async () => {
  const h = harness(WINNER);
  const out: string[] = [];
  const write = (message: string) => out.push(message);
  const make = () => h.deps;
  await expect(sut.runLibrarian(['propose'], write, make)).rejects.toThrow('Usage');
  await expect(sut.runLibrarian(['propose', 'rel', 'x'], write, make)).rejects.toThrow('Usage');
  await expect(sut.runLibrarian(['propose', ROOT, 'x', 'y'], write, make)).rejects.toThrow('Usage');
  await expect(sut.runLibrarian(['nope', ROOT, 'x'], write, make)).rejects.toThrow('Usage');
  await expect(sut.runLibrarian(['propose', ROOT, '/missing.json'], write, make)).rejects.toThrow(
    'Missing proposal file',
  );
  h.files.set('/proposal.json', proposal([tighten, extra]));
  await sut.runLibrarian(['propose', ROOT, '/proposal.json'], write, make);
  const batchId = JSON.parse(out[0] as string).batchId;
  await sut.runLibrarian(['check', ROOT, batchId], write, make);
  expect(JSON.parse(out[1] as string).selected).toBe('tighten');
  await sut.runLibrarian(['commit', ROOT, batchId], write, make);
  expect(JSON.parse(out[2] as string).document).toBe('AGENTS.md');
});

test('the default dependencies read, hash, reflow, and write on the real filesystem', async () => {
  const dir = await realFs.mkdtemp(realPath.join(realOs.tmpdir(), 'librarian-'));
  const deps = sut.defaultLibrarianDeps(dir);
  expect(deps.agentsRoot).toBe(dir);
  expect(deps.storeRoot).toBe(realPath.join(realOs.tmpdir(), 'instruction-librarian'));
  const file = realPath.join(dir, 'nested', 'a.txt');
  await deps.writeText(file, 'hello');
  expect(await deps.readText(file)).toBe('hello');
  expect(await deps.readText(realPath.join(dir, 'missing'))).toBeUndefined();
  expect(deps.sha256('hello')).toBe(sha('hello'));
  expect(deps.reflow('Short line.\n')).toBe('Short line.\n');
  expect(deps.targetOf('AGENTS.md').setPath).toBe('evals/comprehension/AGENTS.json');
  await expect(deps.evaluate('{}')).rejects.toThrow();
  await expect(deps.rebuild('root')).rejects.toThrow();
});

test('the store root follows INSTRUCTION_LIBRARIAN_STORE when it is set', () => {
  const saved = realProcess.env.INSTRUCTION_LIBRARIAN_STORE;
  realProcess.env.INSTRUCTION_LIBRARIAN_STORE = '/shared/store';
  expect(sut.defaultLibrarianDeps('/root').storeRoot).toBe('/shared/store');
  if (saved === undefined) {
    delete realProcess.env.INSTRUCTION_LIBRARIAN_STORE;
  } else {
    realProcess.env.INSTRUCTION_LIBRARIAN_STORE = saved;
  }
});

test('a free batch slot adds a baseline row that replaces the stale receipt baseline', async () => {
  const rows = () => [
    row('tighten', ['t1', 't2', 't3', 't4']),
    row('baseline', ['t1', 't2', 't3', 't4']),
  ];
  const h = await proposeAndCheck(rows, [tighten]);
  const report = await sut.check(h.deps, h.proposed.batchId);
  expect(
    JSON.parse(h.calls.evaluate[0] as string).targets[0].candidates.map(
      ({ id }: { id: string }) => id,
    ),
  ).toEqual(['tighten', 'baseline']);
  expect(report.candidates[0]?.trainGained).toEqual([]);
  expect(report.stopReason).toBe('no-admissible');
  expect(h.files.has(`${STORE}/${h.proposed.batchId}/result.json`)).toBe(true);
  expect(report.candidates[0]?.intents).toHaveLength(1);
});

test('a full batch keeps every slot for candidates and uses the receipt baseline', async () => {
  const h = await proposeAndCheck(
    () => [row('tighten', ['t1', 't2', 't3', 't4']), row('drop', ['t1']), row('extra', ['t1'])],
    [tighten, drop, extra],
  );
  await sut.check(h.deps, h.proposed.batchId);
  const sent = JSON.parse(h.calls.evaluate[0] as string).targets[0].candidates;
  expect(sent.map(({ id }: { id: string }) => id)).toEqual(['tighten', 'drop', 'extra']);
});

test('a written swap reason admits a non-core loss that gains at least as much', async () => {
  const swapRows = () => [row('drop', ['t1', 't2', 't4']), row('baseline', ['t1', 't2', 't3'])];
  const h = await proposeAndCheck(swapRows, [drop]);
  const refused = await sut.check(h.deps, h.proposed.batchId);
  expect(refused.selected).toBeNull();
  expect(refused.candidates[0]?.swapped).toBe(true);
  const allowed = await sut.check(
    h.deps,
    h.proposed.batchId,
    'The reader flips a probe that this edit does not touch.',
  );
  expect(allowed.selected).toBe('drop');
  const verdict = JSON.parse(h.files.get(`${STORE}/${h.proposed.batchId}/verdict.json`) as string);
  expect(verdict.swapReason).toContain('flips a probe');
  const done = await sut.commit(h.deps, h.proposed.batchId);
  expect(done.receipt).toContain('--allow-swap');
});

test('the check verb reads --allow-swap and rejects a dangling flag', async () => {
  const h = await proposeAndCheck(
    () => [row('drop', ['t1', 't2', 't4']), row('baseline', ['t1', 't2', 't3'])],
    [drop],
  );
  const out: string[] = [];
  const make = () => h.deps;
  await sut.runLibrarian(
    ['check', ROOT, h.proposed.batchId, '--allow-swap', 'A real reason here.'],
    (m) => out.push(m),
    make,
  );
  expect(JSON.parse(out[0] as string).selected).toBe('drop');
  await expect(
    sut.runLibrarian(['check', ROOT, h.proposed.batchId, '--allow-swap'], () => undefined, make),
  ).rejects.toThrow('Usage');
});

test('propose rejects the reserved baseline candidate id', async () => {
  const { deps } = harness();
  await expect(sut.propose(deps, proposal([{ ...drop, id: 'baseline' }]))).rejects.toThrow(
    'lowercase',
  );
});
