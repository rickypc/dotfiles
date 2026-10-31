import { expect, mock, test } from 'bun:test';
import * as path from 'node:path';
import realMatter from 'gray-matter';
import type { FileSystem } from '../../../utils/filesystem.js';
import * as realFilesystem from '../../../utils/filesystem.js';
import type { MatrixCase } from '../../../utils/quality-engine/matrix.js';
import * as realMatrix from '../../../utils/quality-engine/matrix.js';
import * as realPacket from '../../../utils/quality-engine/packet.js';
import * as realProvider from '../../../utils/quality-engine/provider.js';
import type { LedgerEntry, LedgerEntryInput } from '../../../utils/quality-engine/train.js';
import * as realTrainErrors from '../../../utils/quality-engine/train-errors.js';

mock.module('node:path', () => path);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../filesystem.js', () => realFilesystem);
mock.module('./matrix.js', () => realMatrix);
mock.module('./packet.js', () => realPacket);
mock.module('./provider.js', () => realProvider);
mock.module('./train-errors.js', () => realTrainErrors);

const {
  decideNeverWorseGate,
  editorMeasurementOf,
  MeasurementError,
  measurementFromMatrix,
  readBaselineSnapshot,
  rejectedEditFor,
} = await import('../../../utils/quality-engine/train.js');
const { changeSummaryOf, DEFAULT_EDIT_CAPS, editCapViolation, editSizeOf } = await import(
  '../../../utils/quality-engine/train-edit.js'
);

const matrixCase = (
  id: string,
  visibility: MatrixCase['visibility'],
  assertions: MatrixCase['assertions'],
): MatrixCase => ({
  assertions,
  failureMode: 'f',
  id,
  independentVerifier: 'source-structure',
  repairBoundary: 'SKILL.md',
  scenario: 's',
  visibility,
});

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

const contractCases: readonly MatrixCase[] = [
  matrixCase('cap', 'candidate', [
    { expected: 'edit cap', kind: 'required-text' },
    { expected: 'forbidden-train', kind: 'forbidden-text' },
  ]),
  matrixCase('hidden', 'challenge', [{ expected: 'HIDDEN-CHALLENGE-TEXT', kind: 'required-text' }]),
];

const entryFromMeasurement = (
  status: LedgerEntry['status'],
  attempt: number,
  measurement: LedgerEntryInput['measurement'],
): LedgerEntry => ({
  attempt,
  boundary: 'deterministic-matrix',
  id: `demo-contract-${status}-${attempt}`,
  matrixFingerprint: 'contract-matrix',
  measurement,
  sourceFingerprint: `source-${attempt}`,
  status,
  timestamp: '2026-10-31T00:00:00.000Z',
});

const skillText = (description: string, body: string): string =>
  `---\nname: demo\ndescription: ${description}\n---\n${body}`;

const BASE_BODY = ['# Demo', 'one', 'two', 'three'].join('\n');

test('measures zero edit size for identical text and one changed body line', () => {
  const base = skillText('Manage skills well.', BASE_BODY);
  expect(editSizeOf(base, base)).toEqual({
    bodyLines: 0,
    descriptionBaselineChars: 19,
    descriptionChars: 0,
  });
  expect(
    editSizeOf(base, skillText('Manage skills well.', BASE_BODY.replace('two', 'TWO'))),
  ).toEqual({ bodyLines: 1, descriptionBaselineChars: 19, descriptionChars: 0 });
  expect(
    editSizeOf(base, skillText('Manage skills well.', `${BASE_BODY}\nfour\nfive`)).bodyLines,
  ).toBe(2);
});

test('measures a description-only edit by trimmed common prefix and suffix', () => {
  const base = skillText('Manage skills well.', BASE_BODY);
  expect(editSizeOf(base, skillText('Manage many skills well.', BASE_BODY))).toEqual({
    bodyLines: 0,
    descriptionBaselineChars: 19,
    descriptionChars: 5,
  });
  expect(editSizeOf(base, skillText('Other.', BASE_BODY)).descriptionChars).toBe(18);
});

test('enforces the description percent, body line, and one-edit caps', () => {
  const caps = DEFAULT_EDIT_CAPS;
  expect(caps).toEqual({ maxBodyLines: 40, maxDescriptionPercent: 25 });
  const size = { bodyLines: 0, descriptionBaselineChars: 100, descriptionChars: 25 };
  expect(editCapViolation(size)).toBeUndefined();
  expect(editCapViolation({ ...size, descriptionChars: 26 })).toContain('cap is 25');
  expect(
    editCapViolation({ ...size, descriptionChars: 26 }, { ...caps, maxDescriptionPercent: 30 }),
  ).toBeUndefined();
  expect(editCapViolation({ ...size, bodyLines: 41, descriptionChars: 0 })).toContain('cap is 40');
  expect(
    editCapViolation(
      { ...size, bodyLines: 41, descriptionChars: 0 },
      { ...caps, maxBodyLines: 41 },
    ),
  ).toBeUndefined();
  expect(editCapViolation({ ...size, bodyLines: 1 })).toContain('one edit');
  expect(changeSummaryOf(size)).toBe('description 25 of 100 characters, body 0 lines');
});

test('reads the baseline snapshot or names its missing path', async () => {
  const baseline = entryFromMeasurement(
    'baseline',
    1,
    measurementFromMatrix('demo-contract', contractCases, 'edit cap HIDDEN-CHALLENGE-TEXT'),
  );
  const root = '/ledger';
  const fileSystem = readFileSystemFor({ [`${root}/${baseline.id}.snapshot.md`]: 'snapshot text' });
  expect(await readBaselineSnapshot(fileSystem, root, baseline)).toBe('snapshot text');
  await expect(readBaselineSnapshot(readFileSystemFor({}), root, baseline)).rejects.toThrow(
    `${root}/${baseline.id}.snapshot.md`,
  );
});

test('maps matrix assertions to per-query records split by visibility', () => {
  const measurement = measurementFromMatrix(
    'demo-contract',
    contractCases,
    'text with edit cap and HIDDEN-CHALLENGE-TEXT',
  );
  expect(measurement.boundary).toBe('deterministic-matrix');
  expect(measurement.perQuery.map(({ id, split }) => [id, split])).toEqual([
    ['cap:required-text:1', 'train'],
    ['cap:forbidden-text:2', 'train'],
    ['hidden:required-text:1', 'validation'],
  ]);
  expect(measurement.train).toEqual({ passedQueries: 2, score: 1, totalQueries: 2 });
  expect(measurement.validation.score).toBe(1);
  expect(measurement.perQuery.every(({ runs }) => runs === 1)).toBe(true);
});

test('gates the contract measurement with the unchanged never-worse gate', () => {
  const base = entryFromMeasurement(
    'baseline',
    1,
    measurementFromMatrix('demo-contract', contractCases, 'HIDDEN-CHALLENGE-TEXT only'),
  );
  const gain = measurementFromMatrix(
    'demo-contract',
    contractCases,
    'edit cap and HIDDEN-CHALLENGE-TEXT',
  );
  const accepted = decideNeverWorseGate(base, {
    ...entryFromMeasurement('attempt', 2, gain),
    sourceFingerprint: 'changed',
  });
  expect(accepted).toMatchObject({ decision: 'accepted', gained: { train: 1, validation: 0 } });
  const regression = measurementFromMatrix('demo-contract', contractCases, 'edit cap only');
  const blocked = decideNeverWorseGate(base, {
    ...entryFromMeasurement('attempt', 3, regression),
    sourceFingerprint: 'changed-again',
  });
  expect(blocked).toMatchObject({
    decision: 'blocked',
    regressed: { train: 0, validation: 1 },
  });
  expect(
    rejectedEditFor(base, entryFromMeasurement('attempt', 3, regression), blocked, 'sum'),
  ).toEqual({
    changeSummary: 'sum',
    gainedIds: ['cap:required-text:1'],
    reason: blocked.reason,
    regressedIds: ['hidden:required-text:1'],
  });
  expect(
    rejectedEditFor(base, entryFromMeasurement('attempt', 2, gain), accepted, 'sum'),
  ).toBeUndefined();
});

test('requires candidate and challenge assertions for a contract measurement', () => {
  expect(() => measurementFromMatrix('demo', contractCases.slice(0, 1), 'x')).toThrow(
    MeasurementError,
  );
  expect(() => measurementFromMatrix('demo', contractCases.slice(1), 'x')).toThrow(
    'candidate and challenge',
  );
});

test('keeps challenge assertion text out of the editor-facing contract report', () => {
  const measurement = measurementFromMatrix('demo-contract', contractCases, 'nothing relevant');
  const report = JSON.stringify(editorMeasurementOf(measurement));
  expect(report).toContain('Missing edit cap');
  expect(report).not.toContain('HIDDEN-CHALLENGE-TEXT');
  expect(report).toContain('"validationFailures":1');
  expect(JSON.stringify(measurement.perQuery)).not.toContain('HIDDEN-CHALLENGE-TEXT');
});
