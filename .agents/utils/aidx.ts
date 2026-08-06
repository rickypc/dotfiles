import { createHash } from 'node:crypto';
import matter from 'gray-matter';

export type AidxActionKind =
  | 'approval'
  | 'implementation'
  | 'input'
  | 'lesson'
  | 'terminal'
  | 'transition'
  | 'validation';

export interface AidxDistillDecision {
  readonly disposition: Exclude<AidxLessonDisposition, 'pending' | 'blocked'>;
  readonly justification?: string;
  readonly knowledgeBaseReceiptPath?: string;
  readonly planVersion: number;
}

export type AidxEvent = (typeof AIDX_EVENTS)[number];

export interface AidxGoalDocument {
  readonly body: string;
  readonly metadata: AidxGoalMetadata;
}

export interface AidxGoalInput {
  readonly cbmIndex: string;
  readonly goal: string;
  readonly id: string;
  readonly initialContext?: string;
  readonly now?: string;
  readonly projectRoot: string;
}

export interface AidxGoalMetadata {
  readonly approval: 'pending' | 'approved' | 'superseded';
  readonly cbmIndex: string;
  readonly createdAt: string;
  /** Number of persisted lifecycle transitions, not the plan revision. */
  readonly currentStep: number;
  readonly id: string;
  readonly lessonDisposition: AidxLessonDisposition;
  /** Revision of the one active generated plan; zero means no plan exists. */
  readonly planVersion: number;
  readonly projectRoot: string;
  readonly status: AidxState;
  readonly updatedAt: string;
}

export interface AidxKnowledgeBaseConceptReceipt {
  readonly conceptPath: string;
  readonly rootIndexPath: string;
  readonly scopeIndexPath: string;
  readonly subjectIndexPath: string;
}

export interface AidxKnowledgeBaseLinkReceipt {
  readonly from: string;
  readonly to: string;
}

export interface AidxKnowledgeBaseReceipt {
  readonly concepts: readonly AidxKnowledgeBaseConceptReceipt[];
  readonly links: readonly AidxKnowledgeBaseLinkReceipt[];
}

export type AidxLessonDisposition = (typeof AIDX_LESSON_DISPOSITIONS)[number];

export interface AidxNextAction {
  readonly events: readonly AidxEvent[];
  readonly kind: AidxActionKind;
  readonly summary: string;
}

export type AidxState = (typeof AIDX_STATES)[number];

export const AIDX_EVENTS = [
  'inspect_context',
  'questions_ready',
  'questions_complete',
  'answers_received',
  'plan_ready',
  'revise_plan',
  'approve_plan',
  'implementation_complete',
  'scope_changed',
  'test_failed',
  'tests_passed',
  'repair_complete',
  'lesson_complete',
  'blocked',
  'deferred',
] as const;

export const AIDX_STATES = [
  'CAPTURE_GOAL',
  'INSPECT_CONTEXT',
  'ASK_QUESTIONS',
  'GENERATE_PLAN',
  'APPROVE_REVISE',
  'EXECUTE_PLAN',
  'TEST',
  'REPAIR',
  'DISTILL_LESSON',
  'DONE',
  'BLOCKED',
  'DEFERRED',
] as const;

export const AIDX_LESSON_DISPOSITIONS = [
  'pending',
  'no-durable-lesson',
  'new-primary',
  'update-existing',
  'blocked',
] as const;

const transitions: Readonly<
  Record<AidxState, Readonly<Partial<Record<AidxEvent, AidxState>>>>
> = {
  APPROVE_REVISE: {
    approve_plan: 'EXECUTE_PLAN',
    revise_plan: 'GENERATE_PLAN',
  },
  ASK_QUESTIONS: {
    answers_received: 'ASK_QUESTIONS',
    questions_complete: 'GENERATE_PLAN',
  },
  BLOCKED: {},
  CAPTURE_GOAL: { inspect_context: 'INSPECT_CONTEXT' },
  DEFERRED: {},
  DISTILL_LESSON: { lesson_complete: 'DONE' },
  DONE: {},
  EXECUTE_PLAN: {
    implementation_complete: 'TEST',
    scope_changed: 'GENERATE_PLAN',
  },
  GENERATE_PLAN: { plan_ready: 'APPROVE_REVISE' },
  INSPECT_CONTEXT: { questions_ready: 'ASK_QUESTIONS' },
  REPAIR: {
    repair_complete: 'TEST',
    scope_changed: 'GENERATE_PLAN',
  },
  TEST: {
    test_failed: 'REPAIR',
    tests_passed: 'DISTILL_LESSON',
  },
};

const nonTerminalStates = new Set<AidxState>([
  'APPROVE_REVISE',
  'ASK_QUESTIONS',
  'CAPTURE_GOAL',
  'DISTILL_LESSON',
  'EXECUTE_PLAN',
  'GENERATE_PLAN',
  'INSPECT_CONTEXT',
  'REPAIR',
  'TEST',
]);

const stateActions: Readonly<Record<AidxState, AidxNextAction>> = {
  APPROVE_REVISE: {
    events: ['approve_plan', 'revise_plan'],
    kind: 'approval',
    summary: 'Wait for explicit plan approval or revision feedback.',
  },
  ASK_QUESTIONS: {
    events: ['answers_received', 'questions_complete'],
    kind: 'input',
    summary:
      'Record the answer, reassess completeness, and keep asking until no material gap remains.',
  },
  BLOCKED: {
    events: [],
    kind: 'terminal',
    summary: 'Resolve the blocker before resuming.',
  },
  CAPTURE_GOAL: {
    events: ['inspect_context'],
    kind: 'transition',
    summary: 'Inspect the selected repository and applicable instructions.',
  },
  DEFERRED: {
    events: [],
    kind: 'terminal',
    summary: 'Resume only when the deferred condition changes.',
  },
  DISTILL_LESSON: {
    events: ['lesson_complete'],
    kind: 'lesson',
    summary: 'Record a verified lesson disposition, then close the goal.',
  },
  DONE: { events: [], kind: 'terminal', summary: 'Goal complete.' },
  EXECUTE_PLAN: {
    events: ['implementation_complete', 'scope_changed'],
    kind: 'implementation',
    summary: 'Execute the approved plan or stop and re-plan if scope changes.',
  },
  GENERATE_PLAN: {
    events: ['plan_ready'],
    kind: 'transition',
    summary: 'Write the complete implementation plan and its proof mapping.',
  },
  INSPECT_CONTEXT: {
    events: ['questions_ready'],
    kind: 'transition',
    summary: 'Record inspection evidence and prepare the concise question set.',
  },
  REPAIR: {
    events: ['repair_complete', 'scope_changed'],
    kind: 'implementation',
    summary: 'Repair only the approved boundary, then rerun the failed proof.',
  },
  TEST: {
    events: ['test_failed', 'tests_passed'],
    kind: 'validation',
    summary: 'Run the focused and final validation gates.',
  },
};

const approvedStates = new Set<AidxState>([
  'EXECUTE_PLAN',
  'TEST',
  'REPAIR',
  'DISTILL_LESSON',
  'DONE',
]);

const plannedStates = new Set<AidxState>([
  'APPROVE_REVISE',
  'EXECUTE_PLAN',
  'GENERATE_PLAN',
  'REPAIR',
  'TEST',
]);

const validationStates = new Set<AidxState>([
  'REPAIR',
  'TEST',
  'DISTILL_LESSON',
  'DONE',
]);

const replanEvents = new Set<AidxEvent>(['revise_plan', 'scope_changed']);

export const legalAidxEvents = (current: AidxState): readonly AidxEvent[] => [
  ...stateActions[current].events,
  ...(nonTerminalStates.has(current) ? (['blocked', 'deferred'] as const) : []),
];

export const nextAidxAction = (state: AidxState): AidxNextAction =>
  stateActions[state];

const eventAliases: Readonly<Record<string, AidxEvent>> = {
  inspected_context: 'inspect_context',
};

const activePlanSection = (body: string): string => {
  const match = body.match(/^## Plan v[1-9][0-9]*$[\s\S]*?(?=^## Approval$)/mu);
  return match?.[0]?.trimEnd() ?? '';
};

const allowedPlanVersionsFor = (
  metadata: AidxGoalMetadata,
): readonly number[] =>
  metadata.status === 'GENERATE_PLAN'
    ? [metadata.planVersion, metadata.planVersion + 1].filter(
        (version) => version > 0,
      )
    : metadata.status === 'ASK_QUESTIONS' && metadata.planVersion === 0
      ? [1]
      : [metadata.planVersion];

const auditEntries = (
  body: string,
): readonly { readonly event: string; readonly evidence: string }[] => {
  const starts = [...body.matchAll(/^- \d{4}-\d{2}-\d{2}T[^\n]* — /gmu)];
  return starts.flatMap((match, index) => {
    const start = match.index ?? 0;
    const nextStart = starts[index + 1]?.index ?? body.length;
    const value = body.slice(start, nextStart).trim();
    const firstSeparator = value.indexOf(' — ');
    const secondSeparator = value.indexOf(' — ', firstSeparator + 3);
    if (firstSeparator < 0 || secondSeparator < 0) {
      return [];
    }
    return [
      {
        event: value.slice(firstSeparator + 3, secondSeparator),
        evidence: value.slice(secondSeparator + 3).trim(),
      },
    ];
  });
};

const bodyWithAudit = (
  body: string,
  event: string,
  evidence: string,
  now: string,
): string => {
  const auditLine = `- ${now} — ${event} — ${evidence.trim()}`;
  return body.includes('## Audit')
    ? `${body.trimEnd()}\n${auditLine}\n`
    : `${body.trimEnd()}\n\n## Audit\n\n${auditLine}\n`;
};

const dataFor = (metadata: AidxGoalMetadata): Record<string, unknown> => ({
  approval: metadata.approval,
  cbm_index: metadata.cbmIndex,
  created_at: metadata.createdAt,
  current_step: metadata.currentStep,
  id: metadata.id,
  lesson_disposition: metadata.lessonDisposition,
  plan_version: metadata.planVersion,
  project_root: metadata.projectRoot,
  status: metadata.status,
  updated_at: metadata.updatedAt,
});

const integerField = (data: Record<string, unknown>, key: string): number => {
  const value = data[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`AIDX metadata field is invalid: ${key}.`);
  }
  return value;
};

const isAidxState = (value: unknown): value is AidxState =>
  typeof value === 'string' &&
  (AIDX_STATES as readonly string[]).includes(value);

export const isAidxTerminal = (state: AidxState): boolean =>
  state === 'DONE' || state === 'BLOCKED' || state === 'DEFERRED';

const lessonBody = (
  body: string,
  disposition: Exclude<AidxLessonDisposition, 'pending' | 'blocked'>,
  evidence: string,
): string => {
  const next = body.replace(
    /## Lesson\n\n- Disposition: pending\n(?:- Evidence: pending\n)?/u,
    `## Lesson\n\n- Disposition: ${disposition}\n- Evidence: ${evidence.trim()}\n`,
  );
  if (next === body) {
    throw new Error('AIDX lesson section is not in its pending form.');
  }
  return next;
};

export const normalizeAidxEvent = (value: string): AidxEvent => {
  const normalized = value.trim().toLowerCase().replaceAll('-', '_');
  const event = eventAliases[normalized] ?? normalized;
  if (!(AIDX_EVENTS as readonly string[]).includes(event)) {
    throw new Error(
      `Unknown AIDX event: ${value}. Use one of: ${AIDX_EVENTS.join(', ')}.`,
    );
  }
  return event as AidxEvent;
};

const parseKnowledgeBaseReceipt = (value: string): AidxKnowledgeBaseReceipt => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('AIDX knowledge-base receipt must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AIDX knowledge-base receipt must be an object.');
  }
  const record = parsed as Record<string, unknown>;
  const concepts = record.concepts;
  const links = record.links;
  if (!Array.isArray(concepts) || concepts.length === 0) {
    throw new Error('AIDX knowledge-base receipt requires concepts.');
  }
  if (!Array.isArray(links)) {
    throw new Error('AIDX knowledge-base receipt requires links.');
  }
  const conceptReceipts = concepts.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `AIDX knowledge-base concept receipt ${index + 1} must be an object.`,
      );
    }
    const concept = value as Record<string, unknown>;
    const fields = [
      'conceptPath',
      'rootIndexPath',
      'scopeIndexPath',
      'subjectIndexPath',
    ];
    for (const field of fields) {
      if (typeof concept[field] !== 'string' || !concept[field].trim()) {
        throw new Error(
          `AIDX knowledge-base concept receipt requires ${field}.`,
        );
      }
    }
    return {
      conceptPath: concept.conceptPath as string,
      rootIndexPath: concept.rootIndexPath as string,
      scopeIndexPath: concept.scopeIndexPath as string,
      subjectIndexPath: concept.subjectIndexPath as string,
    };
  });
  const linkReceipts = links.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `AIDX knowledge-base link receipt ${index + 1} must be an object.`,
      );
    }
    const link = value as Record<string, unknown>;
    if (
      typeof link.from !== 'string' ||
      !link.from.trim() ||
      typeof link.to !== 'string' ||
      !link.to.trim()
    ) {
      throw new Error('AIDX knowledge-base link receipt requires from and to.');
    }
    return { from: link.from, to: link.to };
  });
  return { concepts: conceptReceipts, links: linkReceipts };
};

const planHeadingVersions = (body: string): readonly number[] =>
  [...body.matchAll(/^## Plan v([1-9][0-9]*)$/gmu)].map((match) =>
    Number.parseInt(match[1] ?? '', 10),
  );

const removeActivePlan = (body: string): string => {
  return body.replace(/^## Plan v[1-9][0-9]*$[\s\S]*?(?=^## Approval$)/mu, '');
};

const render = (metadata: AidxGoalMetadata, body: string): string =>
  matter.stringify(`${body.trimEnd()}\n`, dataFor(metadata));

export const createAidxGoal = (input: AidxGoalInput): string => {
  if (!input.id.trim() || !input.goal.trim() || !input.cbmIndex.trim()) {
    throw new Error('AIDX goal id, CBM index, and goal are required.');
  }
  if (!input.projectRoot.startsWith('/')) {
    throw new Error('AIDX project root must be absolute.');
  }
  const now = input.now ?? new Date().toISOString();
  const metadata: AidxGoalMetadata = {
    approval: 'pending',
    cbmIndex: input.cbmIndex,
    createdAt: now,
    currentStep: 0,
    id: input.id,
    lessonDisposition: 'pending',
    planVersion: 0,
    projectRoot: input.projectRoot,
    status: 'CAPTURE_GOAL',
    updatedAt: now,
  };
  const body = [
    '# Goal',
    '',
    input.goal.trim(),
    '',
    '## Initial Context',
    '',
    input.initialContext?.trim() || 'No additional context supplied.',
    '',
    '## Inspection Evidence',
    '',
    'Pending.',
    '',
    '## Questions and Answers',
    '',
    'Pending.',
    '',
    '## Decisions and Exclusions',
    '',
    'Pending.',
    '',
    '## Approval',
    '',
    '- Status: pending',
    '',
    '## Execution Evidence',
    '',
    'Pending.',
    '',
    '## Validation',
    '',
    'Pending.',
    '',
    '## Lesson',
    '',
    '- Disposition: pending',
    '',
    '## Audit',
    '',
    `- ${now} — CAPTURE_GOAL — record created`,
  ].join('\n');
  return render(metadata, body);
};

const stringField = (data: Record<string, unknown>, key: string): string => {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`AIDX metadata field is invalid: ${key}.`);
  }
  return value;
};

const metadataFor = (data: Record<string, unknown>): AidxGoalMetadata => {
  const statusValue = stringField(data, 'status');
  if (!isAidxState(statusValue)) {
    throw new Error(`AIDX metadata state is invalid: ${statusValue}.`);
  }
  const approval = stringField(data, 'approval');
  if (!['pending', 'approved', 'superseded'].includes(approval)) {
    throw new Error(`AIDX metadata approval is invalid: ${approval}.`);
  }
  const lessonDisposition = stringField(data, 'lesson_disposition');
  if (
    !(AIDX_LESSON_DISPOSITIONS as readonly string[]).includes(lessonDisposition)
  ) {
    throw new Error(
      `AIDX metadata lesson disposition is invalid: ${lessonDisposition}.`,
    );
  }
  const projectRoot = stringField(data, 'project_root');
  if (!projectRoot.startsWith('/')) {
    throw new Error('AIDX project_root must be absolute.');
  }
  return {
    approval: approval as AidxGoalMetadata['approval'],
    cbmIndex: stringField(data, 'cbm_index'),
    createdAt: stringField(data, 'created_at'),
    currentStep: integerField(data, 'current_step'),
    id: stringField(data, 'id'),
    lessonDisposition: lessonDisposition as AidxLessonDisposition,
    planVersion: integerField(data, 'plan_version'),
    projectRoot,
    status: statusValue,
    updatedAt: stringField(data, 'updated_at'),
  };
};

export const transitionAidxState = (
  current: AidxState,
  event: AidxEvent,
): AidxState => {
  if (event === 'blocked' || event === 'deferred') {
    if (!nonTerminalStates.has(current)) {
      throw new Error(`Cannot ${event} a terminal AIDX state: ${current}.`);
    }
    return event === 'blocked' ? 'BLOCKED' : 'DEFERRED';
  }
  const next = transitions[current][event];
  if (!next) {
    throw new Error(
      `Illegal AIDX transition: ${current} -> ${event}. Expected one of: ${legalAidxEvents(current).join(', ') || 'none'}.`,
    );
  }
  return next;
};

const validateDistillDecision = (
  decision: AidxDistillDecision,
  knowledgeBaseReceipt: string | undefined,
): void => {
  if (decision.disposition === 'no-durable-lesson') {
    if (!decision.justification?.trim()) {
      throw new Error(
        'AIDX no-durable-lesson decisions require a non-empty justification.',
      );
    }
    if (knowledgeBaseReceipt) {
      throw new Error(
        'AIDX no-durable-lesson decisions must not include a knowledge-base receipt.',
      );
    }
    return;
  }
  if (!knowledgeBaseReceipt) {
    throw new Error(
      'AIDX durable lesson decisions require a knowledge-base receipt.',
    );
  }
  parseKnowledgeBaseReceipt(knowledgeBaseReceipt);
};

const validateMissingPlan = (metadata: AidxGoalMetadata): void => {
  if (
    (metadata.status === 'DISTILL_LESSON' || metadata.status === 'DONE') &&
    metadata.lessonDisposition !== 'pending'
  ) {
    return;
  }
  if (metadata.status === 'DISTILL_LESSON') {
    throw new Error(
      'AIDX DISTILL_LESSON requires the active Plan until finalization.',
    );
  }
  if (plannedStates.has(metadata.status)) {
    throw new Error('AIDX planned states require a Plan section.');
  }
  if (metadata.planVersion > 0) {
    throw new Error('AIDX plan metadata requires an active Plan heading.');
  }
};

const validatePlanVersion = (
  metadata: AidxGoalMetadata,
  body: string,
): void => {
  const versions = planHeadingVersions(body);
  if (versions.length === 0) {
    validateMissingPlan(metadata);
    return;
  }
  if (versions.length !== 1) {
    throw new Error(
      'AIDX goal records require exactly one active Plan heading.',
    );
  }
  const activeVersion = versions[0] ?? 0;
  if (
    (metadata.status === 'DISTILL_LESSON' || metadata.status === 'DONE') &&
    metadata.lessonDisposition !== 'pending'
  ) {
    throw new Error(
      'AIDX finalized lesson records must not retain a Plan section.',
    );
  }
  if (!allowedPlanVersionsFor(metadata).includes(activeVersion)) {
    throw new Error(
      `AIDX Plan heading v${activeVersion} does not match persisted plan_version ${metadata.planVersion}.`,
    );
  }
};

export const parseAidxGoal = (content: string): AidxGoalDocument => {
  if (!matter.test(content)) {
    throw new Error('AIDX goal record front matter is required.');
  }
  const parsed = matter(content);
  const metadata = metadataFor(parsed.data as Record<string, unknown>);
  const body = parsed.content.trimEnd();
  validatePlanVersion(metadata, body);
  if (
    validationStates.has(metadata.status) &&
    !body.includes('## Validation')
  ) {
    throw new Error('AIDX validation states require a Validation section.');
  }
  if (approvedStates.has(metadata.status) && metadata.approval !== 'approved') {
    throw new Error('AIDX execution states require approved plan metadata.');
  }
  if (metadata.status === 'DONE' && metadata.lessonDisposition === 'pending') {
    throw new Error('AIDX DONE requires a lesson disposition.');
  }
  return { body, metadata };
};

export const appendAidxNote = (
  content: string,
  event: string,
  evidence: string,
  now: string,
): string => {
  if (!event.trim() || !evidence.trim()) {
    throw new Error('AIDX notes require an event and evidence.');
  }
  const document = parseAidxGoal(content);
  return render(
    document.metadata,
    bodyWithAudit(document.body, event, evidence, now),
  );
};

export const finalizeAidxLesson = (
  content: string,
  decision: AidxDistillDecision,
  knowledgeBaseReceipt: string | undefined,
  now: string,
): string => {
  const document = parseAidxGoal(content);
  if (document.metadata.status !== 'DISTILL_LESSON') {
    throw new Error('AIDX finalization can only run during DISTILL_LESSON.');
  }
  if (
    !Number.isSafeInteger(decision.planVersion) ||
    decision.planVersion < 1 ||
    decision.planVersion !== document.metadata.planVersion
  ) {
    throw new Error(
      `AIDX finalization requires the current Plan v${document.metadata.planVersion}.`,
    );
  }
  const plan = activePlanSection(document.body);
  const planDigest = createHash('sha256').update(plan).digest('hex');
  validateDistillDecision(decision, knowledgeBaseReceipt);
  const evidence =
    decision.disposition === 'no-durable-lesson'
      ? `original Plan v${decision.planVersion} reviewed; no durable lesson retained; plan digest: ${planDigest}; justification: ${decision.justification?.trim()}`
      : `original Plan v${decision.planVersion} reviewed; delegated knowledge-base receipt validated; plan digest: ${planDigest}`;
  const withoutPlan = removeActivePlan(document.body);
  const withLesson = lessonBody(withoutPlan, decision.disposition, evidence);
  return render(
    {
      ...document.metadata,
      lessonDisposition: decision.disposition,
      updatedAt: now,
    },
    bodyWithAudit(withLesson, 'lesson_finalized', evidence, now),
  );
};

export const isAidxTransitionAlreadyApplied = (
  content: string,
  event: AidxEvent,
  evidence: string,
): boolean => {
  const document = parseAidxGoal(content);
  const audit = auditEntries(document.body).at(-1);
  return audit?.event === event && audit.evidence === evidence.trim();
};

export const isAidxTransitionBatchAlreadyApplied = (
  content: string,
  steps: readonly { readonly event: AidxEvent; readonly evidence: string }[],
): boolean => {
  const document = parseAidxGoal(content);
  const audits = auditEntries(document.body).slice(-steps.length);
  return (
    audits.length === steps.length &&
    steps.every(
      (step, index) =>
        audits[index]?.event === step.event &&
        audits[index]?.evidence === step.evidence.trim(),
    )
  );
};

export const transitionAidxGoal = (
  content: string,
  event: AidxEvent,
  evidence: string,
  now: string,
): string => {
  if (!evidence.trim()) {
    throw new Error('AIDX transitions require factual evidence.');
  }
  const document = parseAidxGoal(content);
  const nextStatus = transitionAidxState(document.metadata.status, event);
  const validateLesson = (): void => {
    if (
      event === 'lesson_complete' &&
      document.metadata.lessonDisposition === 'pending'
    ) {
      throw new Error('AIDX lesson disposition must be recorded before DONE.');
    }
  };
  const validatePlanReady = (): void => {
    if (event === 'plan_ready') {
      const versions = planHeadingVersions(document.body);
      const expectedVersion = document.metadata.planVersion + 1;
      if (versions.length !== 1 || versions[0] !== expectedVersion) {
        throw new Error(
          `AIDX plan_ready requires exactly one newly generated Plan v${expectedVersion} heading.`,
        );
      }
    }
  };
  validateLesson();
  validatePlanReady();
  const planVersion =
    event === 'plan_ready'
      ? document.metadata.planVersion + 1
      : document.metadata.planVersion;
  const approval =
    event === 'approve_plan'
      ? 'approved'
      : replanEvents.has(event)
        ? 'pending'
        : document.metadata.approval;
  return render(
    {
      ...document.metadata,
      approval,
      currentStep: document.metadata.currentStep + 1,
      planVersion,
      status: nextStatus,
      updatedAt: now,
    },
    bodyWithAudit(document.body, event, evidence, now),
  );
};
