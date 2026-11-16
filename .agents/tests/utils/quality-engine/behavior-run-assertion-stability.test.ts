import { expect, test } from 'bun:test';

import {
  BEHAVIOR_RUN_SCHEMA_VERSION,
  type BehaviorRunCase,
  type BehaviorRunCaseReceipt,
  type BehaviorRunMetadata,
  type BehaviorRunReceipt,
  canonicalJson,
} from '../../../utils/quality-engine/behavior-run.js';
import { aggregateBehaviorRunReceipts } from '../../../utils/quality-engine/behavior-run-aggregate.js';

const axes = [
  'schema-diff-integrity',
  'negative-constraint-adherence',
  'step-sequence-compliance',
  'scope-discipline',
];

const evaluationCase: BehaviorRunCase = {
  hardAssertions: [{ expected: 'safe', id: 'safe-output', kind: 'output-contains' }],
  id: 'safe-note',
  split: 'train',
  taskFamily: 'bounded-file-edit',
};

const metadata: Omit<BehaviorRunMetadata, 'runId' | 'runIndex'> = {
  candidateId: 'baseline',
  evaluationId: '7c7628f9-e5d2-4062-a785-803e607b1e06',
  graderModelId: 'grader-v1',
  graderPromptVersion: 'grader-v1',
  graderRuntimeId: 'runtime-v1',
  manifestFingerprint: '1'.repeat(64),
  matrixFingerprint: '2'.repeat(64),
  modelId: 'target-v1',
  ownerId: 'root',
  reflectionPromptVersion: 'reflection-v1',
  rubricFingerprint: '3'.repeat(64),
  runnerVersion: 'runner-v1',
  sourceFingerprint: '4'.repeat(64),
  targetRuntimeId: 'runtime-v1',
  taskPromptVersion: 'task-v1',
};

const runIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

const hash = (value: string): string => {
  let state = 2166136261;
  for (const character of value) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return state.toString(16).padStart(8, '0').repeat(8);
};

const receiptFor = (
  runIndex: number,
  assertion: BehaviorRunCaseReceipt['hardAssertions'][number] = {
    assertionId: 'safe-output',
    evidence: 'output contains expected literal: safe',
    expected: 'safe',
    kind: 'output-contains',
    status: 'passed',
  },
): BehaviorRunReceipt => {
  const runId = runIds[runIndex - 1] as string;
  const output = 'Saved the safe note.';
  const diff = '--- a/note.md\n+++ b/note.md\n+safe';
  const toolTrace = 'write note.md';
  const caseResult: BehaviorRunCaseReceipt = {
    axes: Object.fromEntries(axes.map((axis) => [axis, 'pass'])),
    axisEvidence: Object.fromEntries(axes.map((axis) => [axis, 'safe'])),
    caseId: evaluationCase.id,
    diff,
    diffDigest: hash(diff),
    graderSessionId: `grader-${runIndex}`,
    hardAssertions: [assertion],
    hardAssertionsPass: assertion.status === 'passed',
    output,
    outputDigest: hash(output),
    runId,
    targetSessionId: `target-${runIndex}`,
    taskFamily: evaluationCase.taskFamily,
    toolTrace,
    toolTraceDigest: hash(toolTrace),
    toolTraceEvidence: 'reported-in-session',
  };
  const caseResults = [caseResult];
  return {
    admission: 'run-id-linked',
    caseResults,
    decision: caseResult.hardAssertionsPass ? 'provisional' : 'reject',
    metadata: { ...metadata, runId, runIndex },
    resultsDigest: hash(canonicalJson(caseResults)),
    schemaVersion: BEHAVIOR_RUN_SCHEMA_VERSION,
    split: 'train',
  };
};

const aggregate = (second: BehaviorRunReceipt): void => {
  aggregateBehaviorRunReceipts(
    [receiptFor(1), second, receiptFor(3)],
    {
      axes,
      cases: [evaluationCase],
      matrixFingerprint: metadata.matrixFingerprint,
      ownerId: 'root',
      split: 'train',
    },
    3,
    hash,
  );
};

test('requires stable hard assertion definitions across the three runIds', () => {
  expect(() =>
    aggregate(
      receiptFor(2, {
        assertionId: 'safe-output',
        evidence: 'output omits expected literal: safe-note',
        expected: 'safe-note',
        kind: 'output-contains',
        status: 'failed',
      }),
    ),
  ).toThrow('case metadata differs');

  expect(() =>
    aggregate(
      receiptFor(2, {
        assertionId: 'safe-output',
        evidence: 'output omits expected literal: outside',
        expected: 'outside',
        kind: 'output-omits',
        status: 'passed',
      }),
    ),
  ).toThrow('case metadata differs');
});
