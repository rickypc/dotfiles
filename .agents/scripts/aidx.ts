import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  type AidxDistillDecision,
  type AidxEvent,
  type AidxGoalDocument,
  appendAidxNote,
  createAidxGoal,
  finalizeAidxLesson,
  isAidxTransitionAlreadyApplied,
  isAidxTransitionBatchAlreadyApplied,
  legalAidxEvents,
  nextAidxAction,
  normalizeAidxEvent,
  parseAidxGoal,
  transitionAidxGoal,
} from '../utils/aidx.js';
import { runWhenMain } from '../utils/cli.js';
import { executeFinalGate, resolveFinalGate } from '../utils/final-gate.js';

interface AidxInitRequest {
  readonly [key: string]: unknown;
}

interface AppliedTransition {
  readonly event: AidxEvent;
  readonly nextState: string;
  readonly previousState: string;
  readonly status: 'already-applied' | 'applied';
}

interface TransitionStep {
  readonly event: AidxEvent;
  readonly evidence: string;
}

interface ValidatedAidxInitRequest {
  readonly cbmIndex: string;
  readonly goal: string;
  readonly id: string;
  readonly initialContext?: string;
  readonly projectRoot: string;
}

const stateRoot = resolve(import.meta.dir, '..', 'skills', 'aidx', 'sessions');

const absolutePath = (value: string | undefined, name: string): string => {
  if (!value?.startsWith('/')) {
    throw new Error(`${name} must be an absolute path.`);
  }
  return resolve(value);
};

const assertGoalPath = (path: string): void => {
  if (!path.startsWith(`${stateRoot}/`) || !path.endsWith('.md')) {
    throw new Error(`AIDX goal records must live under ${stateRoot}.`);
  }
};

const distillDecisionRecord = async (
  path: string,
): Promise<Record<string, unknown>> => {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    throw new Error('AIDX distill decision must be valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AIDX distill decision must be an object.');
  }
  return value as Record<string, unknown>;
};

const goalPathFor = (id: string, cbmIndex: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) {
    throw new Error('AIDX goal id contains unsupported characters.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(cbmIndex)) {
    throw new Error('AIDX CBM index contains unsupported characters.');
  }
  return join(stateRoot, cbmIndex, 'goals', `${id}.md`);
};

const goalsMap = (cbmIndex: string): string =>
  `# AIDX goal records\n\nGoal records for CBM index \`${cbmIndex}\`. Each goal file is the source of truth for one resumable request.\n`;

const readEvidence = async (path: string): Promise<string> => {
  const evidence = (await readFile(path, 'utf8')).trim();
  if (!evidence) {
    throw new Error('AIDX evidence file is empty.');
  }
  return evidence;
};

const readEvidenceSync = (path: string): string => {
  const value = readFileSync(path, 'utf8').trim();
  if (!value) {
    throw new Error('AIDX evidence file is empty.');
  }
  return value;
};

const sessionMap = (cbmIndex: string): string =>
  `# AIDX session map\n\nThis directory contains resumable AIDX goal records for CBM index \`${cbmIndex}\`.\n\n- [Goal records](goals/index.md) — active and historical records for this index.\n`;

const validateDistillDecisionBranch = (
  record: Record<string, unknown>,
): void => {
  const justification = record.justification;
  if (
    justification !== undefined &&
    (typeof justification !== 'string' || !justification.trim())
  ) {
    throw new Error(
      'AIDX distill decision justification must be non-empty when supplied.',
    );
  }
  const receiptPath = record.knowledgeBaseReceiptPath;
  if (
    receiptPath !== undefined &&
    (typeof receiptPath !== 'string' || !receiptPath.startsWith('/'))
  ) {
    throw new Error(
      'AIDX distill decision knowledgeBaseReceiptPath must be absolute.',
    );
  }
  if (record.disposition === 'no-durable-lesson' && receiptPath !== undefined) {
    throw new Error(
      'AIDX no-durable-lesson decisions must not include a knowledge-base receipt path.',
    );
  }
  if (
    record.disposition !== 'no-durable-lesson' &&
    typeof receiptPath !== 'string'
  ) {
    throw new Error(
      'AIDX durable lesson decisions require knowledgeBaseReceiptPath.',
    );
  }
};

const validateDistillDecisionShape = (
  record: Record<string, unknown>,
): void => {
  const unsupported = Object.keys(record).filter(
    (field) =>
      ![
        'disposition',
        'justification',
        'knowledgeBaseReceiptPath',
        'planVersion',
      ].includes(field),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `AIDX distill decision has unsupported field(s): ${unsupported.join(', ')}.`,
    );
  }
  if (
    typeof record.planVersion !== 'number' ||
    !Number.isSafeInteger(record.planVersion) ||
    record.planVersion < 1
  ) {
    throw new Error(
      'AIDX distill decision planVersion must be a positive integer.',
    );
  }
  if (
    record.disposition !== 'no-durable-lesson' &&
    record.disposition !== 'new-primary' &&
    record.disposition !== 'update-existing'
  ) {
    throw new Error('AIDX distill decision disposition is invalid.');
  }
};

const parseDistillDecision = async (
  path: string,
): Promise<AidxDistillDecision> => {
  const record = await distillDecisionRecord(path);
  validateDistillDecisionShape(record);
  validateDistillDecisionBranch(record);
  return {
    disposition: record.disposition as AidxDistillDecision['disposition'],
    justification: record.justification as string | undefined,
    knowledgeBaseReceiptPath: record.knowledgeBaseReceiptPath as
      | string
      | undefined,
    planVersion: record.planVersion as number,
  };
};

export const writeExclusiveFile = async (
  path: string,
  content: string,
  writer: typeof writeFile = writeFile,
): Promise<boolean> => {
  try {
    await writer(path, content, { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    return false;
  }
};

const batchableEvents = new Set<AidxEvent>([
  'inspect_context',
  'questions_ready',
  'questions_complete',
  'answers_received',
  'plan_ready',
  'revise_plan',
]);

const applyTransitions = (
  content: string,
  steps: readonly TransitionStep[],
  now: string,
): {
  readonly content: string;
  readonly transitions: readonly AppliedTransition[];
} => {
  if (steps.length > 1 && isAidxTransitionBatchAlreadyApplied(content, steps)) {
    const current = parseAidxGoal(content);
    return {
      content,
      transitions: steps.map((step) => ({
        event: step.event,
        nextState: current.metadata.status,
        previousState: current.metadata.status,
        status: 'already-applied',
      })),
    };
  }
  let current = content;
  const transitions: AppliedTransition[] = [];
  for (const step of steps) {
    const before = parseAidxGoal(current);
    if (isAidxTransitionAlreadyApplied(current, step.event, step.evidence)) {
      transitions.push({
        event: step.event,
        nextState: before.metadata.status,
        previousState: before.metadata.status,
        status: 'already-applied',
      });
      continue;
    }
    current = transitionAidxGoal(current, step.event, step.evidence, now);
    const after = parseAidxGoal(current);
    transitions.push({
      event: step.event,
      nextState: after.metadata.status,
      previousState: before.metadata.status,
      status: 'applied',
    });
  }
  return { content: current, transitions };
};

const goalMatchesRequest = (
  document: AidxGoalDocument,
  request: ValidatedAidxInitRequest,
): boolean =>
  document.metadata.id === request.id &&
  document.metadata.cbmIndex === request.cbmIndex &&
  document.metadata.projectRoot === request.projectRoot &&
  document.body.startsWith(`# Goal\n\n${request.goal}`);

const stateReceipt = (
  path: string,
  document: AidxGoalDocument,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...extra,
  currentState: document.metadata.status,
  legalNextEvents: legalAidxEvents(document.metadata.status),
  nextAction: nextAidxAction(document.metadata.status),
  nextState: document.metadata.status,
  path,
});

const canonicalInitFields = [
  'id',
  'goal',
  'cbmIndex',
  'projectRoot',
  'initialContext',
  'concerns',
  'requestedOutcome',
] as const;

const legacyInitFieldNames: Readonly<Record<string, string>> = {
  cbm_index: 'cbmIndex',
  initial_context: 'initialContext',
  project_root: 'projectRoot',
  requested_outcome: 'requestedOutcome',
};

const optionalInitConcerns = (
  request: AidxInitRequest,
): readonly string[] | undefined => {
  const value = request.concerns;
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.some((concern) => typeof concern !== 'string' || !concern.trim())
  ) {
    throw new Error(
      'AIDX init field "concerns" must be an array of non-empty strings when provided.',
    );
  }
  return value.map((concern) => concern.trim());
};

const optionalInitText = (
  request: AidxInitRequest,
  field: string,
): string | undefined => {
  const value = request[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `AIDX init field "${field}" must be a non-empty string when provided.`,
    );
  }
  return value.trim();
};

const parseCanonicalInitRequest = (value: unknown): AidxInitRequest => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `AIDX init request must be a JSON object with canonical fields: ${canonicalInitFields.join(', ')}.`,
    );
  }
  const request = value as AidxInitRequest;
  const unsupportedFields = Object.keys(request).filter(
    (field) =>
      !canonicalInitFields.includes(
        field as (typeof canonicalInitFields)[number],
      ),
  );
  if (unsupportedFields.length > 0) {
    const fieldHints = unsupportedFields
      .map((field) => {
        const canonicalField = legacyInitFieldNames[field];
        return canonicalField ? `${field} (use ${canonicalField})` : field;
      })
      .join(', ');
    throw new Error(
      `AIDX init request has unsupported field(s): ${fieldHints}. Use only canonical fields: ${canonicalInitFields.join(', ')}.`,
    );
  }
  return request;
};

const requiredInitText = (request: AidxInitRequest, field: string): string => {
  const value = request[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`AIDX init field "${field}" must be a non-empty string.`);
  }
  return value.trim();
};

const transitionReceipt = (
  path: string,
  content: string,
  transitions: readonly AppliedTransition[],
): Record<string, unknown> => {
  const document = parseAidxGoal(content);
  return stateReceipt(path, document, {
    applied: transitions,
    event: transitions.length === 1 ? transitions[0]?.event : undefined,
    status: transitions.every((item) => item.status === 'already-applied')
      ? 'already-applied'
      : 'updated',
  });
};

const updateGoal = async (
  path: string,
  transform: (content: string) => string,
): Promise<ReturnType<typeof parseAidxGoal>> => {
  const current = await readFile(path, 'utf8');
  const next = transform(current);
  await writeFile(path, next, 'utf8');
  return parseAidxGoal(next);
};

export const usage = (): string =>
  [
    'Usage:',
    '  bun <agents-root>/scripts/aidx.ts init <absolute-request-json-path>',
    '  bun <agents-root>/scripts/aidx.ts status <absolute-goal-record-path>',
    '  bun <agents-root>/scripts/aidx.ts validate <absolute-goal-record-path>',
    '  bun <agents-root>/scripts/aidx.ts note <absolute-goal-record-path> <event> <absolute-evidence-path>',
    '  bun <agents-root>/scripts/aidx.ts advance <absolute-goal-record-path> <event> <absolute-evidence-path>',
    '  bun <agents-root>/scripts/aidx.ts advance-batch <absolute-goal-record-path> <absolute-batch-json-path>',
    '  bun <agents-root>/scripts/aidx.ts distill <absolute-goal-record-path> <absolute-distill-decision-json-path>',
    '  bun <agents-root>/scripts/aidx.ts final-gate <absolute-project-root>',
  ].join('\n');

const validatedInitRequest = (
  request: AidxInitRequest,
): ValidatedAidxInitRequest => {
  const id = requiredInitText(request, 'id');
  const goal = requiredInitText(request, 'goal');
  const cbmIndex = requiredInitText(request, 'cbmIndex');
  const projectRoot = requiredInitText(request, 'projectRoot');
  const initialContext = optionalInitText(request, 'initialContext');
  const concerns = optionalInitConcerns(request);
  const requestedOutcome = optionalInitText(request, 'requestedOutcome');
  const contextParts = [
    initialContext,
    concerns?.length
      ? `Concerns:\n${concerns.map((concern) => `- ${concern}`).join('\n')}`
      : undefined,
    requestedOutcome ? `Requested outcome:\n${requestedOutcome}` : undefined,
  ].filter((value): value is string => Boolean(value?.trim()));
  return {
    cbmIndex,
    goal,
    id,
    initialContext: contextParts.join('\n\n') || undefined,
    projectRoot,
  };
};

const writeResult = (write: (message: string) => void, value: object): void =>
  write(JSON.stringify(value, null, 2));

const commandHandlers: Record<
  string,
  (args: readonly string[], write: (message: string) => void) => Promise<void>
> = {
  advance: async (args, write) => {
    if (args.length !== 4) {
      throw new Error(usage());
    }
    const [, first, second, third] = args;
    const path = absolutePath(first, 'goal record path');
    const evidencePath = absolutePath(third, 'evidence path');
    assertGoalPath(path);
    const event = normalizeAidxEvent(second ?? '');
    const evidence = await readEvidence(evidencePath);
    const current = await readFile(path, 'utf8');
    const result = applyTransitions(
      current,
      [{ event, evidence }],
      new Date().toISOString(),
    );
    if (result.transitions.some((item) => item.status === 'applied')) {
      await writeFile(path, result.content, 'utf8');
    }
    writeResult(
      write,
      transitionReceipt(path, result.content, result.transitions),
    );
  },
  'advance-batch': async (args, write) => {
    if (args.length !== 3) {
      throw new Error(usage());
    }
    const path = absolutePath(args[1], 'goal record path');
    const batchPath = absolutePath(args[2], 'batch request path');
    assertGoalPath(path);
    const request = JSON.parse(await readFile(batchPath, 'utf8')) as {
      readonly steps?: readonly unknown[];
    };
    if (!request.steps?.length || request.steps.length > 6) {
      throw new Error('AIDX advance-batch requires 1 to 6 steps.');
    }
    const stepRequests = request.steps.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`AIDX batch step ${index + 1} must be an object.`);
      }
      const item = value as {
        readonly event?: unknown;
        readonly evidencePath?: unknown;
      };
      if (typeof item.event !== 'string') {
        throw new Error(`AIDX batch step ${index + 1} requires an event.`);
      }
      const event = normalizeAidxEvent(item.event);
      if (!batchableEvents.has(event)) {
        throw new Error(
          `AIDX event ${event} cannot be batched; use advance at this boundary.`,
        );
      }
      if (typeof item.evidencePath !== 'string') {
        throw new Error(
          `AIDX batch step ${index + 1} requires evidencePath (camelCase); snake_case evidence_path is not accepted.`,
        );
      }
      return {
        event,
        evidencePath: absolutePath(item.evidencePath, 'evidence path'),
      };
    });
    const steps = await Promise.all(
      stepRequests.map(async ({ event, evidencePath }) => ({
        event,
        evidence: await readEvidence(evidencePath),
      })),
    );
    const current = await readFile(path, 'utf8');
    const result = applyTransitions(current, steps, new Date().toISOString());
    if (result.transitions.some((item) => item.status === 'applied')) {
      await writeFile(path, result.content, 'utf8');
    }
    writeResult(
      write,
      transitionReceipt(path, result.content, result.transitions),
    );
  },
  distill: async (args, write) => {
    if (args.length !== 3) {
      throw new Error(usage());
    }
    const [, first, second] = args;
    const path = absolutePath(first, 'goal record path');
    const decisionPath = absolutePath(second, 'distill decision path');
    assertGoalPath(path);
    const decision = await parseDistillDecision(decisionPath);
    const knowledgeBaseReceipt = decision.knowledgeBaseReceiptPath
      ? await readFile(decision.knowledgeBaseReceiptPath, 'utf8')
      : undefined;
    const next = await updateGoal(path, (content) =>
      finalizeAidxLesson(
        content,
        decision,
        knowledgeBaseReceipt,
        new Date().toISOString(),
      ),
    );
    writeResult(
      write,
      stateReceipt(path, next, {
        disposition: decision.disposition,
        planRemoved: true,
        planVersion: decision.planVersion,
        status: 'updated',
      }),
    );
  },
  'final-gate': async (args, write) => {
    if (args.length !== 2) {
      throw new Error(usage());
    }
    const projectRoot = absolutePath(args[1], 'project root');
    const resolved = await resolveFinalGate(projectRoot);
    const result = executeFinalGate(projectRoot, resolved.command);
    writeResult(write, { ...resolved, ...result });
    if (result.exitCode !== 0) {
      throw new Error(result.receipt);
    }
  },
  init: async (args, write) => {
    if (args.length !== 2) {
      throw new Error(usage());
    }
    const requestPath = absolutePath(args[1], 'request path');
    const request = validatedInitRequest(
      parseCanonicalInitRequest(
        JSON.parse(await readFile(requestPath, 'utf8')) as unknown,
      ),
    );
    const path = goalPathFor(request.id, request.cbmIndex);
    await mkdir(dirname(path), { recursive: true });
    const sessionDirectory = dirname(dirname(path));
    await writeExclusiveFile(
      join(sessionDirectory, 'index.md'),
      sessionMap(request.cbmIndex),
    );
    await writeExclusiveFile(
      join(dirname(path), 'index.md'),
      goalsMap(request.cbmIndex),
    );
    const content = createAidxGoal({
      cbmIndex: request.cbmIndex,
      goal: request.goal,
      id: request.id,
      initialContext: request.initialContext,
      projectRoot: request.projectRoot,
    });
    if (await writeExclusiveFile(path, content)) {
      writeResult(
        write,
        stateReceipt(path, parseAidxGoal(content), {
          id: request.id,
          status: 'created',
        }),
      );
    } else {
      const existing = await readFile(path, 'utf8');
      const document = parseAidxGoal(existing);
      if (!goalMatchesRequest(document, request)) {
        throw new Error(
          `AIDX goal already exists at ${path} for a different request. Resume that goal or choose a new id.`,
        );
      }
      writeResult(
        write,
        stateReceipt(path, document, {
          id: request.id,
          status: 'existing',
        }),
      );
    }
  },
  note: async (args, write) => {
    if (args.length !== 4) {
      throw new Error(usage());
    }
    const [, first, second, third] = args;
    const path = absolutePath(first, 'goal record path');
    const evidencePath = absolutePath(third, 'evidence path');
    assertGoalPath(path);
    const next = await updateGoal(path, (content) =>
      appendAidxNote(
        content,
        second ?? '',
        readEvidenceSync(evidencePath),
        new Date().toISOString(),
      ),
    );
    writeResult(write, stateReceipt(path, next, { status: 'updated' }));
  },
  status: async (args, write) => {
    if (args.length !== 2) {
      throw new Error(usage());
    }
    const path = absolutePath(args[1], 'goal record path');
    assertGoalPath(path);
    const document = parseAidxGoal(await readFile(path, 'utf8'));
    writeResult(
      write,
      stateReceipt(path, document, { metadata: document.metadata }),
    );
  },
  validate: async (args, write) => {
    if (args.length !== 2) {
      throw new Error(usage());
    }
    const path = absolutePath(args[1], 'goal record path');
    assertGoalPath(path);
    const document = parseAidxGoal(await readFile(path, 'utf8'));
    writeResult(
      write,
      stateReceipt(path, document, {
        state: document.metadata.status,
        status: 'valid',
      }),
    );
  },
};

export const run = async (
  args: readonly string[],
  write: (message: string) => void = console.log,
): Promise<void> => {
  const handler = commandHandlers[args[0] ?? ''];
  if (!handler) {
    throw new Error(usage());
  }
  await handler(args, write);
};

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
