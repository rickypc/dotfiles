import { expect, test } from 'bun:test';
import matter from 'gray-matter';

import {
  appendAidxNote,
  createAidxGoal,
  isAidxTerminal,
  parseAidxGoal,
  setAidxLesson,
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

const withPlan = (content: string): string =>
  content.replace(
    '## Approval',
    '## Plan v1\n\n### Steps\n\n1. [ ] Implement and test.\n\n## Approval',
  );

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
  content = withPlan(content);
  content = transitionAidxGoal(content, 'plan_ready', 'plan generated', now);
  content = transitionAidxGoal(
    content,
    'revise_plan',
    'user requested revision',
    now,
  );
  content = withPlan(content);
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
  content = setAidxLesson(
    content,
    'no-durable-lesson',
    'no verified durable lesson',
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
    status: 'DONE',
  });
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
  ).toThrow('generated plan');
  expect(() =>
    setAidxLesson(goal(), 'no-durable-lesson', 'lesson', now),
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
    setAidxLesson(distillableGoal(), 'pending', 'lesson', now),
  ).toThrow('lesson disposition and evidence are required');
  expect(() =>
    setAidxLesson(distillableGoal(), 'no-durable-lesson', '', now),
  ).toThrow('lesson disposition and evidence are required');
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
});
