import { expect, test } from 'bun:test';
import matter from 'gray-matter';

import {
  appendAidxNote,
  createAidxGoal,
  finalizeAidxLesson,
  isAidxTerminal,
  isAidxTransitionAlreadyApplied,
  legalAidxEvents,
  nextAidxAction,
  normalizeAidxEvent,
  parseAidxGoal,
  transitionAidxGoal,
  transitionAidxState,
} from '../../utils/aidx.js';

const now = '2026-08-05T00:00:00.000Z';

const goal = (): string =>
  createAidxGoal({
    cbmIndex: 'demo',
    goal: 'Implement the selected behavior.',
    id: 'demo-goal',
    initialContext: 'The user supplied a short concern list.',
    now,
    projectRoot: '/tmp/demo',
  });

const withMetadata = (
  content: string,
  overrides: Record<string, unknown>,
): string => {
  const parsed = matter(content);
  return matter.stringify(parsed.content, { ...parsed.data, ...overrides });
};

const withPlan = (content: string, version = 1): string => {
  const plan = `## Plan v${version}\n\n### Steps\n\n1. [ ] Implement and test.\n\n`;
  return /^## Plan v[1-9][0-9]*$/mu.test(content)
    ? content.replace(/^## Plan v[1-9][0-9]*$[\s\S]*?(?=^## Approval$)/mu, plan)
    : content.replace('## Approval', `${plan}## Approval`);
};

const distillableGoal = (): string =>
  withMetadata(withPlan(goal()), {
    approval: 'approved',
    plan_version: 1,
    status: 'DISTILL_LESSON',
  });

const withValidation = (content: string): string =>
  content.replace('## Validation', '## Validation\n\n- Pending proof.');

test('creates and parses a resumable goal record', () => {
  const document = parseAidxGoal(goal());
  expect(document.metadata.status).toBe('CAPTURE_GOAL');
  expect(document.metadata.planVersion).toBe(0);
  expect(document.body).toContain('Implement the selected behavior.');
});

test('exposes canonical next actions and makes exact transition retries safe', () => {
  let content = goal();
  content = transitionAidxGoal(content, 'inspect_context', 'inspected', now);
  expect(normalizeAidxEvent('inspected-context')).toBe('inspect_context');
  expect(normalizeAidxEvent('questions-ready')).toBe('questions_ready');
  expect(() => normalizeAidxEvent('not-an-event')).toThrow(
    'Unknown AIDX event',
  );
  expect(legalAidxEvents('INSPECT_CONTEXT')).toEqual([
    'questions_ready',
    'blocked',
    'deferred',
  ]);
  expect(nextAidxAction('INSPECT_CONTEXT')).toMatchObject({
    events: ['questions_ready'],
    kind: 'transition',
  });
  expect(
    isAidxTransitionAlreadyApplied(content, 'inspect_context', 'inspected'),
  ).toBe(true);
  expect(
    isAidxTransitionAlreadyApplied(content, 'inspect_context', 'different'),
  ).toBe(false);
  expect(
    isAidxTransitionAlreadyApplied(
      `${goal()}\n- 2026-08-05T00:00:00.000Z — malformed`,
      'inspect_context',
      'inspected',
    ),
  ).toBe(false);
});

test('enforces the complete goal transition path', () => {
  let content = goal();
  content = transitionAidxGoal(content, 'inspect_context', 'inspected', now);
  content = transitionAidxGoal(
    content,
    'questions_ready',
    'questions ready',
    now,
  );
  content = appendAidxNote(content, 'awaiting_answers', 'none needed', now);
  content = transitionAidxGoal(content, 'questions_complete', 'complete', now);
  content = withPlan(content, 1);
  content = transitionAidxGoal(content, 'plan_ready', 'plan generated', now);
  content = transitionAidxGoal(
    content,
    'revise_plan',
    'user requested revision',
    now,
  );
  content = withPlan(content, 2);
  content = transitionAidxGoal(
    content,
    'plan_ready',
    'revised plan generated',
    now,
  );
  content = transitionAidxGoal(
    content,
    'approve_plan',
    'user approved plan',
    now,
  );
  content = withValidation(content);
  content = transitionAidxGoal(
    content,
    'implementation_complete',
    'changes made',
    now,
  );
  content = transitionAidxGoal(
    content,
    'test_failed',
    'focused test failed',
    now,
  );
  content = transitionAidxGoal(
    content,
    'repair_complete',
    'repair applied',
    now,
  );
  content = transitionAidxGoal(content, 'tests_passed', 'tests passed', now);
  content = finalizeAidxLesson(
    content,
    {
      disposition: 'no-durable-lesson',
      justification: 'no verified durable lesson',
      planVersion: 2,
    },
    undefined,
    now,
  );
  content = transitionAidxGoal(
    content,
    'lesson_complete',
    'closeout complete',
    now,
  );
  expect(parseAidxGoal(content).metadata).toMatchObject({
    currentStep: 12,
    planVersion: 2,
    status: 'DONE',
  });
});

test('finalizes a durable lesson only with a delegated receipt and removes the plan', () => {
  const receipt = JSON.stringify({
    concepts: [
      {
        conceptPath: 'demo/subject/lesson.md',
        rootIndexPath: 'index.md',
        scopeIndexPath: 'demo/index.md',
        subjectIndexPath: 'demo/subject/index.md',
      },
    ],
    links: [{ from: 'demo/subject/lesson.md', to: 'demo/subject/index.md' }],
  });
  const finalized = finalizeAidxLesson(
    distillableGoal(),
    {
      disposition: 'new-primary',
      planVersion: 1,
    },
    receipt,
    now,
  );
  const document = parseAidxGoal(finalized);
  expect(document.metadata.lessonDisposition).toBe('new-primary');
  expect(document.body).not.toContain('## Plan v1');
  expect(document.body).toContain('lesson_finalized');
  expect(() =>
    finalizeAidxLesson(
      distillableGoal(),
      { disposition: 'update-existing', planVersion: 1 },
      undefined,
      now,
    ),
  ).toThrow('require a knowledge-base receipt');
  expect(() =>
    finalizeAidxLesson(
      distillableGoal(),
      {
        disposition: 'no-durable-lesson',
        justification: 'not durable',
        planVersion: 1,
      },
      JSON.stringify({ concepts: [], links: [] }),
      now,
    ),
  ).toThrow('must not include a knowledge-base receipt');
  expect(() =>
    finalizeAidxLesson(
      distillableGoal(),
      { disposition: 'new-primary', planVersion: 2 },
      receipt,
      now,
    ),
  ).toThrow('current Plan v1');
  expect(() =>
    finalizeAidxLesson(
      distillableGoal(),
      { disposition: 'new-primary', planVersion: 1 },
      JSON.stringify({ concepts: [], links: [] }),
      now,
    ),
  ).toThrow('requires concepts');
  expect(distillableGoal()).toContain('## Plan v1');
});

test('rejects malformed delegated receipts and lesson sections', () => {
  const validConcept = {
    conceptPath: 'x',
    rootIndexPath: 'x',
    scopeIndexPath: 'x',
    subjectIndexPath: 'x',
  };
  for (const invalidReceipt of [
    '{',
    '[]',
    JSON.stringify({ concepts: [null], links: [] }),
    JSON.stringify({ concepts: [{ conceptPath: 'x' }], links: [] }),
    JSON.stringify({ concepts: [validConcept], links: 'invalid' }),
    JSON.stringify({ concepts: [validConcept], links: [null] }),
    JSON.stringify({ concepts: [validConcept], links: [{ from: 'x' }] }),
    JSON.stringify({
      concepts: [validConcept],
      links: [{ from: '', to: 'x' }],
    }),
  ]) {
    expect(() =>
      finalizeAidxLesson(
        distillableGoal(),
        { disposition: 'new-primary', planVersion: 1 },
        invalidReceipt,
        now,
      ),
    ).toThrow();
  }
  const invalidLesson = distillableGoal().replace(
    '## Lesson\n\n- Disposition: pending',
    '## Lesson\n\n- Disposition: already-finalized',
  );
  expect(() =>
    finalizeAidxLesson(
      invalidLesson,
      { disposition: 'new-primary', planVersion: 1 },
      JSON.stringify({ concepts: [validConcept], links: [] }),
      now,
    ),
  ).toThrow('lesson section is not in its pending form');
});

test('separates lifecycle progress from plan revision and rejects plan resets', () => {
  let content = goal();
  content = transitionAidxGoal(content, 'inspect_context', 'inspected', now);
  content = transitionAidxGoal(content, 'questions_ready', 'ready', now);
  content = transitionAidxGoal(content, 'questions_complete', 'complete', now);
  content = withPlan(content, 1);
  content = transitionAidxGoal(content, 'plan_ready', 'generated v1', now);
  expect(parseAidxGoal(content).metadata).toMatchObject({
    currentStep: 4,
    planVersion: 1,
  });

  content = transitionAidxGoal(content, 'revise_plan', 'revise', now);
  expect(parseAidxGoal(content).metadata).toMatchObject({
    currentStep: 5,
    planVersion: 1,
  });
  content = withPlan(content, 1);
  expect(() =>
    transitionAidxGoal(content, 'plan_ready', 'stale v1', now),
  ).toThrow('newly generated Plan v2');

  content = withPlan(content, 2);
  content = transitionAidxGoal(content, 'plan_ready', 'generated v2', now);
  expect(parseAidxGoal(content).metadata).toMatchObject({
    currentStep: 6,
    planVersion: 2,
  });
  expect(() =>
    parseAidxGoal(withMetadata(content, { plan_version: 1 })),
  ).toThrow('does not match persisted plan_version 1');
});

test('keeps the question state active after an answer until completeness is proven', () => {
  let content = goal();
  content = transitionAidxGoal(content, 'inspect_context', 'inspected', now);
  content = transitionAidxGoal(
    content,
    'questions_ready',
    'questions ready',
    now,
  );
  content = transitionAidxGoal(
    content,
    'answers_received',
    'the answer resolved one gap; an integration boundary remains unknown',
    now,
  );
  expect(parseAidxGoal(content).metadata.status).toBe('ASK_QUESTIONS');
  content = transitionAidxGoal(
    content,
    'questions_complete',
    'all material gaps resolved or explicitly deferred',
    now,
  );
  content = withPlan(content, 1);
  expect(parseAidxGoal(content).metadata.status).toBe('GENERATE_PLAN');
});

test('supports blocking and deferring without pretending implementation is done', () => {
  expect(
    parseAidxGoal(
      transitionAidxGoal(goal(), 'blocked', 'external dependency missing', now),
    ).metadata.status,
  ).toBe('BLOCKED');
  expect(
    parseAidxGoal(
      transitionAidxGoal(goal(), 'deferred', 'explicitly future work', now),
    ).metadata.status,
  ).toBe('DEFERRED');
});

test('rejects illegal transitions and premature completion', () => {
  expect(() => transitionAidxState('CAPTURE_GOAL', 'tests_passed')).toThrow(
    'Illegal AIDX transition',
  );
  const unversionedPlan = goal()
    .replace('status: CAPTURE_GOAL', 'status: APPROVE_REVISE')
    .replace(
      '## Approval',
      '## Plan v1\n\n### Steps\n\n1. [ ] Implement.\n\n## Approval',
    );
  expect(() =>
    transitionAidxGoal(unversionedPlan, 'approve_plan', 'approve', now),
  ).toThrow('does not match persisted plan_version 0');
  expect(() =>
    finalizeAidxLesson(
      goal(),
      {
        disposition: 'no-durable-lesson',
        justification: 'lesson',
        planVersion: 1,
      },
      undefined,
      now,
    ),
  ).toThrow('DISTILL_LESSON');
  expect(() => appendAidxNote(goal(), '', 'evidence', now)).toThrow(
    'event and evidence',
  );
  expect(() => parseAidxGoal('not a record')).toThrow('front matter');
});

test('rejects malformed metadata and incomplete state records', () => {
  expect(() => parseAidxGoal(withMetadata(goal(), { id: '' }))).toThrow(
    'metadata field is invalid: id',
  );
  expect(() =>
    parseAidxGoal(withMetadata(goal(), { plan_version: -1 })),
  ).toThrow('metadata field is invalid: plan_version');
  expect(() =>
    parseAidxGoal(withMetadata(goal(), { plan_version: 1 })),
  ).toThrow('active Plan heading');
  const duplicatePlan = withMetadata(
    goal().replace('## Approval', '## Plan v1\n\n## Plan v1\n\n## Approval'),
    { plan_version: 1, status: 'APPROVE_REVISE' },
  );
  expect(() => parseAidxGoal(duplicatePlan)).toThrow(
    'exactly one active Plan heading',
  );
  expect(() =>
    parseAidxGoal(withMetadata(goal(), { status: 'UNKNOWN' })),
  ).toThrow('metadata state is invalid');
  expect(() =>
    parseAidxGoal(withMetadata(goal(), { approval: 'maybe' })),
  ).toThrow('metadata approval is invalid');
  expect(() =>
    parseAidxGoal(withMetadata(goal(), { lesson_disposition: 'maybe' })),
  ).toThrow('metadata lesson disposition is invalid');
  expect(() =>
    parseAidxGoal(withMetadata(goal(), { project_root: 'relative/path' })),
  ).toThrow('project_root must be absolute');
  expect(() =>
    parseAidxGoal(withMetadata(goal(), { status: 'APPROVE_REVISE' })),
  ).toThrow('planned states require a Plan section');
  expect(() =>
    parseAidxGoal(
      withMetadata(
        withPlan(goal()).replace(
          '## Validation\n\nPending.\n\n## Lesson',
          '## Lesson',
        ),
        {
          approval: 'approved',
          plan_version: 1,
          status: 'TEST',
        },
      ),
    ),
  ).toThrow('validation states require a Validation section');
  expect(() =>
    parseAidxGoal(
      withMetadata(withPlan(goal()), {
        approval: 'pending',
        plan_version: 1,
        status: 'EXECUTE_PLAN',
      }),
    ),
  ).toThrow('execution states require approved plan metadata');
  expect(() =>
    parseAidxGoal(
      withMetadata(withPlan(goal()), {
        approval: 'approved',
        plan_version: 1,
        status: 'DONE',
      }),
    ),
  ).toThrow('DONE requires a lesson disposition');
  expect(() =>
    parseAidxGoal(
      withMetadata(
        goal().replace(/^## Plan v[1-9][0-9]*$[\s\S]*?(?=^## Approval$)/mu, ''),
        {
          approval: 'approved',
          lesson_disposition: 'pending',
          plan_version: 1,
          status: 'DISTILL_LESSON',
        },
      ),
    ),
  ).toThrow('DISTILL_LESSON requires the active Plan');
});

test('covers terminal guards, creation guards, and lesson guards', () => {
  expect(isAidxTerminal('DONE')).toBe(true);
  expect(isAidxTerminal('BLOCKED')).toBe(true);
  expect(isAidxTerminal('DEFERRED')).toBe(true);
  expect(isAidxTerminal('TEST')).toBe(false);
  expect(() => transitionAidxState('DONE', 'blocked')).toThrow(
    'terminal AIDX state',
  );
  expect(() =>
    createAidxGoal({
      cbmIndex: '',
      goal: 'goal',
      id: 'id',
      projectRoot: '/tmp/demo',
    }),
  ).toThrow('goal id, CBM index, and goal are required');
  expect(() =>
    createAidxGoal({
      cbmIndex: 'demo',
      goal: 'goal',
      id: 'id',
      projectRoot: 'relative/path',
    }),
  ).toThrow('project root must be absolute');
  expect(() =>
    finalizeAidxLesson(
      distillableGoal(),
      { disposition: 'no-durable-lesson', planVersion: 1 },
      undefined,
      now,
    ),
  ).toThrow('require a non-empty justification');
  expect(() =>
    transitionAidxGoal(distillableGoal(), 'lesson_complete', '', now),
  ).toThrow('transitions require factual evidence');
  expect(() =>
    transitionAidxGoal(
      distillableGoal(),
      'lesson_complete',
      'attempted closeout',
      now,
    ),
  ).toThrow('lesson disposition must be recorded before DONE');
  expect(() =>
    transitionAidxGoal(
      withMetadata(distillableGoal(), {
        lesson_disposition: 'no-durable-lesson',
      }),
      'lesson_complete',
      'attempted closeout',
      now,
    ),
  ).toThrow('finalized lesson records must not retain a Plan section');
});
