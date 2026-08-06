import { afterEach, expect, mock, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as nodeFsPromises from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { join, resolve } from 'node:path';

mock.module('node:fs', () => nodeFs);
mock.module('node:fs/promises', () => nodeFsPromises);
mock.module('node:path', () => nodePath);

import { run, writeExclusiveFile } from '../../scripts/aidx.js';

const agentsRoot = resolve(import.meta.dir, '../..');
const sessionsRoot = join(agentsRoot, 'skills', 'aidx', 'sessions');
const cleanupPaths: string[] = [];

const invoke = async (
  args: readonly string[],
): Promise<Record<string, unknown>> => {
  let output = '';
  await run(args, (value) => {
    output = value;
  });
  return JSON.parse(output) as Record<string, unknown>;
};

afterEach(async () => {
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('initializes idempotently and persists a prepared transition batch once', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'aidx-cli-test-'));
  const cbmIndex = `aidx-cli-${randomUUID()}`;
  cleanupPaths.push(join(sessionsRoot, cbmIndex), temporaryRoot);
  const requestPath = join(temporaryRoot, 'request.json');
  await writeFile(
    requestPath,
    JSON.stringify({
      cbmIndex,
      concerns: ['keep the existing browser behavior'],
      goal: 'Make the application easier to use',
      id: 'make-application-easier-to-use',
      projectRoot: '/tmp/aidx-cli-project',
      requestedOutcome: 'A tested implementation plan.',
    }),
  );

  const created = await invoke(['init', requestPath]);
  const goalPath = created.path as string;
  expect(created.status).toBe('created');
  expect(created.id).toBe('make-application-easier-to-use');
  expect(created).not.toHaveProperty('derivedId');
  expect(created.nextState).toBe('CAPTURE_GOAL');

  const existing = await invoke(['init', requestPath]);
  expect(existing.status).toBe('existing');
  expect(existing.path).toBe(goalPath);

  const inspectionPath = join(temporaryRoot, 'inspection.md');
  const questionsPath = join(temporaryRoot, 'questions.md');
  const batchPath = join(temporaryRoot, 'batch.json');
  await writeFile(inspectionPath, 'Inspection evidence.');
  await writeFile(questionsPath, 'Questions evidence.');
  await writeFile(
    batchPath,
    JSON.stringify({
      steps: [
        { event: 'inspect_context', evidencePath: inspectionPath },
        { event: 'questions_ready', evidencePath: questionsPath },
      ],
    }),
  );

  const updated = await invoke(['advance-batch', goalPath, batchPath]);
  expect(updated.status).toBe('updated');
  expect(updated.nextState).toBe('ASK_QUESTIONS');
  expect(
    (updated.applied as Array<Record<string, unknown>>).map(
      (item) => item.status,
    ),
  ).toEqual(['applied', 'applied']);

  const retried = await invoke(['advance-batch', goalPath, batchPath]);
  expect(retried.status).toBe('already-applied');
  expect(
    (retried.applied as Array<Record<string, unknown>>).map(
      (item) => item.status,
    ),
  ).toEqual(['already-applied', 'already-applied']);
  expect(await readFile(goalPath, 'utf8')).toContain('questions_ready');
});

test('executes the configured final gate and returns its receipt', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'aidx-final-gate-cli-'));
  cleanupPaths.push(temporaryRoot);
  await writeFile(join(temporaryRoot, 'aidx.json'), '{"finalGate":"true"}\n');
  const result = await invoke(['final-gate', temporaryRoot]);
  expect(result).toMatchObject({
    command: 'true',
    exitCode: 0,
    receipt: 'final gate: true passed (exit 0)',
    source: 'aidx-config-json',
  });
});

test('fails the CLI when the configured final gate fails', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'aidx-final-gate-fail-'));
  cleanupPaths.push(temporaryRoot);
  await writeFile(join(temporaryRoot, 'aidx.json'), '{"finalGate":"false"}\n');
  await expect(invoke(['final-gate', temporaryRoot])).rejects.toThrow(
    'final gate: false failed (exit 1)',
  );
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: this is one exhaustive CLI contract test.
test('returns complete receipts and exercises command validation and closeout paths', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'aidx-command-test-'));
  const cbmIndex = `aidx-command-${randomUUID()}`;
  cleanupPaths.push(join(sessionsRoot, cbmIndex), temporaryRoot);
  const requestPath = join(temporaryRoot, 'request.json');
  const evidencePath = join(temporaryRoot, 'evidence.md');
  const emptyEvidencePath = join(temporaryRoot, 'empty.md');
  await writeFile(emptyEvidencePath, '');

  await writeFile(
    requestPath,
    JSON.stringify({
      cbmIndex,
      goal: 'Exercise every AIDX command',
      id: 'command-goal',
      projectRoot: '/tmp/aidx-command-project',
    }),
  );
  const existingWriter = (async () => {
    throw Object.assign(new Error('already exists'), { code: 'EEXIST' });
  }) as typeof writeFile;
  expect(
    await writeExclusiveFile('/tmp/aidx-existing', 'content', existingWriter),
  ).toBe(false);
  const failingWriter = (async () => {
    throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
  }) as typeof writeFile;
  await expect(
    writeExclusiveFile('/tmp/aidx-failing', 'content', failingWriter),
  ).rejects.toThrow('permission denied');
  await expect(invoke(['init'])).rejects.toThrow('Usage:');
  await expect(invoke(['status', 'relative.md'])).rejects.toThrow(
    'absolute path',
  );
  await expect(invoke(['status'])).rejects.toThrow('Usage:');
  await expect(invoke(['validate'])).rejects.toThrow('Usage:');
  await expect(invoke(['final-gate'])).rejects.toThrow('Usage:');
  await expect(invoke(['status', '/tmp/not-a-goal.md'])).rejects.toThrow(
    'must live under',
  );
  await expect(invoke(['run-nothing'])).rejects.toThrow('Usage:');
  await expect(invoke(['init', requestPath, 'extra'])).rejects.toThrow(
    'Usage:',
  );

  const missingFieldRequestPath = join(temporaryRoot, 'missing-field.json');
  await writeFile(
    missingFieldRequestPath,
    JSON.stringify({ goal: 'Missing repository identity' }),
  );
  await expect(invoke(['init', missingFieldRequestPath])).rejects.toThrow(
    'field "id"',
  );

  const snakeCaseRequestPath = join(temporaryRoot, 'snake-case.json');
  await writeFile(
    snakeCaseRequestPath,
    JSON.stringify({
      cbm_index: cbmIndex,
      goal: 'Snake case must be rejected',
      id: 'snake-case',
      project_root: '/tmp/aidx-command-project',
    }),
  );
  await expect(invoke(['init', snakeCaseRequestPath])).rejects.toThrow(
    'cbm_index (use cbmIndex)',
  );

  const unknownFieldRequestPath = join(temporaryRoot, 'unknown-field.json');
  await writeFile(
    unknownFieldRequestPath,
    JSON.stringify({
      cbmIndex,
      goal: 'Unknown field must be rejected',
      id: 'unknown-field',
      projectRoot: '/tmp/aidx-command-project',
      unexpected: true,
    }),
  );
  await expect(invoke(['init', unknownFieldRequestPath])).rejects.toThrow(
    'unexpected',
  );

  const nonObjectRequestPath = join(temporaryRoot, 'non-object.json');
  await writeFile(nonObjectRequestPath, '[]');
  await expect(invoke(['init', nonObjectRequestPath])).rejects.toThrow(
    'must be a JSON object',
  );

  const invalidOptionalTextPath = join(
    temporaryRoot,
    'invalid-optional-text.json',
  );
  await writeFile(
    invalidOptionalTextPath,
    JSON.stringify({
      cbmIndex,
      goal: 'Invalid optional text',
      id: 'invalid-optional-text',
      projectRoot: '/tmp/aidx-command-project',
      requestedOutcome: 42,
    }),
  );
  await expect(invoke(['init', invalidOptionalTextPath])).rejects.toThrow(
    'requestedOutcome',
  );

  const invalidConcernsPath = join(temporaryRoot, 'invalid-concerns.json');
  await writeFile(
    invalidConcernsPath,
    JSON.stringify({
      cbmIndex,
      concerns: [42],
      goal: 'Invalid concerns',
      id: 'invalid-concerns',
      projectRoot: '/tmp/aidx-command-project',
    }),
  );
  await expect(invoke(['init', invalidConcernsPath])).rejects.toThrow(
    'concerns',
  );

  const invalidIdRequestPath = join(temporaryRoot, 'invalid-id.json');
  await writeFile(
    invalidIdRequestPath,
    JSON.stringify({
      cbmIndex,
      goal: 'Invalid id',
      id: 'invalid id',
      projectRoot: '/tmp/aidx-command-project',
    }),
  );
  await expect(invoke(['init', invalidIdRequestPath])).rejects.toThrow(
    'unsupported characters',
  );

  const invalidIndexRequestPath = join(temporaryRoot, 'invalid-index.json');
  await writeFile(
    invalidIndexRequestPath,
    JSON.stringify({
      cbmIndex: 'invalid/index',
      goal: 'Invalid index',
      id: 'invalid-index',
      projectRoot: '/tmp/aidx-command-project',
    }),
  );
  await expect(invoke(['init', invalidIndexRequestPath])).rejects.toThrow(
    'unsupported characters',
  );

  const initialized = await invoke(['init', requestPath]);
  const goalPath = initialized.path as string;
  const status = await invoke(['status', goalPath]);
  const validation = await invoke(['validate', goalPath]);
  expect(status.nextAction).toMatchObject({
    events: ['inspect_context'],
    kind: 'transition',
  });
  expect(validation.status).toBe('valid');

  await writeFile(evidencePath, 'Command evidence.');
  const note = await invoke(['note', goalPath, 'context_note', evidencePath]);
  expect(note.status).toBe('updated');
  const inspected = await invoke([
    'advance',
    goalPath,
    'inspected-context',
    evidencePath,
  ]);
  expect(inspected.nextState).toBe('INSPECT_CONTEXT');
  const duplicate = await invoke([
    'advance',
    goalPath,
    'inspect_context',
    evidencePath,
  ]);
  expect(duplicate.status).toBe('already-applied');
  await writeFile(evidencePath, 'Questions are ready.');
  await invoke(['advance', goalPath, 'questions_ready', evidencePath]);

  await expect(
    invoke(['advance', goalPath, 'questions_ready', emptyEvidencePath]),
  ).rejects.toThrow('evidence file is empty');
  await expect(
    invoke(['note', goalPath, 'empty', emptyEvidencePath]),
  ).rejects.toThrow('evidence file is empty');
  await expect(invoke(['distill'])).rejects.toThrow('Usage:');
  const malformedDecisionPath = join(temporaryRoot, 'malformed-decision.json');
  await writeFile(malformedDecisionPath, '{');
  await expect(
    invoke(['distill', goalPath, malformedDecisionPath]),
  ).rejects.toThrow('must be valid JSON');
  await writeFile(malformedDecisionPath, '[]');
  await expect(
    invoke(['distill', goalPath, malformedDecisionPath]),
  ).rejects.toThrow('must be an object');
  const malformedDecisions: Array<[Record<string, unknown>, string]> = [
    [
      { disposition: 'no-durable-lesson', extra: true, planVersion: 1 },
      'unsupported field',
    ],
    [{ disposition: 'no-durable-lesson', planVersion: 0 }, 'positive integer'],
    [{ disposition: 'invalid', planVersion: 1 }, 'disposition is invalid'],
    [
      { disposition: 'no-durable-lesson', justification: '', planVersion: 1 },
      'justification must be non-empty',
    ],
    [
      {
        disposition: 'no-durable-lesson',
        justification: 'reason',
        knowledgeBaseReceiptPath: 'relative',
        planVersion: 1,
      },
      'knowledgeBaseReceiptPath must be absolute',
    ],
    [
      {
        disposition: 'no-durable-lesson',
        justification: 'reason',
        knowledgeBaseReceiptPath: '/tmp/receipt.json',
        planVersion: 1,
      },
      'must not include a knowledge-base receipt path',
    ],
    [
      { disposition: 'new-primary', planVersion: 1 },
      'require knowledgeBaseReceiptPath',
    ],
  ];
  for (const [decision, error] of malformedDecisions) {
    await writeFile(malformedDecisionPath, JSON.stringify(decision));
    await expect(
      invoke(['distill', goalPath, malformedDecisionPath]),
    ).rejects.toThrow(error);
  }
  await expect(invoke(['note'])).rejects.toThrow('Usage:');
  await expect(invoke(['advance'])).rejects.toThrow('Usage:');
  await expect(invoke(['advance-batch'])).rejects.toThrow('Usage:');

  const emptyBatchPath = join(temporaryRoot, 'empty-batch.json');
  await writeFile(emptyBatchPath, JSON.stringify({ steps: [] }));
  await expect(
    invoke(['advance-batch', goalPath, emptyBatchPath]),
  ).rejects.toThrow('1 to 6 steps');
  const primitiveBatchPath = join(temporaryRoot, 'primitive-batch.json');
  await writeFile(primitiveBatchPath, JSON.stringify({ steps: ['bad'] }));
  await expect(
    invoke(['advance-batch', goalPath, primitiveBatchPath]),
  ).rejects.toThrow('must be an object');
  const missingEventBatchPath = join(temporaryRoot, 'missing-event-batch.json');
  await writeFile(missingEventBatchPath, JSON.stringify({ steps: [{}] }));
  await expect(
    invoke(['advance-batch', goalPath, missingEventBatchPath]),
  ).rejects.toThrow('requires an event');
  const gatedBatchPath = join(temporaryRoot, 'gated-batch.json');
  await writeFile(
    gatedBatchPath,
    JSON.stringify({ steps: [{ event: 'approve_plan', evidencePath }] }),
  );
  await expect(
    invoke(['advance-batch', goalPath, gatedBatchPath]),
  ).rejects.toThrow('cannot be batched');
  const missingEvidenceBatchPath = join(
    temporaryRoot,
    'missing-evidence-batch.json',
  );
  await writeFile(
    missingEvidenceBatchPath,
    JSON.stringify({ steps: [{ event: 'questions_ready' }] }),
  );
  await expect(
    invoke(['advance-batch', goalPath, missingEvidenceBatchPath]),
  ).rejects.toThrow('requires evidencePath');

  const planRecord = await readFile(goalPath, 'utf8');
  await writeFile(
    goalPath,
    planRecord.replace(
      '## Approval',
      '## Plan v1\n\n### Steps\n\n1. [ ] Execute.\n\n## Approval',
    ),
  );
  await writeFile(evidencePath, 'Questions complete.');
  await invoke(['advance', goalPath, 'questions_complete', evidencePath]);
  await writeFile(evidencePath, 'Plan ready.');
  await invoke(['advance', goalPath, 'plan_ready', evidencePath]);
  await writeFile(evidencePath, 'Plan approved.');
  await invoke(['advance', goalPath, 'approve_plan', evidencePath]);
  await writeFile(evidencePath, 'Implementation complete.');
  await invoke(['advance', goalPath, 'implementation_complete', evidencePath]);
  await writeFile(evidencePath, 'Tests passed.');
  await invoke(['advance', goalPath, 'tests_passed', evidencePath]);
  await writeFile(evidencePath, 'No durable lesson.');
  const decisionPath = join(temporaryRoot, 'distill-decision.json');
  await writeFile(
    decisionPath,
    JSON.stringify({
      disposition: 'no-durable-lesson',
      justification: 'No verified durable lesson.',
      planVersion: 1,
    }),
  );
  const lesson = await invoke(['distill', goalPath, decisionPath]);
  expect(lesson.nextState).toBe('DISTILL_LESSON');
  expect(lesson.planRemoved).toBe(true);
  await writeFile(evidencePath, 'Closeout complete.');
  const done = await invoke([
    'advance',
    goalPath,
    'lesson_complete',
    evidencePath,
  ]);
  expect(done.nextState).toBe('DONE');

  const badSessionIndex = `aidx-bad-session-${randomUUID()}`;
  cleanupPaths.push(join(sessionsRoot, badSessionIndex));
  const badSessionPath = join(temporaryRoot, 'bad-session.json');
  await writeFile(
    badSessionPath,
    JSON.stringify({
      cbmIndex: badSessionIndex,
      goal: 'Bad session index',
      id: 'bad-session',
      projectRoot: '/tmp/aidx-command-project',
    }),
  );
  await mkdir(join(sessionsRoot, badSessionIndex, 'index.md'), {
    recursive: true,
  });
  await invoke(['init', badSessionPath]);

  const badGoalsIndex = `aidx-bad-goals-${randomUUID()}`;
  cleanupPaths.push(join(sessionsRoot, badGoalsIndex));
  const badGoalsPath = join(temporaryRoot, 'bad-goals.json');
  await writeFile(
    badGoalsPath,
    JSON.stringify({
      cbmIndex: badGoalsIndex,
      goal: 'Bad goals index',
      id: 'bad-goals',
      projectRoot: '/tmp/aidx-command-project',
    }),
  );
  await mkdir(join(sessionsRoot, badGoalsIndex, 'goals', 'index.md'), {
    recursive: true,
  });
  await invoke(['init', badGoalsPath]);

  const badGoalPath = `aidx-bad-goal-${randomUUID()}`;
  cleanupPaths.push(join(sessionsRoot, badGoalPath));
  const badGoalRequestPath = join(temporaryRoot, 'bad-goal.json');
  await writeFile(
    badGoalRequestPath,
    JSON.stringify({
      cbmIndex: badGoalPath,
      goal: 'Bad goal file',
      id: 'bad-goal',
      projectRoot: '/tmp/aidx-command-project',
    }),
  );
  await mkdir(join(sessionsRoot, badGoalPath, 'goals', 'bad-goal.md'), {
    recursive: true,
  });
  await expect(invoke(['init', badGoalRequestPath])).rejects.toThrow();

  const conflictRequestPath = join(temporaryRoot, 'conflict.json');
  await writeFile(
    conflictRequestPath,
    JSON.stringify({
      cbmIndex,
      goal: 'A different goal',
      id: 'command-goal',
      projectRoot: '/tmp/aidx-command-project',
    }),
  );
  await expect(invoke(['init', conflictRequestPath])).rejects.toThrow(
    'different request',
  );
});
