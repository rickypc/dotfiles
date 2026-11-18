import { expect, test } from 'bun:test';

import {
  BEHAVIOR_RUN_OUTPUT_REFERENCE_SCHEMA_VERSION,
  BEHAVIOR_RUN_SCHEMA_VERSION,
  type BehaviorRunCase,
  type BehaviorRunExpected,
  type BehaviorRunMetadata,
  buildBehaviorRunReceipt,
  canonicalJson as canonicalBehaviorJson,
} from '../../../../utils/quality-engine/behavior/run.js';

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

const hash = (value: string): string => {
  let state = 2166136261;
  for (const character of value) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return state.toString(16).padStart(8, '0').repeat(8);
};

test('canonical JSON rejects values that cannot be serialized', () => {
  expect(() => canonicalBehaviorJson(undefined)).toThrow('cannot be canonically serialized');
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

test('scores passing runs as provisional with case results linked to their runId', () => {
  const content = jsonlFor();
  const receipt = buildBehaviorRunReceipt(content, expected, hash);

  expect(receipt).toEqual({
    admission: 'run-id-linked',
    caseResults: [
      {
        axes: Object.fromEntries(axes.map((axis) => [axis, 'pass'])),
        axisEvidence: Object.fromEntries(axes.map((axis) => [axis, 'Saved'])),
        caseId: 'save-note',
        diff: '--- a/note.md\n+++ b/note.md\n+safe',
        diffDigest: hash('--- a/note.md\n+++ b/note.md\n+safe'),
        graderSessionId: 'grader-save-note',
        hardAssertions: [
          {
            assertionId: 'saved-output',
            evidence: 'output contains expected literal: Saved',
            expected: 'Saved',
            kind: 'output-contains',
            status: 'passed',
          },
          {
            assertionId: 'no-outside-diff',
            evidence: 'diff omits expected literal: outside',
            expected: 'outside',
            kind: 'diff-omits',
            status: 'passed',
          },
          {
            assertionId: 'no-shell-trace',
            evidence: 'toolTrace omits expected literal: shell',
            expected: 'shell',
            kind: 'trace-omits',
            status: 'passed',
          },
        ],
        hardAssertionsPass: true,
        output: 'Saved the safe note.',
        outputDigest: hash('Saved the safe note.'),
        runId: metadata.runId,
        targetSessionId: 'target-save-note',
        taskFamily: 'bounded-file-edit',
        toolTrace: 'write note.md',
        toolTraceDigest: hash('write note.md'),
        toolTraceEvidence: 'reported-in-session',
      },
      {
        axes: Object.fromEntries(axes.map((axis) => [axis, 'pass'])),
        axisEvidence: Object.fromEntries(axes.map((axis) => [axis, 'Reviewed'])),
        caseId: 'review-note',
        diff: '--- a/note.md\n+++ b/note.md\n+safe',
        diffDigest: hash('--- a/note.md\n+++ b/note.md\n+safe'),
        graderSessionId: 'grader-review-note',
        hardAssertions: [
          {
            assertionId: 'review-output',
            evidence: 'output contains expected literal: Reviewed',
            expected: 'Reviewed',
            kind: 'output-contains',
            status: 'passed',
          },
        ],
        hardAssertionsPass: true,
        output: 'Reviewed the safe note.',
        outputDigest: hash('Reviewed the safe note.'),
        runId: metadata.runId,
        targetSessionId: 'target-review-note',
        taskFamily: 'bounded-review',
        toolTrace: 'write note.md',
        toolTraceDigest: hash('write note.md'),
        toolTraceEvidence: 'reported-in-session',
      },
    ],
    decision: 'provisional',
    metadata,
    resultsDigest: hash(canonicalBehaviorJson(receipt.caseResults)),
    schemaVersion: BEHAVIOR_RUN_SCHEMA_VERSION,
    split: 'train',
  });
  expect(receipt.resultsDigest).not.toBe(hash(content));
  expect(receipt.caseResults[0]?.toolTraceEvidence).toBe('reported-in-session');
});

test('validates versioned output references and preserves the legacy schema path', () => {
  const versionedMetadata: BehaviorRunMetadata = {
    ...metadata,
    outputReferenceVersion: 2,
  };
  const versionedExpected = { ...expected, metadata: versionedMetadata };
  const versionedRows = cases
    .filter(({ split }) => split === 'train')
    .map((evaluationCase, index) => {
      const runReference = `run-${metadata.runIndex}-${metadata.runId}`;
      const output =
        index === 0
          ? `runId: ${runReference}\n${outputFor(evaluationCase)}`
          : `${outputFor(evaluationCase)}\nrunId: \`${runReference}\``;
      return {
        ...recordFor(evaluationCase, { output }),
        metadata: versionedMetadata,
        output,
        schemaVersion: BEHAVIOR_RUN_OUTPUT_REFERENCE_SCHEMA_VERSION,
      };
    });
  const receipt = buildBehaviorRunReceipt(
    versionedRows.map((row) => JSON.stringify(row)).join('\n'),
    versionedExpected,
    hash,
  );
  const receiptWithTrailingOutputNewline = buildBehaviorRunReceipt(
    versionedRows
      .map((row, index) => {
        if (index !== 0) {
          return JSON.stringify(row);
        }
        const output = `${row.output}\n`;
        return JSON.stringify({ ...row, output, outputDigest: hash(output) });
      })
      .join('\n'),
    versionedExpected,
    hash,
  );

  expect(receipt.schemaVersion).toBe(BEHAVIOR_RUN_OUTPUT_REFERENCE_SCHEMA_VERSION);
  expect(receiptWithTrailingOutputNewline.decision).toBe('provisional');
  expect(receipt.metadata.outputReferenceVersion).toBe(2);
  expect(() =>
    buildBehaviorRunReceipt(
      versionedRows
        .map((row, index) =>
          JSON.stringify(
            index === 0 ? { ...row, schemaVersion: BEHAVIOR_RUN_SCHEMA_VERSION } : row,
          ),
        )
        .join('\n'),
      versionedExpected,
      hash,
    ),
  ).toThrow('schema does not match');
  expect(() =>
    buildBehaviorRunReceipt(
      versionedRows
        .map((row, index) =>
          JSON.stringify(index === 0 ? { ...row, output: 'Saved the safe note.' } : row),
        )
        .join('\n'),
      versionedExpected,
      hash,
    ),
  ).toThrow('runIndex-linked runId reference');
});

test('rejects complete runs when a hard assertion or rubric axis fails', () => {
  const hardFailure = buildBehaviorRunReceipt(
    jsonlFor(undefined, (item, index) => {
      return index === 0
        ? recordFor(cases[0] as BehaviorRunCase, {
            axisEvidence: 'The requested file was not saved.',
            diff: '--- a/note.md\n+++ b/note.md\n+outside',
            output: 'The requested file was not saved.',
            toolTrace: 'shell command used',
          })
        : item;
    }),
    expected,
    hash,
  );
  expect(hardFailure.decision).toBe('reject');
  expect(hardFailure.admission).toBe('run-id-linked');
  expect(hardFailure.caseResults[0]?.hardAssertionsPass).toBe(false);

  const axisFailure = buildBehaviorRunReceipt(
    jsonlFor(undefined, (item, index) => {
      return index === 0
        ? recordFor(cases[0] as BehaviorRunCase, {
            axisStatus: 'fail',
          })
        : item;
    }),
    expected,
    hash,
  );
  expect(axisFailure.decision).toBe('reject');

  expect(() =>
    buildBehaviorRunReceipt(
      jsonlFor(undefined, (item, index) => {
        return index === 0
          ? recordFor(cases[0] as BehaviorRunCase, {
              axisAgreement: 'disputed',
              axisStatus: 'pass',
            })
          : item;
      }),
      expected,
      hash,
    ),
  ).toThrow('invalid, duplicate, or uncited rubric axis');
});

test('requires valid metadata formats', () => {
  const badMetadata: readonly { readonly label: string; readonly value: unknown }[] = [
    { label: 'non-object metadata', value: null },
    { label: 'missing metadata field', value: { ...metadata, runnerVersion: undefined } },
    { label: 'blank metadata', value: { ...metadata, runnerVersion: ' ' } },
    { label: 'invalid evaluation id', value: { ...metadata, evaluationId: 'evaluation-1' } },
    {
      label: 'non-v4 evaluation id',
      value: { ...metadata, evaluationId: '11111111-1111-1111-8111-111111111111' },
    },
    { label: 'invalid fingerprint', value: { ...metadata, matrixFingerprint: 'bad' } },
    {
      label: 'unsupported output reference version',
      value: { ...metadata, outputReferenceVersion: 1 },
    },
    { label: 'invalid run index', value: { ...metadata, runIndex: 0 } },
    { label: 'invalid run id', value: { ...metadata, runId: 'run-1' } },
    {
      label: 'non-v4 run id',
      value: { ...metadata, runId: '11111111-1111-1111-8111-111111111111' },
    },
    { label: 'blank runtime identity', value: { ...metadata, graderRuntimeId: ' ' } },
  ];
  for (const { label, value } of badMetadata) {
    expect(
      () =>
        buildBehaviorRunReceipt(
          jsonlFor(),
          { ...expected, metadata: value as BehaviorRunMetadata },
          hash,
        ),
      label,
    ).toThrow();
  }
});

test('requires complete frozen expectations', () => {
  const badExpectations: readonly [string, BehaviorRunExpected][] = [
    ['wrong axis count', { ...expected, axes: axes.slice(1) }],
    [
      'duplicate axes',
      { ...expected, axes: [axes[0] ?? '', axes[0] ?? '', axes[2] ?? '', axes[3] ?? ''] },
    ],
    ['blank axis', { ...expected, axes: [axes[0] ?? '', axes[1] ?? '', axes[2] ?? '', ' '] }],
    ['empty split', { ...expected, cases, split: 'validation' }],
    [
      'duplicate case id',
      { ...expected, cases: [cases[0] as BehaviorRunCase, cases[0] as BehaviorRunCase] },
    ],
    [
      'empty task family',
      { ...expected, cases: [{ ...cases[0], taskFamily: ' ' } as BehaviorRunCase] },
    ],
    [
      'no hard assertions',
      { ...expected, cases: [{ ...cases[0], hardAssertions: [] } as BehaviorRunCase] },
    ],
    [
      'duplicate hard assertion id',
      {
        ...expected,
        cases: [
          {
            ...cases[0],
            hardAssertions: [
              ...(cases[0]?.hardAssertions ?? []),
              cases[0]?.hardAssertions[0] as (typeof cases)[number]['hardAssertions'][number],
            ],
          },
        ] as readonly BehaviorRunCase[],
      },
    ],
  ];
  for (const [label, value] of badExpectations) {
    expect(() => buildBehaviorRunReceipt(jsonlFor(), value, hash), label).toThrow();
  }
});

test('allows batched role sessions and requires one distinct pair per frozen train case', () => {
  const malformedSessions = [
    expected.sessions.map((session, index) =>
      index === 0 ? { ...session, caseId: ' ' } : session,
    ),
    expected.sessions.map((session, index) =>
      index === 0 ? { ...session, targetSessionId: ' ' } : session,
    ),
    expected.sessions.map((session, index) =>
      index === 0 ? { ...session, graderSessionId: session.targetSessionId } : session,
    ),
    expected.sessions.map((session, index) =>
      index === 0 ? { ...session, caseId: 'unknown' } : session,
    ),
    expected.sessions.map((session) => ({ ...session, caseId: 'save-note' })),
    expected.sessions.map((session, index) =>
      index === 1 ? { ...session, targetSessionId: 'grader-save-note' } : session,
    ),
    expected.sessions.map((session, index) =>
      index === 1 ? { ...session, graderSessionId: 'target-save-note' } : session,
    ),
  ];
  expect(() =>
    buildBehaviorRunReceipt(
      jsonlFor(),
      { ...expected, sessions: expected.sessions.slice(1) },
      hash,
    ),
  ).toThrow('one target and grader session pair per train case');
  for (const sessions of malformedSessions) {
    expect(() => buildBehaviorRunReceipt(jsonlFor(), { ...expected, sessions }, hash)).toThrow(
      'session metadata must map every case to one target and one separate grader session',
    );
  }
});

test('accepts one runId-linked target and grader session pair batched across cases', () => {
  const sessions = expected.sessions.map((session) => ({
    ...session,
    graderSessionId: 'grader-batch',
    targetSessionId: 'target-batch',
  }));
  const content = jsonlFor(undefined, (record) => ({
    ...record,
    graderSessionId: 'grader-batch',
    targetSessionId: 'target-batch',
  }));
  const receipt = buildBehaviorRunReceipt(content, { ...expected, sessions }, hash);

  expect(receipt.decision).toBe('provisional');
  expect(receipt.caseResults.map(({ caseId }) => caseId)).toEqual(['save-note', 'review-note']);
  expect(new Set(receipt.caseResults.map(({ targetSessionId }) => targetSessionId))).toEqual(
    new Set(['target-batch']),
  );
  expect(new Set(receipt.caseResults.map(({ graderSessionId }) => graderSessionId))).toEqual(
    new Set(['grader-batch']),
  );
});

test('rejects malformed, blank, duplicate, missing, extra, and mismatched result rows', () => {
  expect(() => buildBehaviorRunReceipt('{broken', expected, hash)).toThrow('line 1');
  expect(() => buildBehaviorRunReceipt(`${jsonlFor()}\n\n`, expected, hash)).toThrow('nonblank');
  expect(() => buildBehaviorRunReceipt('', expected, hash)).toThrow('nonblank');

  const first = recordFor(cases[0] as BehaviorRunCase);
  const second = recordFor(cases[1] as BehaviorRunCase);
  const validFirst = JSON.stringify(first);
  const validSecond = JSON.stringify(second);
  expect(() => buildBehaviorRunReceipt(`${validFirst}\n${validFirst}`, expected, hash)).toThrow(
    'duplicate',
  );
  expect(() => buildBehaviorRunReceipt(validFirst, expected, hash)).toThrow('incomplete');

  const variants = [
    { label: 'unknown case', value: { ...first, caseId: 'unknown' } },
    { label: 'wrong target session', value: { ...first, targetSessionId: 'other-target' } },
    { label: 'wrong grader session', value: { ...first, graderSessionId: 'other-grader' } },
    {
      label: 'different run id',
      value: { ...first, runId: '22222222-2222-4222-8222-222222222222' },
    },
    { label: 'shared child session', value: { ...first, graderSessionId: first.targetSessionId } },
    { label: 'wrong split', value: { ...first, split: 'validation' } },
    { label: 'wrong task family', value: { ...first, taskFamily: 'other' } },
    { label: 'unsupported schema', value: { ...first, schemaVersion: 9 } },
    { label: 'extra field', value: { ...first, unexpected: true } },
    { label: 'missing evidence string', value: { ...first, output: undefined } },
    { label: 'bad hash format', value: { ...first, outputDigest: 'bad' } },
    { label: 'incorrect hash', value: { ...first, diff: 'altered' } },
    {
      label: 'different host metadata',
      value: {
        ...first,
        metadata: { ...metadata, modelId: 'different-model' },
      },
    },
    {
      label: 'unsupported metadata field',
      value: { ...first, metadata: { ...metadata, extraField: 'unsupported' } },
    },
  ];
  for (const { label, value } of variants) {
    expect(
      () => buildBehaviorRunReceipt(`${JSON.stringify(value)}\n${validSecond}`, expected, hash),
      label,
    ).toThrow();
  }

  expect(() =>
    buildBehaviorRunReceipt(`${validFirst}\n${validSecond}`, expected, (value) =>
      value.startsWith('[') ? 'bad' : hash(value),
    ),
  ).toThrow('fingerprint');
});

test('rejects malformed scores, uncited grader evidence, and unverified assertion claims', () => {
  const first = recordFor(cases[0] as BehaviorRunCase);
  const second = recordFor(cases[1] as BehaviorRunCase);
  const baseScore = first.score as Record<string, unknown>;
  const baseAxes = baseScore.axisResults as Record<string, unknown>[];
  const baseAssertions = baseScore.hardAssertions as Record<string, unknown>[];
  const variants = [
    { label: 'missing score', value: undefined },
    { label: 'score with extra field', value: { ...baseScore, extra: true } },
    { label: 'wrong score case', value: { ...baseScore, caseId: 'other' } },
    {
      label: 'wrong score fingerprint',
      value: { ...baseScore, sourceFingerprint: '5'.repeat(64) },
    },
    { label: 'missing axis', value: { ...baseScore, axisResults: baseAxes.slice(1) } },
    {
      label: 'duplicate axis',
      value: { ...baseScore, axisResults: [...baseAxes.slice(0, 3), baseAxes[0]] },
    },
    {
      label: 'uncited axis evidence',
      value: {
        ...baseScore,
        axisResults: baseAxes.map((axis, index) =>
          index === 0 ? { ...axis, evidence: 'not present' } : axis,
        ),
      },
    },
    {
      label: 'unknown axis',
      value: {
        ...baseScore,
        axisResults: baseAxes.map((axis, index) =>
          index === 0 ? { ...axis, axis: 'unknown' } : axis,
        ),
      },
    },
    {
      label: 'missing hard assertion',
      value: { ...baseScore, hardAssertions: baseAssertions.slice(1) },
    },
    {
      label: 'duplicate hard assertion',
      value: { ...baseScore, hardAssertions: [...baseAssertions.slice(0, 2), baseAssertions[0]] },
    },
    {
      label: 'claim disagrees with evidence',
      value: {
        ...baseScore,
        hardAssertions: baseAssertions.map((assertion, index) =>
          index === 0 ? { ...assertion, status: 'failed' } : assertion,
        ),
      },
    },
    {
      label: 'score uses an unknown assertion id',
      value: {
        ...baseScore,
        hardAssertions: baseAssertions.map((assertion, index) =>
          index === 0 ? { ...assertion, assertionId: 'unknown-assertion' } : assertion,
        ),
      },
    },
  ];
  for (const { label, value } of variants) {
    const row = { ...first, score: value };
    expect(
      () =>
        buildBehaviorRunReceipt(
          `${JSON.stringify(row)}\n${JSON.stringify(second)}`,
          expected,
          hash,
        ),
      label,
    ).toThrow();
  }
});
