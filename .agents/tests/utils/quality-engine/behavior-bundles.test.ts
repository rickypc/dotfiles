import { expect, test } from 'bun:test';

import {
  behaviorGraderBundleFor,
  behaviorRunReceiptFromResponses,
  behaviorTargetBundleFor,
} from '../../../utils/quality-engine/behavior-bundles.js';
import type {
  BehaviorRunExpected,
  BehaviorRunMetadata,
} from '../../../utils/quality-engine/behavior-run.js';
import {
  type BehaviorEvaluationCase,
  behaviorRubricAxes,
} from '../../../utils/quality-engine/evaluation-cases.js';

const axes = behaviorRubricAxes;

const evaluationCase: BehaviorEvaluationCase = {
  expectedOutcomes: ['save the requested note'],
  failureMode: 'the child writes outside the fixture',
  fixture: 'The scratch fixture contains only note.md.',
  forbiddenOutcomes: ['modify a path outside the fixture'],
  hardAssertions: [
    { expected: 'saved note', id: 'saved-output', kind: 'output-contains' },
    { expected: 'outside', id: 'no-outside-edit', kind: 'diff-omits' },
  ],
  id: 'save-note-train',
  kind: 'behavior',
  repairBoundary: 'scratch fixture only',
  rubricAxes: {
    'negative-constraint-adherence': 'No forbidden outcome appears.',
    'schema-diff-integrity': 'Only the requested note changes.',
    'scope-discipline': 'Every change stays inside the scratch fixture.',
    'step-sequence-compliance': 'Inspect, edit, then report.',
  },
  split: 'train',
  task: 'Save the requested note in the supplied scratch fixture.',
  taskFamily: 'bounded-file-edit',
};

const metadata: BehaviorRunMetadata = {
  candidateId: 'candidate-1',
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

const hash = (value: string): string => {
  let state = 2166136261;
  for (const character of value) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return state.toString(16).padStart(8, '0').repeat(8);
};

const target = {
  diff: '--- a/note.md\n+++ b/note.md\n+saved note',
  output: 'I saved the saved note.',
  runId: metadata.runId,
  toolTrace: 'inspect note.md; write note.md',
};

const grader = {
  axisResults: axes.map((axis) => ({
    agreement: 'agreed',
    axis,
    evidence: 'saved note',
    status: 'pass',
  })),
  runId: metadata.runId,
};

const graderEnvelope = (caseId: string, sessionId: string, response: unknown = grader) => ({
  caseId,
  response,
  role: 'grader',
  runId: metadata.runId,
  sessionId,
});

const jsonl = (rows: readonly unknown[]): string =>
  rows.map((row) => JSON.stringify(row)).join('\n');

const targetEnvelope = (caseId: string, sessionId: string, response: unknown = target) => ({
  caseId,
  response,
  role: 'target',
  runId: metadata.runId,
  sessionId,
});

test('target bundle hides labels and expected outcomes while preserving its task boundary', () => {
  const bundle = behaviorTargetBundleFor(
    evaluationCase,
    '# Instruction under test',
    metadata.runId,
  );
  const serialized = JSON.stringify(bundle);

  expect(bundle).toMatchObject({
    fixture: evaluationCase.fixture,
    instruction: '# Instruction under test',
    role: 'target',
    runId: metadata.runId,
    schemaVersion: 2,
    task: evaluationCase.task,
  });
  expect(bundle.responseContract.runId).toBe('echo the runId from this request exactly');
  expect(serialized).not.toContain(evaluationCase.id);
  expect(serialized).not.toContain('expectedOutcomes');
  expect(serialized).not.toContain('forbiddenOutcomes');
  expect(serialized).not.toContain('saved-output');
  expect(() => behaviorTargetBundleFor(evaluationCase, ' ', metadata.runId)).toThrow('nonblank');
  expect(() => behaviorTargetBundleFor(evaluationCase, '# instruction', 'bad-run-id')).toThrow(
    'UUIDv4',
  );
  expect(() =>
    behaviorTargetBundleFor(evaluationCase, '# instruction', metadata.runId, {
      outputReferenceVersion: 1,
      runIndex: metadata.runIndex,
    } as never),
  ).toThrow('Versioned target bundles require outputReferenceVersion 2');
  expect(() =>
    behaviorTargetBundleFor(evaluationCase, '# instruction', metadata.runId, {
      outputReferenceVersion: 2,
      runIndex: 0,
    }),
  ).toThrow('Versioned target bundles require outputReferenceVersion 2');
});

test('versioned target bundles bind the final output line to runIndex and the bare runId', () => {
  const versionedMetadata: BehaviorRunMetadata = {
    ...metadata,
    outputReferenceVersion: 2,
  };
  const versionedExpected: BehaviorRunExpected = {
    axes,
    cases: [
      {
        hardAssertions: evaluationCase.hardAssertions,
        id: evaluationCase.id,
        split: evaluationCase.split,
        taskFamily: evaluationCase.taskFamily,
      },
    ],
    metadata: versionedMetadata,
    sessions: [
      {
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      },
    ],
    split: 'train',
  };
  const bundle = behaviorTargetBundleFor(
    evaluationCase,
    '# Instruction under test',
    metadata.runId,
    { outputReferenceVersion: 2, runIndex: metadata.runIndex },
  );
  const output = `${target.output}\nrunId: \`run-${metadata.runIndex}-${metadata.runId}\``;
  const seal = (capturedOutput: string) =>
    behaviorRunReceiptFromResponses(
      jsonl([
        targetEnvelope(evaluationCase.id, 'target-session-1', {
          ...target,
          output: capturedOutput,
        }),
      ]),
      jsonl([graderEnvelope(evaluationCase.id, 'grader-session-1')]),
      versionedExpected,
      [evaluationCase],
      { sha256: hash },
    );

  expect(bundle).toMatchObject({
    outputReferenceVersion: 2,
    runId: metadata.runId,
    runIndex: metadata.runIndex,
    schemaVersion: 3,
  });
  expect(bundle.prompt).toContain(`runId: \`run-${metadata.runIndex}-${metadata.runId}\``);
  expect(Object.keys(bundle.responseContract).sort()).toEqual([
    'diff',
    'output',
    'runId',
    'toolTrace',
  ]);
  expect(bundle.responseContract.output).toContain(
    `runId: \`run-${metadata.runIndex}-${metadata.runId}\``,
  );
  expect(seal(output).schemaVersion).toBe(9);
  expect(() => seal(target.output)).toThrow('runIndex-linked runId reference');
});

test('grader bundle has no candidate identity and receives the captured evidence', () => {
  const sharedRubric = '# Shared four-axis rubric';
  const bundle = behaviorGraderBundleFor(evaluationCase, target, sharedRubric, metadata.runId);
  const serialized = JSON.stringify(bundle);

  expect(bundle.role).toBe('grader');
  expect(bundle.evidence).toMatchObject({
    ...target,
    toolTraceEvidence: 'reported-in-session',
  });
  expect(bundle.schemaVersion).toBe(3);
  expect(bundle.prompt).toContain('not an independently verified');
  expect(bundle.sharedRubric).toBe(sharedRubric);
  expect(bundle.runId).toBe(metadata.runId);
  expect(bundle.responseContract.runId).toBe('echo the runId from this request exactly');
  expect(bundle.expectedOutcomes).toEqual(evaluationCase.expectedOutcomes);
  expect(serialized).not.toContain('candidateId');
  expect(serialized).not.toContain(evaluationCase.id);
  expect(serialized).not.toContain('matrixFingerprint');
  expect(() => behaviorGraderBundleFor(evaluationCase, target, ' ', metadata.runId)).toThrow(
    'nonblank rubric',
  );
  expect(() => behaviorGraderBundleFor(evaluationCase, target, sharedRubric, 'bad-run-id')).toThrow(
    'UUIDv4',
  );
});

test('seals blind target and grader captures with the same linked runId', () => {
  const expected: BehaviorRunExpected = {
    axes,
    cases: [
      {
        hardAssertions: evaluationCase.hardAssertions,
        id: evaluationCase.id,
        split: evaluationCase.split,
        taskFamily: evaluationCase.taskFamily,
      },
    ],
    metadata,
    sessions: [
      {
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      },
    ],
    split: 'train',
  };
  const receipt = behaviorRunReceiptFromResponses(
    jsonl([targetEnvelope(evaluationCase.id, 'target-session-1')]),
    jsonl([graderEnvelope(evaluationCase.id, 'grader-session-1')]),
    expected,
    [evaluationCase],
    { sha256: hash },
  );

  expect(receipt.decision).toBe('provisional');
  expect(receipt.admission).toBe('run-id-linked');
  expect(receipt.metadata.runId).toBe(metadata.runId);
  expect(receipt.caseResults[0]?.runId).toBe(metadata.runId);
  expect(receipt.caseResults[0]?.caseId).toBe(evaluationCase.id);
  expect(receipt.caseResults[0]?.hardAssertionsPass).toBe(true);
  expect(receipt.caseResults[0]).toMatchObject({
    diff: target.diff,
    output: target.output,
    toolTrace: target.toolTrace,
  });
});

test('joins shuffled target and grader rows by exact case, role, and session identity', () => {
  const secondCase: BehaviorEvaluationCase = {
    ...evaluationCase,
    id: 'review-note-train',
    taskFamily: 'bounded-review',
  };
  const expected: BehaviorRunExpected = {
    axes,
    cases: [evaluationCase, secondCase].map(({ hardAssertions, id, split, taskFamily }) => ({
      hardAssertions,
      id,
      split,
      taskFamily,
    })),
    metadata,
    sessions: [
      {
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      },
      {
        caseId: secondCase.id,
        graderSessionId: 'grader-session-2',
        targetSessionId: 'target-session-2',
      },
    ],
    split: 'train',
  };
  const secondTarget = {
    diff: '--- a/note.md\n+++ b/note.md\n+reviewed saved note',
    output: 'Reviewed the saved note.',
    runId: metadata.runId,
    toolTrace: 'inspect note.md; review note.md',
  };
  const receipt = behaviorRunReceiptFromResponses(
    jsonl([
      targetEnvelope(secondCase.id, 'target-session-2', secondTarget),
      targetEnvelope(evaluationCase.id, 'target-session-1'),
    ]),
    jsonl([
      graderEnvelope(secondCase.id, 'grader-session-2'),
      graderEnvelope(evaluationCase.id, 'grader-session-1'),
    ]),
    expected,
    [evaluationCase, secondCase],
    { sha256: hash },
  );

  expect(receipt.caseResults.map(({ caseId }) => caseId)).toEqual([
    evaluationCase.id,
    secondCase.id,
  ]);
  expect(receipt.caseResults[0]).toMatchObject({
    output: target.output,
    toolTrace: target.toolTrace,
  });
  expect(receipt.caseResults[1]).toMatchObject({
    diff: secondTarget.diff,
    output: secondTarget.output,
    toolTrace: secondTarget.toolTrace,
  });
});

test('rejects extra ids and target or grader rows bound to the wrong session', () => {
  const expected: BehaviorRunExpected = {
    axes,
    cases: [
      {
        hardAssertions: evaluationCase.hardAssertions,
        id: evaluationCase.id,
        split: evaluationCase.split,
        taskFamily: evaluationCase.taskFamily,
      },
    ],
    metadata,
    sessions: [
      {
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      },
    ],
    split: 'train',
  };
  const seal = (targets: readonly unknown[], graders: readonly unknown[]) =>
    behaviorRunReceiptFromResponses(jsonl(targets), jsonl(graders), expected, [evaluationCase], {
      sha256: hash,
    });

  expect(() =>
    seal(
      [targetEnvelope('unexpected-case', 'target-session-1')],
      [graderEnvelope(evaluationCase.id, 'grader-session-1')],
    ),
  ).toThrow();
  expect(() =>
    seal(
      [targetEnvelope(evaluationCase.id, 'target-session-elsewhere')],
      [graderEnvelope(evaluationCase.id, 'grader-session-1')],
    ),
  ).toThrow();
  expect(() =>
    seal(
      [targetEnvelope(evaluationCase.id, 'target-session-1')],
      [graderEnvelope(evaluationCase.id, 'grader-session-elsewhere')],
    ),
  ).toThrow();
  expect(() =>
    seal(
      [
        {
          ...targetEnvelope(evaluationCase.id, 'target-session-1'),
          runId: '22222222-2222-4222-8222-222222222222',
        },
      ],
      [graderEnvelope(evaluationCase.id, 'grader-session-1')],
    ),
  ).toThrow('runId does not match');
  expect(() =>
    seal(
      [
        targetEnvelope(evaluationCase.id, 'target-session-1', {
          ...target,
          runId: '22222222-2222-4222-8222-222222222222',
        }),
      ],
      [graderEnvelope(evaluationCase.id, 'grader-session-1')],
    ),
  ).toThrow('response runId does not match');
  expect(() =>
    seal(
      [targetEnvelope(evaluationCase.id, 'target-session-1')],
      [
        graderEnvelope(evaluationCase.id, 'grader-session-1', {
          ...grader,
          runId: '22222222-2222-4222-8222-222222222222',
        }),
      ],
    ),
  ).toThrow('Grader response runId does not match');
});

test('rejects malformed response envelopes and duplicate case rows', () => {
  const expected: BehaviorRunExpected = {
    axes,
    cases: [
      {
        hardAssertions: evaluationCase.hardAssertions,
        id: evaluationCase.id,
        split: evaluationCase.split,
        taskFamily: evaluationCase.taskFamily,
      },
    ],
    metadata,
    sessions: [
      {
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      },
    ],
    split: 'train',
  };
  const seal = (targets: readonly unknown[], graders: readonly unknown[]) =>
    behaviorRunReceiptFromResponses(jsonl(targets), jsonl(graders), expected, [evaluationCase], {
      sha256: hash,
    });

  expect(() =>
    seal(
      [{ ...targetEnvelope(evaluationCase.id, 'target-session-1'), role: 'grader' }],
      [graderEnvelope(evaluationCase.id, 'grader-session-1')],
    ),
  ).toThrow('malformed case/role/session envelope');

  const secondCase = { ...evaluationCase, id: 'second-case' };
  const twoCases: BehaviorRunExpected = {
    ...expected,
    cases: [
      ...expected.cases,
      {
        hardAssertions: secondCase.hardAssertions,
        id: secondCase.id,
        split: secondCase.split,
        taskFamily: secondCase.taskFamily,
      },
    ],
    sessions: [
      ...expected.sessions,
      {
        caseId: secondCase.id,
        graderSessionId: 'grader-session-2',
        targetSessionId: 'target-session-2',
      },
    ],
  };
  expect(() =>
    behaviorRunReceiptFromResponses(
      jsonl([
        targetEnvelope(evaluationCase.id, 'target-session-1'),
        targetEnvelope(evaluationCase.id, 'target-session-1'),
      ]),
      jsonl([
        graderEnvelope(evaluationCase.id, 'grader-session-1'),
        graderEnvelope(secondCase.id, 'grader-session-2'),
      ]),
      twoCases,
      [evaluationCase, secondCase],
      { sha256: hash },
    ),
  ).toThrow('duplicate case id');
});

test.each([
  {
    graderRows: [
      graderEnvelope(evaluationCase.id, 'grader-session-1'),
      graderEnvelope('second-case', 'grader-session-2'),
    ],
    label: 'a missing target row',
    targetRows: [targetEnvelope(evaluationCase.id, 'target-session-1')],
  },
  {
    graderRows: [graderEnvelope(evaluationCase.id, 'grader-session-1')],
    label: 'a missing grader row',
    targetRows: [
      targetEnvelope(evaluationCase.id, 'target-session-1'),
      targetEnvelope('second-case', 'target-session-2'),
    ],
  },
  {
    graderRows: [
      graderEnvelope(evaluationCase.id, 'grader-session-1'),
      graderEnvelope('second-case', 'grader-session-2'),
    ],
    label: 'an extra target row',
    targetRows: [
      targetEnvelope(evaluationCase.id, 'target-session-1'),
      targetEnvelope('second-case', 'target-session-2'),
      targetEnvelope('unexpected-case', 'target-session-3'),
    ],
  },
  {
    graderRows: [
      graderEnvelope(evaluationCase.id, 'grader-session-1'),
      graderEnvelope('second-case', 'grader-session-2'),
      graderEnvelope('unexpected-case', 'grader-session-3'),
    ],
    label: 'an extra grader row',
    targetRows: [
      targetEnvelope(evaluationCase.id, 'target-session-1'),
      targetEnvelope('second-case', 'target-session-2'),
    ],
  },
])('rejects $label before associating responses', ({ graderRows, targetRows }) => {
  const secondCase = { ...evaluationCase, id: 'second-case', taskFamily: 'bounded-review' };
  const expected: BehaviorRunExpected = {
    axes,
    cases: [evaluationCase, secondCase].map(({ hardAssertions, id, split, taskFamily }) => ({
      hardAssertions,
      id,
      split,
      taskFamily,
    })),
    metadata,
    sessions: [
      {
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      },
      {
        caseId: secondCase.id,
        graderSessionId: 'grader-session-2',
        targetSessionId: 'target-session-2',
      },
    ],
    split: 'train',
  };

  expect(() =>
    behaviorRunReceiptFromResponses(
      jsonl(targetRows),
      jsonl(graderRows),
      expected,
      [evaluationCase, secondCase],
      { sha256: hash },
    ),
  ).toThrow('Target and grader responses must each match the frozen case count.');
});

test('receipt builder rejects missing responses, mismatched cases, and disputed grading', () => {
  const expected: BehaviorRunExpected = {
    axes,
    cases: [
      {
        hardAssertions: evaluationCase.hardAssertions,
        id: evaluationCase.id,
        split: evaluationCase.split,
        taskFamily: evaluationCase.taskFamily,
      },
    ],
    metadata,
    sessions: [
      {
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      },
    ],
    split: 'train',
  };
  expect(() =>
    behaviorRunReceiptFromResponses(
      '',
      jsonl([graderEnvelope(evaluationCase.id, 'grader-session-1')]),
      expected,
      [evaluationCase],
      {
        sha256: hash,
      },
    ),
  ).toThrow('one nonblank response');
  expect(() =>
    behaviorRunReceiptFromResponses(
      jsonl([targetEnvelope(evaluationCase.id, 'target-session-1')]),
      jsonl([graderEnvelope(evaluationCase.id, 'grader-session-1')]),
      expected,
      [],
      { sha256: hash },
    ),
  ).toThrow('frozen expected case order');
  expect(() =>
    behaviorRunReceiptFromResponses(
      jsonl([targetEnvelope(evaluationCase.id, 'target-session-1')]),
      jsonl([
        graderEnvelope(evaluationCase.id, 'grader-session-1', {
          axisResults: grader.axisResults.map((result, index) =>
            index === 0 ? { ...result, agreement: 'disputed' } : result,
          ),
          runId: metadata.runId,
        }),
      ]),
      expected,
      [evaluationCase],
      { sha256: hash },
    ),
  ).toThrow('invalid, duplicate, or uncited rubric axis');
});

test('rejects malformed target and grader rows, invalid JSON, and empty frozen splits', () => {
  const expected: BehaviorRunExpected = {
    axes,
    cases: [
      {
        hardAssertions: evaluationCase.hardAssertions,
        id: evaluationCase.id,
        split: evaluationCase.split,
        taskFamily: evaluationCase.taskFamily,
      },
    ],
    metadata,
    sessions: [
      {
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      },
    ],
    split: 'train',
  };
  const receipt = (targetContent: string, graderContent: string) =>
    behaviorRunReceiptFromResponses(targetContent, graderContent, expected, [evaluationCase], {
      sha256: hash,
    });

  expect(() =>
    receipt('{', jsonl([graderEnvelope(evaluationCase.id, 'grader-session-1')])),
  ).toThrow('line 1 is not valid JSON');
  expect(() =>
    receipt(
      jsonl([targetEnvelope(evaluationCase.id, 'target-session-1', { ...target, extra: true })]),
      jsonl([graderEnvelope(evaluationCase.id, 'grader-session-1')]),
    ),
  ).toThrow('exactly diff, output, runId, and toolTrace');
  expect(() =>
    receipt(
      jsonl([targetEnvelope(evaluationCase.id, 'target-session-1', { ...target, output: null })]),
      jsonl([graderEnvelope(evaluationCase.id, 'grader-session-1')]),
    ),
  ).toThrow('output must be a string');
  expect(() =>
    receipt(
      jsonl([targetEnvelope(evaluationCase.id, 'target-session-1')]),
      jsonl([graderEnvelope(evaluationCase.id, 'grader-session-1', { extra: true })]),
    ),
  ).toThrow('exactly axisResults');
  expect(() =>
    receipt(jsonl([targetEnvelope(evaluationCase.id, 'target-session-1')]), '{}\n{}'),
  ).toThrow('frozen case count');
  expect(() =>
    behaviorRunReceiptFromResponses(
      JSON.stringify(target),
      JSON.stringify(grader),
      { ...expected, cases: [] },
      [],
      { sha256: hash },
    ),
  ).toThrow('no frozen train cases');
});
