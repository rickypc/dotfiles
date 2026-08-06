import matter from 'gray-matter';

export type AidxEvent =
  | 'inspect_context'
  | 'questions_ready'
  | 'questions_complete'
  | 'answers_received'
  | 'plan_ready'
  | 'revise_plan'
  | 'approve_plan'
  | 'implementation_complete'
  | 'scope_changed'
  | 'test_failed'
  | 'tests_passed'
  | 'repair_complete'
  | 'lesson_complete'
  | 'blocked'
  | 'deferred';

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
  readonly currentStep: number;
  readonly id: string;
  readonly lessonDisposition: AidxLessonDisposition;
  readonly planVersion: number;
  readonly projectRoot: string;
  readonly status: AidxState;
  readonly updatedAt: string;
}

export type AidxLessonDisposition = (typeof AIDX_LESSON_DISPOSITIONS)[number];

export type AidxState = (typeof AIDX_STATES)[number];

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
    answers_received: 'GENERATE_PLAN',
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
  'DISTILL_LESSON',
  'DONE',
]);

const validationStates = new Set<AidxState>([
  'REPAIR',
  'TEST',
  'DISTILL_LESSON',
  'DONE',
]);

const planEvents = new Set<AidxEvent>([
  'plan_ready',
  'revise_plan',
  'scope_changed',
]);

const replanEvents = new Set<AidxEvent>(['revise_plan', 'scope_changed']);

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

export const parseAidxGoal = (content: string): AidxGoalDocument => {
  if (!matter.test(content)) {
    throw new Error('AIDX goal record front matter is required.');
  }
  const parsed = matter(content);
  const metadata = metadataFor(parsed.data as Record<string, unknown>);
  const body = parsed.content.trimEnd();
  if (plannedStates.has(metadata.status) && !body.includes('## Plan v')) {
    throw new Error('AIDX planned states require a Plan section.');
  }
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

export const setAidxLesson = (
  content: string,
  disposition: AidxLessonDisposition,
  evidence: string,
  now: string,
): string => {
  const document = parseAidxGoal(content);
  if (document.metadata.status !== 'DISTILL_LESSON') {
    throw new Error('AIDX lessons can only be recorded during DISTILL_LESSON.');
  }
  if (disposition === 'pending' || !evidence.trim()) {
    throw new Error('AIDX lesson disposition and evidence are required.');
  }
  return render(
    { ...document.metadata, lessonDisposition: disposition, updatedAt: now },
    bodyWithAudit(document.body, 'lesson_recorded', evidence, now),
  );
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
    throw new Error(`Illegal AIDX transition: ${current} -> ${event}.`);
  }
  return next;
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
  if (event === 'approve_plan' && document.metadata.planVersion < 1) {
    throw new Error('AIDX approval requires a generated plan.');
  }
  if (
    event === 'lesson_complete' &&
    document.metadata.lessonDisposition === 'pending'
  ) {
    throw new Error('AIDX lesson disposition must be recorded before DONE.');
  }
  const planVersion = planEvents.has(event)
    ? Math.max(1, document.metadata.planVersion + 1)
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
