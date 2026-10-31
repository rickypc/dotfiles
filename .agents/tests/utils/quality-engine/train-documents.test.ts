import { expect, mock, test } from 'bun:test';
import * as path from 'node:path';
import realMatter from 'gray-matter';
import * as realFilesystem from '../../../utils/filesystem.js';
import * as realPacket from '../../../utils/quality-engine/packet.js';
import * as realProvider from '../../../utils/quality-engine/provider.js';
import * as realTrainErrors from '../../../utils/quality-engine/train-errors.js';

mock.module('node:path', () => path);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../filesystem.js', () => realFilesystem);
mock.module('./packet.js', () => realPacket);
mock.module('./provider.js', () => realProvider);
mock.module('./train-errors.js', () => realTrainErrors);

const {
  blindBundleFor,
  blindDocumentBundleFor,
  editorMeasurementOf,
  measurementFromRecords,
  parseTriggerQuerySet,
  queryRatchetViolations,
  querySetBalanceProblems,
  snapshotPathFor,
} = await import('../../../utils/quality-engine/train.js');

const probeFor = (
  id: string,
  split: 'train' | 'validation',
  expected: string,
  extra: Record<string, unknown> = {},
) => ({
  expected,
  id,
  query: `Question ${id}?\nA) one\nB) two\nC) three`,
  split,
  ...extra,
});

const comprehensionSetFor = (
  overrides: Record<string, unknown> = {},
  queries?: readonly unknown[],
) =>
  parseTriggerQuerySet(
    JSON.stringify({
      kind: 'comprehension',
      queries: queries ?? [
        probeFor('t1', 'train', 'A'),
        probeFor('t2', 'train', 'B'),
        probeFor('v1', 'validation', 'C'),
        probeFor('v2', 'validation', 'A'),
      ],
      runs_per_query: 3,
      skill_name: 'skill--doc',
      target: '../doc.md',
      ...overrides,
    }),
    '/skill/evals/comprehension/doc.json',
  );

test('parses a comprehension set with lettered probes and a relative target', () => {
  const set = comprehensionSetFor();
  expect(set.kind).toBe('comprehension');
  expect(set.target).toBe('../doc.md');
  expect(set.queries[0]).toMatchObject({ expected: 'A', shouldTrigger: true });
  expect(querySetBalanceProblems(set)).toEqual([]);
});

test('rejects a probe whose expected letter is missing, invalid, or has no option line', () => {
  for (const bad of [
    probeFor('t1', 'train', 'D'),
    probeFor('t1', 'train', 'a'),
    { ...probeFor('t1', 'train', 'A'), expected: undefined },
  ]) {
    expect(() => comprehensionSetFor({}, [bad, probeFor('t2', 'train', 'B')])).toThrow(
      'needs an expected letter',
    );
  }
});

test('scores comprehension answers by normalized letter and ignores retired probes', () => {
  const set = comprehensionSetFor({}, [
    probeFor('t1', 'train', 'A'),
    probeFor('t2', 'train', 'B'),
    probeFor('t3', 'train', 'C', { retired: 'The question was ambiguous.' }),
    probeFor('v1', 'validation', 'C'),
    probeFor('v2', 'validation', 'A'),
  ]);
  const answers = (letters: readonly string[]) =>
    letters.map((skillName, index) => ({ queryId: 't1', run: index + 1, skillName }));
  const records = [
    ...answers(['A', 'a)', '**A**']),
    ...['B', 'B', 'C'].map((skillName, index) => ({ queryId: 't2', run: index + 1, skillName })),
    ...['C', 'C', 'C'].map((skillName, index) => ({ queryId: 'v1', run: index + 1, skillName })),
    ...['B', 'B', 'B'].map((skillName, index) => ({ queryId: 'v2', run: index + 1, skillName })),
  ];
  const measurement = measurementFromRecords(set, records);
  expect(measurement.perQuery.map(({ id }) => id)).toEqual(['t1', 't2', 'v1', 'v2']);
  expect(measurement.perQuery.map(({ passed }) => passed)).toEqual([true, false, true, false]);
  expect(measurement.perQuery[1]?.unstable).toBe(true);
  expect(measurement.perQuery[3]?.unstable).toBe(false);
  expect(editorMeasurementOf(measurement).clear).toBe(false);
});

test('builds a blind document bundle without expected answers or retired probes', () => {
  const set = comprehensionSetFor({}, [
    probeFor('t1', 'train', 'A'),
    probeFor('t2', 'train', 'B', { retired: 'Ambiguous.' }),
    probeFor('t3', 'train', 'C'),
    probeFor('v1', 'validation', 'C'),
    probeFor('v2', 'validation', 'A'),
  ]);
  const bundle = blindDocumentBundleFor(set, '# Doc\nRule one.');
  expect(bundle.document).toBe('# Doc\nRule one.');
  expect(bundle.prompts).toHaveLength(12);
  expect(bundle.prompts.some(({ query_id }) => query_id === 't2')).toBe(false);
  expect(JSON.stringify(bundle)).not.toContain('expected');
  expect(bundle.responseContract).toContain('answer');
  expect(blindBundleFor(set, []).prompts).toHaveLength(12);
});

test('reports a probe split that is too small or uses one answer letter too often', () => {
  const skewed = comprehensionSetFor({}, [
    probeFor('t1', 'train', 'A'),
    probeFor('t2', 'train', 'A'),
    probeFor('t3', 'train', 'A'),
    probeFor('t4', 'train', 'B'),
    probeFor('v1', 'validation', 'C'),
  ]);
  expect(querySetBalanceProblems(skewed)).toEqual([
    'Split train uses one answer letter for more than half of its probes.',
    'Split validation needs at least two probes.',
  ]);
});

test('rejects a ratchet that changes the kind, target, or expected answer', () => {
  const previous = comprehensionSetFor();
  expect(queryRatchetViolations(previous, previous)).toEqual([]);
  expect(queryRatchetViolations(previous, comprehensionSetFor({ target: '../other.md' }))).toEqual([
    'The query-set kind or target changed.',
  ]);
  expect(
    queryRatchetViolations(
      previous,
      comprehensionSetFor({}, [
        probeFor('t1', 'train', 'B'),
        probeFor('t2', 'train', 'B'),
        probeFor('v1', 'validation', 'C'),
        probeFor('v2', 'validation', 'A'),
      ]),
    ),
  ).toEqual(['Query t1 was changed.']);
});

test('derives a stable snapshot path from the ledger root and entry id', () => {
  expect(snapshotPathFor('/plans/quality', 'skill-manager-attempt-2')).toBe(
    '/plans/quality/skill-manager-attempt-2.snapshot.md',
  );
});
