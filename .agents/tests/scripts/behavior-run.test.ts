import { afterAll, expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realFsPromises from 'node:fs/promises';

import {
  BEHAVIOR_RUN_SCHEMA_VERSION,
  BEHAVIOR_RUNS_PER_CASE,
  type BehaviorRunMetadata,
  evaluationMatrixFingerprintFor,
} from '../../utils/quality-engine/behavior-run.js';
import {
  type BehaviorEvaluationCase,
  behaviorRubricAxes,
  type ContractEvaluationCase,
} from '../../utils/quality-engine/evaluation-cases.js';

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
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Cannot canonically serialize test fixture.');
  }
  return serialized;
};

const digestFor = (value: string): string => {
  let state = 2166136261;
  for (const character of value) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return state.toString(16).padStart(8, '0').repeat(8);
};

let digestOverride: string | ((content: string) => string) | undefined;

const rootManifestText = JSON.stringify({
  evaluationId: '7c7628f9-e5d2-4062-a785-803e607b1e06',
  owners: [
    {
      artifacts: { cases: 'evals/cases.jsonl' },
      id: 'root',
      requiredLanes: ['behavior'],
    },
  ],
  policy: { behaviorRunsPerCase: 3 },
});

const createHash = mock((algorithm: string) => {
  let content = '';
  const hash = {
    digest: mock((_encoding: string) =>
      typeof digestOverride === 'function'
        ? digestOverride(content)
        : (digestOverride ?? digestFor(content)),
    ),
    update: mock((value: string) => {
      content += value;
      return hash;
    }),
  };
  expect(algorithm).toBe('sha256');
  return hash;
});

const readFile = mock(async (_path: string, _encoding: string) => '');
mock.module('node:crypto', () => ({ ...realCrypto, createHash }));
mock.module('node:fs/promises', () => ({ ...realFsPromises, readFile }));

const {
  BEHAVIOR_RUN_AGENTS_ROOT_PATH,
  BEHAVIOR_RUN_ROOT_MANIFEST_PATH,
  behaviorRunUsage,
  runBehaviorRunCli,
  runBehaviorRunCommand,
  runBehaviorRunMain,
} = await import('../../scripts/behavior-run.js');

const Bun = { argv: mock((args: readonly string[]) => args) };
const console = mock((message: string) => message);

afterAll(() => {
  mock.restore();
});

const evaluationCase: BehaviorEvaluationCase = {
  expectedOutcomes: ['save the requested note'],
  failureMode: 'the child writes outside the fixture',
  fixture: 'The scratch fixture contains only note.md.',
  forbiddenOutcomes: ['modify a path outside the fixture'],
  hardAssertions: [{ expected: 'saved note', id: 'saved-output', kind: 'output-contains' }],
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

const contractCase: ContractEvaluationCase = {
  assertions: [{ expected: 'Use the frozen behavior matrix.', kind: 'required-text' }],
  failureMode: 'The behavior matrix is not frozen.',
  id: 'root-contract-matrix-binding',
  independentVerifier: 'matrix-shape',
  kind: 'contract',
  repairBoundary: 'The root evaluation manifest case artifact.',
  scenario: 'The root behavior runner uses the manifest-owned matrix.',
  visibility: 'candidate',
};

const metadata: BehaviorRunMetadata = {
  candidateId: 'candidate-1',
  evaluationId: '7c7628f9-e5d2-4062-a785-803e607b1e06',
  graderModelId: 'host-model-v1',
  graderPromptVersion: 'grader-v1',
  graderRuntimeId: 'runtime-a',
  manifestFingerprint: digestFor(rootManifestText),
  matrixFingerprint: evaluationMatrixFingerprintFor([contractCase, evaluationCase], digestFor),
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

const caseText = [contractCase, evaluationCase].map((item) => JSON.stringify(item)).join('\n');
const targetResponse = JSON.stringify({
  diff: '--- a/note.md\n+++ b/note.md\n+saved note',
  output: 'I saved the saved note.',
  runId: metadata.runId,
  toolTrace: 'inspect note.md; write note.md',
});
const graderResponse = JSON.stringify({
  axisResults: behaviorRubricAxes.map((axis) => ({
    agreement: 'agreed',
    axis,
    evidence: 'saved note',
    status: 'pass',
  })),
  runId: metadata.runId,
});

test('CLI prepares blind bundles and seals supplied captures as provisional', async () => {
  const files = new Map<string, string>([
    ['/cases.jsonl', caseText],
    [BEHAVIOR_RUN_ROOT_MANIFEST_PATH, rootManifestText],
    ['/metadata.json', JSON.stringify(metadata)],
    ['/rubric.md', '# Shared four-axis rubric'],
    [
      '/sessions.jsonl',
      JSON.stringify({
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      }),
    ],
    ['/source.md', '# Instruction under test'],
    ['/target.json', targetResponse],
  ]);
  let output = '';
  const write = mock((message: string) => {
    output = console(message);
  });
  const dependencies = {
    readText: async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`Missing test file: ${path}`);
      }
      return content;
    },
    write,
  };
  const run = (args: readonly string[]) => runBehaviorRunCli(Bun.argv(args), dependencies);

  await run(['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl']);
  const expected = JSON.parse(output) as { cases: readonly unknown[]; split: string };
  expect(expected.split).toBe('train');
  expect(expected.cases).toHaveLength(1);
  files.set(
    '/metadata.json',
    JSON.stringify({ ...metadata, evaluationId: '22222222-2222-4222-8222-222222222222' }),
  );
  await expect(
    run(['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl']),
  ).rejects.toThrow('does not match evals/manifest.json');
  files.set('/metadata.json', JSON.stringify(metadata));
  files.set(BEHAVIOR_RUN_ROOT_MANIFEST_PATH, JSON.stringify({}));
  await expect(
    run(['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl']),
  ).rejects.toThrow('Root evaluation manifest must contain a nonblank evaluationId');
  files.set(BEHAVIOR_RUN_ROOT_MANIFEST_PATH, rootManifestText);
  files.set('/expected.json', output);

  await run(['target', '/cases.jsonl', '/source.md', evaluationCase.id, '/metadata.json']);
  const targetBundle = JSON.parse(output) as Record<string, unknown>;
  expect(targetBundle.role).toBe('target');
  expect(targetBundle.runId).toBe(metadata.runId);
  expect(JSON.stringify(targetBundle)).not.toContain(evaluationCase.id);

  await run([
    'grader',
    '/cases.jsonl',
    '/rubric.md',
    evaluationCase.id,
    '/target.json',
    '/metadata.json',
  ]);
  const graderBundle = JSON.parse(output) as Record<string, unknown>;
  expect(graderBundle.role).toBe('grader');
  expect(graderBundle.runId).toBe(metadata.runId);
  expect(graderBundle.sharedRubric).toBe('# Shared four-axis rubric');
  expect(JSON.stringify(graderBundle)).not.toContain('candidate-1');

  const targetEnvelope = {
    caseId: evaluationCase.id,
    response: JSON.parse(targetResponse) as unknown,
    role: 'target',
    runId: metadata.runId,
    sessionId: 'target-session-1',
  };
  const graderEnvelope = {
    caseId: evaluationCase.id,
    response: JSON.parse(graderResponse) as unknown,
    role: 'grader',
    runId: metadata.runId,
    sessionId: 'grader-session-1',
  };
  files.set('/target.jsonl', `${JSON.stringify(targetEnvelope)}\n`);
  files.set('/grader.jsonl', `${JSON.stringify(graderEnvelope)}\n`);
  const expectedText = files.get('/expected.json') ?? '';
  files.set(
    '/expected.json',
    JSON.stringify({
      ...JSON.parse(expectedText),
      metadata: { ...metadata, evaluationId: '22222222-2222-4222-8222-222222222222' },
    }),
  );
  await expect(
    run(['seal', '/cases.jsonl', '/expected.json', '/target.jsonl', '/grader.jsonl']),
  ).rejects.toThrow('does not match evals/manifest.json');
  files.set('/expected.json', expectedText);
  await run(['seal', '/cases.jsonl', '/expected.json', '/target.jsonl', '/grader.jsonl']);
  const receipt = JSON.parse(output) as {
    admission: string;
    caseResults: readonly { runId: string; toolTraceEvidence: string }[];
    decision: string;
    metadata: BehaviorRunMetadata;
  };
  expect(receipt.decision).toBe('provisional');
  expect(receipt.admission).toBe('run-id-linked');
  expect(receipt.caseResults[0]?.runId).toBe(metadata.runId);
  expect(receipt.caseResults[0]?.toolTraceEvidence).toBe('reported-in-session');
  expect(receipt.metadata).toEqual(metadata);
});

const aggregateReceiptForRun = (runIndex: number): Record<string, unknown> => {
  const sessionSuffix = `run-${runIndex}`;
  const runId = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ][runIndex - 1];
  const output = 'I saved the saved note.';
  const diff = '--- a/note.md\n+++ b/note.md\n+saved note';
  const toolTrace = 'inspect note.md; write note.md';
  const caseResults = [
    {
      axes: Object.fromEntries(behaviorRubricAxes.map((axis) => [axis, 'pass'])),
      axisEvidence: Object.fromEntries(behaviorRubricAxes.map((axis) => [axis, 'saved note'])),
      caseId: evaluationCase.id,
      diff,
      diffDigest: digestFor(diff),
      graderSessionId: `grader-session-${sessionSuffix}`,
      hardAssertions: [
        {
          assertionId: 'saved-output',
          evidence: 'output contains expected literal: saved note',
          expected: 'saved note',
          kind: 'output-contains',
          status: 'passed',
        },
      ],
      hardAssertionsPass: true,
      output,
      outputDigest: digestFor(output),
      runId,
      targetSessionId: `target-session-${sessionSuffix}`,
      taskFamily: evaluationCase.taskFamily,
      toolTrace,
      toolTraceDigest: digestFor(toolTrace),
      toolTraceEvidence: 'reported-in-session',
    },
  ];
  return {
    admission: 'run-id-linked',
    caseResults,
    decision: 'provisional',
    metadata: {
      ...metadata,
      runId,
      runIndex,
    },
    resultsDigest: digestFor(canonicalJson(caseResults)),
    schemaVersion: BEHAVIOR_RUN_SCHEMA_VERSION,
    split: 'train',
  };
};

test('CLI aggregates the manifest-required run count and links each case to its runId', async () => {
  const files = new Map<string, string>([
    [`${BEHAVIOR_RUN_AGENTS_ROOT_PATH}evals/cases.jsonl`, caseText],
    [BEHAVIOR_RUN_ROOT_MANIFEST_PATH, rootManifestText],
    [
      '/run-receipts.jsonl',
      `${[1, 2, 3].map((index) => JSON.stringify(aggregateReceiptForRun(index))).join('\n')}\n`,
    ],
  ]);
  let output = '';
  const dependencies = {
    readText: async (path: string) => files.get(path) ?? '',
    write: (message: string) => {
      output = message;
    },
  };

  const aggregateArgs = ['aggregate', 'root', 'train', '/run-receipts.jsonl'];
  await runBehaviorRunCli(aggregateArgs, dependencies);
  const aggregate = JSON.parse(output) as {
    admission: string;
    decision: string;
    requiredRuns: number;
    runResults: readonly unknown[];
  };
  expect(aggregate).toMatchObject({
    admission: 'run-id-linked',
    decision: 'provisional',
    ownerId: 'root',
    requiredRuns: 3,
  });
  expect(aggregate.runResults).toHaveLength(3);

  files.set(
    '/run-receipts.jsonl',
    [1, 2, 3]
      .map((index) => {
        const receipt = aggregateReceiptForRun(index);
        return JSON.stringify({
          ...receipt,
          metadata: {
            ...(receipt.metadata as BehaviorRunMetadata),
            ownerId: 'skill:another-owner',
          },
        });
      })
      .join('\n'),
  );
  await expect(runBehaviorRunCli(aggregateArgs, dependencies)).rejects.toThrow(
    'owner, split, or matrix fingerprint does not match',
  );

  files.set('/run-receipts.jsonl', '\n');
  await expect(runBehaviorRunCli(aggregateArgs, dependencies)).rejects.toThrow(
    'one nonblank receipt per line',
  );
  files.set('/run-receipts.jsonl', '{\n');
  await expect(runBehaviorRunCli(aggregateArgs, dependencies)).rejects.toThrow(
    'line 1 is not valid JSON',
  );

  files.set(
    '/run-receipts.jsonl',
    [aggregateReceiptForRun(1), aggregateReceiptForRun(2), aggregateReceiptForRun(3)]
      .map((receipt, index) =>
        JSON.stringify(
          index === 1
            ? {
                ...receipt,
                metadata: { ...(receipt.metadata as object), manifestFingerprint: 'f'.repeat(64) },
              }
            : receipt,
        ),
      )
      .join('\n'),
  );
  await expect(runBehaviorRunCli(aggregateArgs, dependencies)).rejects.toThrow(
    'manifestFingerprint does not match',
  );
  files.set(
    BEHAVIOR_RUN_ROOT_MANIFEST_PATH,
    JSON.stringify({ evaluationId: metadata.evaluationId, policy: { behaviorRunsPerCase: 2 } }),
  );
  await expect(runBehaviorRunCli(aggregateArgs, dependencies)).rejects.toThrow(
    `exactly ${BEHAVIOR_RUNS_PER_CASE} behavior runs per case`,
  );

  files.set(
    BEHAVIOR_RUN_ROOT_MANIFEST_PATH,
    JSON.stringify({
      evaluationId: metadata.evaluationId,
      policy: { behaviorRunsPerCase: BEHAVIOR_RUNS_PER_CASE + 1 },
    }),
  );
  await expect(runBehaviorRunCli(aggregateArgs, dependencies)).rejects.toThrow(
    `exactly ${BEHAVIOR_RUNS_PER_CASE} behavior runs per case`,
  );
});

test('CLI requires one manifest-owned behavior case matrix for aggregation', async () => {
  const files = new Map<string, string>([
    [`${BEHAVIOR_RUN_AGENTS_ROOT_PATH}evals/cases.jsonl`, caseText],
    [BEHAVIOR_RUN_ROOT_MANIFEST_PATH, rootManifestText],
    ['/run-receipts.jsonl', ''],
  ]);
  const dependencies = {
    readText: async (path: string) => files.get(path) ?? '',
    write: () => undefined,
  };
  const run = (manifest: unknown, ownerId = 'root', split = 'train') => {
    files.set(BEHAVIOR_RUN_ROOT_MANIFEST_PATH, JSON.stringify(manifest));
    return runBehaviorRunCli(['aggregate', ownerId, split, '/run-receipts.jsonl'], dependencies);
  };

  await expect(
    run({ evaluationId: metadata.evaluationId, policy: { behaviorRunsPerCase: 3 } }),
  ).rejects.toThrow('must declare owner-bound case paths');
  await expect(run(JSON.parse(rootManifestText) as unknown, 'missing')).rejects.toThrow(
    'exactly one owner named missing',
  );
  await expect(
    run({
      evaluationId: metadata.evaluationId,
      owners: [
        { artifacts: { cases: 'evals/cases.jsonl' }, id: 'root', requiredLanes: ['behavior'] },
        { artifacts: { cases: 'evals/cases.jsonl' }, id: 'root', requiredLanes: ['behavior'] },
      ],
      policy: { behaviorRunsPerCase: 3 },
    }),
  ).rejects.toThrow('exactly one owner named root');
  await expect(
    run({
      evaluationId: metadata.evaluationId,
      owners: [{ artifacts: { cases: 'evals/cases.jsonl' }, id: 'root', requiredLanes: [] }],
      policy: { behaviorRunsPerCase: 3 },
    }),
  ).rejects.toThrow('no behavior lane or case artifact');
  await expect(
    run({
      evaluationId: metadata.evaluationId,
      owners: [
        { artifacts: { cases: 'evals/../outside.jsonl' }, id: 'root', requiredLanes: ['behavior'] },
      ],
      policy: { behaviorRunsPerCase: 3 },
    }),
  ).rejects.toThrow('unsafe case artifact path');
  await expect(run(JSON.parse(rootManifestText) as unknown, 'root', 'validation')).rejects.toThrow(
    'no frozen validation behavior cases',
  );
});

test('CLI binds the manifest fingerprint and run index before preparing a run', async () => {
  const files = new Map<string, string>([
    ['/cases.jsonl', caseText],
    [BEHAVIOR_RUN_ROOT_MANIFEST_PATH, rootManifestText],
    ['/metadata.json', JSON.stringify({ ...metadata, runIndex: 4 })],
    [
      '/sessions.jsonl',
      JSON.stringify({
        caseId: evaluationCase.id,
        graderSessionId: 'grader-session-1',
        targetSessionId: 'target-session-1',
      }),
    ],
  ]);
  const dependencies = {
    readText: async (path: string) => files.get(path) ?? '',
    write: () => undefined,
  };
  const run = () =>
    runBehaviorRunCli(
      ['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl'],
      dependencies,
    );

  await expect(run()).rejects.toThrow('runIndex must be between 1 and 3');
  files.set('/metadata.json', JSON.stringify({ ...metadata, manifestFingerprint: 'f'.repeat(64) }));
  await expect(run()).rejects.toThrow('manifestFingerprint does not match');
  files.set('/metadata.json', JSON.stringify({ ...metadata, matrixFingerprint: '5'.repeat(64) }));
  await expect(run()).rejects.toThrow('does not match the evaluation case matrix');
  files.set('/metadata.json', JSON.stringify(metadata));
  digestOverride = 'invalid';
  try {
    await expect(run()).rejects.toThrow(
      'Root evaluation manifest fingerprint must be a lowercase SHA-256',
    );
    digestOverride = (content) => (content.startsWith('[') ? 'invalid' : digestFor(content));
    await expect(run()).rejects.toThrow(
      'Evaluation case matrix fingerprint must be a lowercase SHA-256',
    );
  } finally {
    digestOverride = undefined;
  }
});

test('CLI rejects relative or wrongly suffixed artifact paths before reading', async () => {
  const readText = async () => {
    throw new Error('must not read');
  };
  const write = () => undefined;
  await expect(
    runBehaviorRunCli(['expected', 'cases.jsonl', '/metadata.json', 'train'], { readText, write }),
  ).rejects.toThrow('Usage:');
  await expect(
    runBehaviorRunCli(['target', '/cases.jsonl', '/source.txt', 'case'], { readText, write }),
  ).rejects.toThrow('Usage:');
});

test('CLI rejects missing cases, malformed sessions, and incomplete run metadata', async () => {
  const files = new Map<string, string>([
    ['/cases.jsonl', caseText],
    [BEHAVIOR_RUN_ROOT_MANIFEST_PATH, rootManifestText],
    ['/metadata.json', JSON.stringify(metadata)],
    ['/null-metadata.json', 'null'],
    ['/invalid-run-id.json', JSON.stringify({ ...metadata, runId: 'not-a-uuid' })],
    ['/sessions.jsonl', ''],
    ['/expected.json', JSON.stringify({ cases: [], metadata, split: 'train' })],
  ]);
  const dependencies = {
    readText: async (path: string) => files.get(path) ?? '',
    write: () => undefined,
  };

  await expect(
    runBehaviorRunCli(
      ['target', '/cases.jsonl', '/source.md', 'unknown', '/metadata.json'],
      dependencies,
    ),
  ).rejects.toThrow('No behavior case has id unknown');
  await expect(
    runBehaviorRunCli(
      ['target', '/cases.jsonl', '/source.md', evaluationCase.id, '/null-metadata.json'],
      dependencies,
    ),
  ).rejects.toThrow('must contain a UUIDv4 runId');
  await expect(
    runBehaviorRunCli(
      ['target', '/cases.jsonl', '/source.md', evaluationCase.id, '/invalid-run-id.json'],
      dependencies,
    ),
  ).rejects.toThrow('must contain a UUIDv4 runId');
  await expect(
    runBehaviorRunCli(
      ['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl'],
      dependencies,
    ),
  ).rejects.toThrow('one nonblank row per case');
  files.set('/sessions.jsonl', '\n');
  await expect(
    runBehaviorRunCli(
      ['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl'],
      dependencies,
    ),
  ).rejects.toThrow('one nonblank row per case');
  files.set('/sessions.jsonl', '{');
  await expect(
    runBehaviorRunCli(
      ['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl'],
      dependencies,
    ),
  ).rejects.toThrow('line 1 is not valid JSON');
  files.set('/sessions.jsonl', '{}');
  await expect(
    runBehaviorRunCli(
      ['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl'],
      dependencies,
    ),
  ).rejects.toThrow('row 1 is malformed');

  files.set('/metadata.json', 'null');
  files.set(
    '/sessions.jsonl',
    JSON.stringify({
      caseId: evaluationCase.id,
      graderSessionId: 'grader-session-1',
      targetSessionId: 'target-session-1',
    }),
  );
  await expect(
    runBehaviorRunCli(
      ['expected', '/cases.jsonl', '/metadata.json', 'train', '/sessions.jsonl'],
      dependencies,
    ),
  ).rejects.toThrow('Run metadata must be a JSON object');
  files.set('/metadata.json', JSON.stringify(metadata));
  await expect(
    runBehaviorRunCli(
      ['seal', '/cases.jsonl', '/expected.json', '/target.jsonl', '/grader.jsonl'],
      dependencies,
    ),
  ).rejects.toThrow('frozen behavior cases and per-case sessions');
  files.set('/expected.json', JSON.stringify({ metadata, split: 'train' }));
  await expect(
    runBehaviorRunCli(
      ['seal', '/cases.jsonl', '/expected.json', '/target.jsonl', '/grader.jsonl'],
      dependencies,
    ),
  ).rejects.toThrow('Expected run file must contain cases and run metadata');
  await expect(
    runBehaviorRunCli(
      ['expected', '/cases.jsonl', '/metadata.json', 'unknown', '/sessions.jsonl'],
      dependencies,
    ),
  ).rejects.toThrow('Usage:');
  await expect(runBehaviorRunCommand(['unknown'], dependencies)).rejects.toThrow('Usage:');
});

test('grader input must contain exactly the captured evidence strings', async () => {
  const files = new Map<string, string>([
    ['/cases.jsonl', caseText],
    ['/metadata.json', JSON.stringify(metadata)],
    ['/rubric.md', '# rubric'],
    [
      '/target.json',
      JSON.stringify({ diff: '', hidden: true, output: '', runId: metadata.runId, toolTrace: '' }),
    ],
  ]);
  const dependencies = {
    readText: async (path: string) => files.get(path) ?? '',
    write: () => undefined,
  };
  await expect(
    runBehaviorRunCli(
      ['grader', '/cases.jsonl', '/rubric.md', evaluationCase.id, '/target.json', '/metadata.json'],
      dependencies,
    ),
  ).rejects.toThrow('exactly string fields diff, output, runId, and toolTrace');
  files.set(
    '/target.json',
    JSON.stringify({
      diff: '',
      output: '',
      runId: '22222222-2222-4222-8222-222222222222',
      toolTrace: '',
    }),
  );
  await expect(
    runBehaviorRunCli(
      ['grader', '/cases.jsonl', '/rubric.md', evaluationCase.id, '/target.json', '/metadata.json'],
      dependencies,
    ),
  ).rejects.toThrow('runId does not match run metadata');
});

test('CLI main uses the filesystem and reports usage through its public helper', async () => {
  expect(behaviorRunUsage()).toContain('provisional local scores');
  const files = new Map<string, string>([
    ['/cases.jsonl', caseText],
    ['/metadata.json', JSON.stringify(metadata)],
    ['/source.md', '# Instruction under test'],
  ]);
  readFile.mockImplementation(async (path: string) => files.get(path) ?? '');
  const originalLog = globalThis.console.log;
  let output = '';
  globalThis.console.log = (message: string) => {
    output = message;
  };
  try {
    await runBehaviorRunMain([
      'target',
      '/cases.jsonl',
      '/source.md',
      evaluationCase.id,
      '/metadata.json',
    ]);
  } finally {
    globalThis.console.log = originalLog;
  }
  expect(JSON.parse(output)).toMatchObject({ role: 'target', task: evaluationCase.task });
  expect(behaviorRunUsage()).toContain('Usage:');
});
