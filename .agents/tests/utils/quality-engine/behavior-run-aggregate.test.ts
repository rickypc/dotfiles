import { expect, test } from 'bun:test';

import {
  BEHAVIOR_RUN_SCHEMA_VERSION,
  type BehaviorRunCase,
  type BehaviorRunExpected,
  type BehaviorRunMetadata,
  type BehaviorRunReceipt,
  buildBehaviorRunReceipt,
} from '../../../utils/quality-engine/behavior-run.js';
import { aggregateBehaviorRunReceipts as aggregateBehaviorRunReceiptsForExpected } from '../../../utils/quality-engine/behavior-run-aggregate.js';

interface EvidenceOptions {
  readonly axisAgreement?: 'agreed' | 'disputed';
  readonly axisEvidence?: string;
  readonly axisStatus?: 'fail' | 'pass';
  readonly diff?: string;
  readonly output?: string;
  readonly toolTrace?: string;
}

const axes = [
  'schema-diff-integrity',
  'negative-constraint-adherence',
  'step-sequence-compliance',
  'scope-discipline',
];

const metadata: BehaviorRunMetadata = {
  candidateId: 'baseline',
  evaluationId: '7c7628f9-e5d2-4062-a785-803e607b1e06',
  graderModelId: 'host-model-v1',
  graderPromptVersion: 'grader-v1',
  graderRuntimeId: 'runtime-a',
  manifestFingerprint: '1'.repeat(64),
  matrixFingerprint: '2'.repeat(64),
  modelId: 'host-model-v1',
  ownerId: 'root',
  reflectionPromptVersion: 'reflection-v1',
  rubricFingerprint: '3'.repeat(64),
  runId: '11111111-1111-4111-8111-111111111111',
  runIndex: 1,
  runnerVersion: 'runner-v1',
  sourceFingerprint: '4'.repeat(64),
  targetRuntimeId: 'runtime-a',
  taskPromptVersion: 'task-v1',
};

const cases: readonly BehaviorRunCase[] = [
  {
    hardAssertions: [
      { expected: 'Saved', id: 'saved-output', kind: 'output-contains' },
      { expected: 'outside', id: 'no-outside-diff', kind: 'diff-omits' },
      { expected: 'shell', id: 'no-shell-trace', kind: 'trace-omits' },
    ],
    id: 'save-note',
    split: 'train',
    taskFamily: 'bounded-file-edit',
  },
  {
    hardAssertions: [{ expected: 'Reviewed', id: 'review-output', kind: 'output-contains' }],
    id: 'review-note',
    split: 'train',
    taskFamily: 'bounded-review',
  },
  {
    hardAssertions: [{ expected: 'Held out', id: 'challenge-output', kind: 'output-contains' }],
    id: 'challenge-note',
    split: 'challenge',
    taskFamily: 'bounded-review',
  },
];

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const hash = (value: string): string => {
  let state = 2166136261;
  for (const character of value) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return state.toString(16).padStart(8, '0').repeat(8);
};

const withCaseResults = (
  receipt: BehaviorRunReceipt,
  caseResults: readonly BehaviorRunReceipt['caseResults'][number][],
): BehaviorRunReceipt => ({
  ...receipt,
  caseResults,
  resultsDigest: hash(canonicalJson(caseResults)),
});

const expected: BehaviorRunExpected = {
  axes,
  cases,
  metadata,
  sessions: [
    {
      caseId: 'save-note',
      graderSessionId: 'grader-save-note',
      targetSessionId: 'target-save-note',
    },
    {
      caseId: 'review-note',
      graderSessionId: 'grader-review-note',
      targetSessionId: 'target-review-note',
    },
  ],
  split: 'train',
};

const aggregateBehaviorRunReceipts = (
  values: readonly unknown[],
  requiredRuns: number,
  sha256: (value: string) => string,
) =>
  aggregateBehaviorRunReceiptsForExpected(
    values,
    {
      ...metadata,
      axes,
      cases: cases.filter(({ split }) => split === 'train'),
      split: 'train',
    },
    requiredRuns,
    sha256,
  );

const evidenceNameFor = (
  kind: (typeof cases)[number]['hardAssertions'][number]['kind'],
): 'diff' | 'output' | 'toolTrace' =>
  kind.startsWith('output-') ? 'output' : kind.startsWith('trace-') ? 'toolTrace' : 'diff';

const hardAssertionResultFor = (
  assertion: (typeof cases)[number]['hardAssertions'][number],
  evidence: { readonly diff: string; readonly output: string; readonly toolTrace: string },
) => {
  const evidenceName = evidenceNameFor(assertion.kind);
  const contains = evidence[evidenceName].includes(assertion.expected);
  return {
    assertionId: assertion.id,
    evidence: `${evidenceName} ${contains ? 'contains' : 'omits'} expected literal: ${assertion.expected}`,
    status: contains === assertion.kind.endsWith('contains') ? 'passed' : 'failed',
  };
};

const outputFor = (evaluationCase: BehaviorRunCase): string =>
  evaluationCase.id === 'review-note' ? 'Reviewed the safe note.' : 'Saved the safe note.';

const recordFor = (
  evaluationCase: BehaviorRunCase,
  options: EvidenceOptions = {},
): Record<string, unknown> => {
  const output = options.output ?? outputFor(evaluationCase);
  const diff = options.diff ?? '--- a/note.md\n+++ b/note.md\n+safe';
  const toolTrace = options.toolTrace ?? 'write note.md';
  const evidence = { diff, output, toolTrace };
  const score = {
    axisResults: axes.map((axis) => ({
      agreement: options.axisAgreement ?? 'agreed',
      axis,
      evidence:
        options.axisEvidence ?? (evaluationCase.id === 'review-note' ? 'Reviewed' : 'Saved'),
      status: options.axisStatus ?? 'pass',
    })),
    caseId: evaluationCase.id,
    hardAssertions: evaluationCase.hardAssertions.map((assertion) =>
      hardAssertionResultFor(assertion, evidence),
    ),
    matrixFingerprint: metadata.matrixFingerprint,
    sourceFingerprint: metadata.sourceFingerprint,
  };
  return {
    caseId: evaluationCase.id,
    diff,
    diffDigest: hash(diff),
    graderSessionId: `grader-${evaluationCase.id}`,
    metadata,
    output,
    outputDigest: hash(output),
    runId: metadata.runId,
    schemaVersion: BEHAVIOR_RUN_SCHEMA_VERSION,
    score,
    split: evaluationCase.split,
    targetSessionId: `target-${evaluationCase.id}`,
    taskFamily: evaluationCase.taskFamily,
    toolTrace,
    toolTraceDigest: hash(toolTrace),
    toolTraceEvidence: 'reported-in-session',
  };
};

const jsonlFor = (
  selectedCases: readonly BehaviorRunCase[] = cases.filter(({ split }) => split === 'train'),
  edit: (record: Record<string, unknown>, index: number) => Record<string, unknown> = (item) =>
    item,
): string =>
  selectedCases.map((item, index) => JSON.stringify(edit(recordFor(item), index))).join('\n');
const runIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

const receiptForRun = (
  runIndex: number,
  options: { readonly failAxis?: boolean; readonly failHardAssertion?: boolean } = {},
): BehaviorRunReceipt => {
  const runMetadata = {
    ...metadata,
    runId: runIds[runIndex - 1] ?? metadata.runId,
    runIndex,
  };
  const selectedCases = cases.filter(({ split }) => split === 'train');
  const sessions = expected.sessions.map((session) => ({
    ...session,
    graderSessionId: `grader-run-${runIndex}`,
    targetSessionId: `target-run-${runIndex}`,
  }));
  const content = jsonlFor(undefined, (_value, index) => {
    const evaluationCase = selectedCases[index] as BehaviorRunCase;
    const evidence =
      options.failHardAssertion && index === 0
        ? {
            diff: '--- a/note.md\n+++ b/note.md\n+outside',
            output: 'Saved the safe note.',
            toolTrace: 'write note.md',
          }
        : undefined;
    const row = evidence ? recordFor(evaluationCase, evidence) : recordFor(evaluationCase);
    const session = sessions[index];
    const score = row.score as Record<string, unknown>;
    const axisResults = score.axisResults as Record<string, unknown>[];
    return {
      ...row,
      graderSessionId: session?.graderSessionId,
      metadata: runMetadata,
      runId: runMetadata.runId,
      score: {
        ...score,
        axisResults:
          options.failAxis && index === 0
            ? axisResults.map((item, axisIndex) =>
                axisIndex === 0 ? { ...item, status: 'fail' } : item,
              )
            : axisResults,
      },
      targetSessionId: session?.targetSessionId,
    };
  });
  return buildBehaviorRunReceipt(content, { ...expected, metadata: runMetadata, sessions }, hash);
};

test('aggregates exactly three comparable runs and keeps per-case vectors and variance', () => {
  const receipt = aggregateBehaviorRunReceipts(
    [receiptForRun(3), receiptForRun(1), receiptForRun(2)],
    3,
    hash,
  );
  const first = receipt.caseResults[0];

  expect(receipt).toMatchObject({
    admission: 'run-id-linked',
    decision: 'provisional',
    evaluationId: metadata.evaluationId,
    ownerId: metadata.ownerId,
    requiredRuns: 3,
    schemaVersion: 3,
    split: 'train',
  });
  expect(receipt.runResults.map(({ runIndex }) => runIndex)).toEqual([1, 2, 3]);
  expect(first?.axes[axes[0] ?? '']).toEqual({
    outcomes: ['pass', 'pass', 'pass'],
    passCount: 3,
    passRate: 1,
    sampleVariance: 0,
  });
  expect(first?.axisEvidence[axes[0] ?? '']).toEqual(['Saved', 'Saved', 'Saved']);
  expect(first?.runEvidence.map(({ toolTraceEvidence }) => toolTraceEvidence)).toEqual([
    'reported-in-session',
    'reported-in-session',
    'reported-in-session',
  ]);
  expect(first?.hardAssertions['saved-output']).toEqual({
    outcomes: ['passed', 'passed', 'passed'],
    passCount: 3,
    passRate: 1,
    sampleVariance: 0,
  });
  expect(first?.hardAssertionsPass).toEqual({
    outcomes: [true, true, true],
    passCount: 3,
    passRate: 1,
    sampleVariance: 0,
  });
  expect(first?.hardAssertionEvidence['saved-output']).toEqual([
    'output contains expected literal: Saved',
    'output contains expected literal: Saved',
    'output contains expected literal: Saved',
  ]);
  expect(first?.runEvidence.map(({ runIndex }) => runIndex)).toEqual([1, 2, 3]);
  for (const run of receipt.runResults) {
    const targetIds = new Set(
      receipt.caseResults.map(
        ({ runEvidence }) => runEvidence.find(({ runId }) => runId === run.runId)?.targetSessionId,
      ),
    );
    const graderIds = new Set(
      receipt.caseResults.map(
        ({ runEvidence }) => runEvidence.find(({ runId }) => runId === run.runId)?.graderSessionId,
      ),
    );
    expect(targetIds.size).toBe(1);
    expect(graderIds.size).toBe(1);
  }
  expect(receipt.aggregateDigest).toMatch(/^[a-f0-9]{64}$/u);
});

test('rejects identical omissions and matrix fingerprints outside the frozen case matrix', () => {
  const receipts = [receiptForRun(1), receiptForRun(2), receiptForRun(3)];
  const allOmitSameCase = receipts.map((receipt) =>
    withCaseResults(receipt, [receipt.caseResults[0] as BehaviorRunReceipt['caseResults'][number]]),
  );
  expect(() => aggregateBehaviorRunReceipts(allOmitSameCase, 3, hash)).toThrow(
    'complete manifest-bound case set',
  );

  const sameSizeWrongCaseSet = receipts.map((receipt) =>
    withCaseResults(receipt, [
      receipt.caseResults[0] as BehaviorRunReceipt['caseResults'][number],
      {
        ...(receipt.caseResults[1] as BehaviorRunReceipt['caseResults'][number]),
        caseId: `unexpected-${receipt.metadata.runIndex}`,
      },
    ]),
  );
  expect(() => aggregateBehaviorRunReceipts(sameSizeWrongCaseSet, 3, hash)).toThrow(
    'complete manifest-bound case set',
  );

  expect(() =>
    aggregateBehaviorRunReceiptsForExpected(
      receipts,
      {
        axes,
        cases: cases.filter(({ split }) => split === 'train'),
        matrixFingerprint: '5'.repeat(64),
        ownerId: metadata.ownerId,
        split: 'train',
      },
      3,
      hash,
    ),
  ).toThrow('matrix fingerprint does not match the manifest-bound cases');

  expect(() =>
    aggregateBehaviorRunReceiptsForExpected(
      receipts,
      {
        axes,
        cases: [],
        matrixFingerprint: metadata.matrixFingerprint,
        ownerId: metadata.ownerId,
        split: 'train',
      },
      3,
      hash,
    ),
  ).toThrow('nonempty, unique manifest-bound case set');
});

test('rejects wrong run counts, reused ids or sessions, and incomparable receipts', () => {
  const receipts = [receiptForRun(1), receiptForRun(2), receiptForRun(3)];
  expect(() => aggregateBehaviorRunReceipts(receipts.slice(0, 2), 3, hash)).toThrow(
    'requires exactly 3 run receipts',
  );
  expect(() => aggregateBehaviorRunReceipts(receipts, 2, hash)).toThrow('exactly 3 runs per case');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [
        receipts[0] as BehaviorRunReceipt,
        receipts[0] as BehaviorRunReceipt,
        receipts[2] as BehaviorRunReceipt,
      ],
      3,
      hash,
    ),
  ).toThrow('run IDs and indices must be unique');

  const firstRun = receipts[0] as BehaviorRunReceipt;
  const mismatchedCaseRunId = withCaseResults(
    firstRun,
    firstRun.caseResults.map((item) => ({
      ...item,
      runId: '44444444-4444-4444-8444-444444444444',
    })),
  );
  expect(() =>
    aggregateBehaviorRunReceipts(
      [mismatchedCaseRunId, receipts[1] as BehaviorRunReceipt, receipts[2] as BehaviorRunReceipt],
      3,
      hash,
    ),
  ).toThrow('case runId does not match its run receipt');

  const second = receipts[1] as BehaviorRunReceipt;
  const reusedSession = withCaseResults(
    second,
    second.caseResults.map((item, index) =>
      index === 0
        ? { ...item, targetSessionId: receipts[0]?.caseResults[0]?.targetSessionId ?? '' }
        : item,
    ),
  );
  expect(() =>
    aggregateBehaviorRunReceipts(
      [receipts[0] as BehaviorRunReceipt, reusedSession, receipts[2] as BehaviorRunReceipt],
      3,
      hash,
    ),
  ).toThrow('session IDs must stay role-separated and unique across runs');

  const changedPrompt = {
    ...receipts[1],
    metadata: { ...receipts[1]?.metadata, taskPromptVersion: 'task-v2' },
  } as BehaviorRunReceipt;
  expect(() =>
    aggregateBehaviorRunReceipts(
      [receipts[0] as BehaviorRunReceipt, changedPrompt, receipts[2] as BehaviorRunReceipt],
      3,
      hash,
    ),
  ).toThrow('comparable metadata');
});

test('does not average away a failed axis or hard assertion', () => {
  const axisFailure = aggregateBehaviorRunReceipts(
    [receiptForRun(1), receiptForRun(2), receiptForRun(3, { failAxis: true })],
    3,
    hash,
  );
  const axis = axisFailure.caseResults[0]?.axes[axes[0] ?? ''];
  expect(axisFailure.decision).toBe('reject');
  expect(axisFailure.admission).toBe('run-id-linked');
  expect(axis).toMatchObject({
    outcomes: ['pass', 'pass', 'fail'],
    passCount: 2,
    passRate: 2 / 3,
  });
  expect(axis?.sampleVariance).toBeCloseTo(1 / 3, 14);

  const hardFailure = aggregateBehaviorRunReceipts(
    [receiptForRun(1), receiptForRun(2, { failHardAssertion: true }), receiptForRun(3)],
    3,
    hash,
  );
  expect(hardFailure.decision).toBe('reject');
  expect(hardFailure.caseResults[0]?.hardAssertionsPass.outcomes).toEqual([true, false, true]);
  expect(hardFailure.caseResults[0]?.hardAssertions['no-outside-diff']?.outcomes).toEqual([
    'passed',
    'failed',
    'passed',
  ]);
  expect(hardFailure.caseResults[0]?.hardAssertionEvidence['no-outside-diff']).toEqual([
    'diff omits expected literal: outside',
    'diff contains expected literal: outside',
    'diff omits expected literal: outside',
  ]);
});

test('rejects incomplete, forged, or structurally incomparable run receipts', () => {
  const receipts = [receiptForRun(1), receiptForRun(2), receiptForRun(3)];
  const first = receipts[0] as BehaviorRunReceipt;
  const second = receipts[1] as BehaviorRunReceipt;
  const third = receipts[2] as BehaviorRunReceipt;
  const firstCase = first.caseResults[0] as BehaviorRunReceipt['caseResults'][number];

  expect(() => aggregateBehaviorRunReceipts([{}, second, third], 3, hash)).toThrow(
    'not a complete run receipt',
  );
  expect(() =>
    aggregateBehaviorRunReceipts([{ ...first, admission: 'accepted' }, second, third], 3, hash),
  ).toThrow('invalid run receipt fields');
  const misclassifiedTrace = {
    ...firstCase,
    toolTraceEvidence: 'host-verified-event-log',
  } as unknown as typeof firstCase;
  expect(() =>
    aggregateBehaviorRunReceipts(
      [withCaseResults(first, [misclassifiedTrace, ...first.caseResults.slice(1)]), second, third],
      3,
      hash,
    ),
  ).toThrow('malformed or duplicate case evidence');
  expect(() =>
    aggregateBehaviorRunReceipts([{ ...first, decision: 'reject' }, second, third], 3, hash),
  ).toThrow('decision disagrees');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [{ ...first, caseResults: [{ ...firstCase, hardAssertions: [] }] }, second, third],
      3,
      hash,
    ),
  ).toThrow('malformed or duplicate case evidence');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [{ ...first, caseResults: [{ ...firstCase, hardAssertions: [] }] }, second, third],
      3,
      hash,
    ),
  ).toThrow('malformed or duplicate case evidence');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [{ ...first, caseResults: [{ ...firstCase, output: 'forged output' }] }, second, third],
      3,
      hash,
    ),
  ).toThrow('malformed or duplicate case evidence');

  expect(() =>
    aggregateBehaviorRunReceipts(
      [
        { ...first, caseResults: [{ ...firstCase, targetSessionId: 'altered-session' }] },
        second,
        third,
      ],
      3,
      hash,
    ),
  ).toThrow('result fingerprint does not match case results');
});

test('rejects uncited axis evidence and invalid or duplicate hard assertions', () => {
  const receipts = [receiptForRun(1), receiptForRun(2), receiptForRun(3)];
  const first = receipts[0] as BehaviorRunReceipt;
  const second = receipts[1] as BehaviorRunReceipt;
  const third = receipts[2] as BehaviorRunReceipt;
  const firstCase = first.caseResults[0] as BehaviorRunReceipt['caseResults'][number];
  expect(() =>
    aggregateBehaviorRunReceipts(
      [
        {
          ...first,
          caseResults: [
            {
              ...firstCase,
              axisEvidence: { ...firstCase.axisEvidence, [axes[0] ?? '']: 'uncited' },
            },
          ],
        },
        second,
        third,
      ],
      3,
      hash,
    ),
  ).toThrow('malformed or duplicate case evidence');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [
        {
          ...first,
          caseResults: [
            {
              ...firstCase,
              hardAssertions: firstCase.hardAssertions.map((item, index) =>
                index === 0 ? { ...item, expected: 'not in output' } : item,
              ),
            },
          ],
        },
        second,
        third,
      ],
      3,
      hash,
    ),
  ).toThrow('hard assertion status disagrees with evidence');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [
        {
          ...first,
          caseResults: [
            {
              ...firstCase,
              hardAssertions: firstCase.hardAssertions.map((item, index) =>
                index === 0 ? { ...item, status: 'unknown' } : item,
              ),
            },
          ],
        },
        second,
        third,
      ],
      3,
      hash,
    ),
  ).toThrow('malformed hard assertion result');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [
        {
          ...first,
          caseResults: [
            {
              ...firstCase,
              hardAssertions: [firstCase.hardAssertions[0], firstCase.hardAssertions[0]],
            },
          ],
        },
        second,
        third,
      ],
      3,
      hash,
    ),
  ).toThrow('duplicate hard assertion IDs');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [
        {
          ...first,
          caseResults: [{ ...firstCase, hardAssertionsPass: false }],
        },
        second,
        third,
      ],
      3,
      hash,
    ),
  ).toThrow('hard assertion summary is inconsistent');
  expect(() =>
    aggregateBehaviorRunReceipts(
      [{ ...first, caseResults: [firstCase, firstCase] }, second, third],
      3,
      hash,
    ),
  ).toThrow('malformed or duplicate case evidence');
});

test('rejects incomplete or incomparable cases and metadata', () => {
  const first = receiptForRun(1);
  const second = receiptForRun(2);
  const third = receiptForRun(3);
  const missingCase = withCaseResults(second, second.caseResults.slice(0, 1));
  expect(() => aggregateBehaviorRunReceipts([first, missingCase, third], 3, hash)).toThrow(
    'complete manifest-bound case set',
  );
  const changedFamily = withCaseResults(
    second,
    second.caseResults.map((item, index) =>
      index === 0 ? { ...item, taskFamily: 'different-family' } : item,
    ),
  );
  expect(() => aggregateBehaviorRunReceipts([first, changedFamily, third], 3, hash)).toThrow(
    'case metadata differs',
  );
  const changedSplit = { ...second, split: 'validation' } as BehaviorRunReceipt;
  expect(() => aggregateBehaviorRunReceipts([first, changedSplit, third], 3, hash)).toThrow(
    'comparable metadata and one shared split',
  );
  expect(() =>
    aggregateBehaviorRunReceipts([first, second, third], 3, (value) =>
      value.startsWith('{') ? 'invalid' : hash(value),
    ),
  ).toThrow('result fingerprint');
});

test('rejects session IDs reused across run indices while allowing intra-run batching', () => {
  const first = receiptForRun(1);
  const second = receiptForRun(2);
  const third = receiptForRun(3);
  const reusedTarget = first.caseResults[0]?.targetSessionId as string;
  const changedSecond = withCaseResults(
    second,
    second.caseResults.map((item) => ({ ...item, targetSessionId: reusedTarget })),
  );

  expect(() => aggregateBehaviorRunReceipts([first, changedSecond, third], 3, hash)).toThrow(
    'session IDs must stay role-separated and unique across runs',
  );
});
