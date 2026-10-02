import { expect, mock, test } from 'bun:test';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';

mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));

const { AidxCompletedPlanValidationError, run, usage, validateAidxCompletedPlan } = await import(
  '../../scripts/aidx-completed-plan-validator.js'
);

const planPath = '/workspace/.agents/plans/Users-demo/completed-plan.md';

const completedPlan = `---
title: "Completed plan"
repo_search_index: "Users-demo"
created_at: "2026-09-01"
updated_at: "2026-09-30"
status: "completed"
---

# Completed plan

## 1. TARGET DIRECTIVES
Objective delivered. Scope and exclusions are explicit; the owner is named.

## 2. VARIABLE DEFINITION MATRIX
- target_path - type: path; required; source: repository evidence.
- optional_note - type: string; optional; source: user decision.

## 3. CHRONOLOGICAL WORKFLOW
- [x] Inspect the target; target: parser module; owner: developer; dependency: first; reason: baseline; expected result: verified behavior; proof: focused test; failure boundary: stop on ambiguity.
- [-] Apply the legacy fallback; reason: superseded by the primary route.

## 4. TOOL STRATEGY & FALLBACKS
- Primary method: repository inspection; owner: repo-search; input: approved root; fallback: bounded textual search.

## 5. SYSTEMATIC VERIFICATION CHECKLIST
- Check the objective and every variable input.
- Check each workflow result and preserved behavior.

## 6. RIGID OUTPUT SCHEMA
- Required labels are emitted in order with fixed delimiters and format.
- Omission rules state what is omitted when optional values are absent.
`;

test('accepts a completed plan and returns completed/skipped counts', () => {
  expect(validateAidxCompletedPlan(completedPlan, planPath)).toEqual({
    completedSteps: 1,
    headings: [
      '1. TARGET DIRECTIVES',
      '2. VARIABLE DEFINITION MATRIX',
      '3. CHRONOLOGICAL WORKFLOW',
      '4. TOOL STRATEGY & FALLBACKS',
      '5. SYSTEMATIC VERIFICATION CHECKLIST',
      '6. RIGID OUTPUT SCHEMA',
    ],
    planPath,
    repoSearchIndex: 'Users-demo',
    skippedSteps: 1,
    status: 'valid',
    title: 'Completed plan',
  });
});

test('rejects a plan whose status is not completed', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace('status: "completed"', 'status: "pending"'),
      planPath,
    ),
  ).toThrow(/status must be `completed`/u);
});

test('rejects an unchecked workflow item', () => {
  expect(() =>
    validateAidxCompletedPlan(completedPlan.replace('- [x] Inspect', '- [ ] Inspect'), planPath),
  ).toThrow(/unchecked/u);
});

test('rejects a skipped workflow item without a reason', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace('reason: superseded by the primary route.', 'handled elsewhere.'),
      planPath,
    ),
  ).toThrow(/reason/u);
});

test('rejects a truncated final RIGID OUTPUT SCHEMA section', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace(/## 6\. RIGID OUTPUT SCHEMA\n[\s\S]*$/u, '## 6. RIGID OUTPUT SCHEMA\n'),
      planPath,
    ),
  ).toThrow(/RIGID OUTPUT SCHEMA must contain content/u);
});

test('rejects a plan outside the canonical indexed plan route', () => {
  expect(() => validateAidxCompletedPlan(completedPlan, '/workspace/notes/plan.md')).toThrow(
    /\.agents\/plans/u,
  );
});

test('rejects invalid frontmatter and heading drift', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace('created_at: "2026-09-01"', 'created_at: "2026-02-30"'),
      planPath,
    ),
  ).toThrow(/calendar/u);
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace('## 4. TOOL STRATEGY & FALLBACKS', '## 4. TOOL STRATEGY'),
      planPath,
    ),
  ).toThrow(AidxCompletedPlanValidationError);
});

test('runs the validator through its absolute-file command boundary', async () => {
  const write = mock();
  const read = (async () => completedPlan) as unknown as Parameters<typeof run>[1];
  const checkStat = (async () => ({
    isFile: () => true,
  })) as unknown as Parameters<typeof run>[2];
  const receipt = await run([planPath], read, checkStat, write);
  expect(receipt.status).toBe('valid');
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"status": "valid"'));
});

test('rejects invalid command arguments and non-file paths', async () => {
  await expect(run([])).rejects.toThrow(usage());
  const read = (async () => completedPlan) as unknown as Parameters<typeof run>[1];
  const checkStat = (async () => ({
    isFile: () => false,
  })) as unknown as Parameters<typeof run>[2];
  await expect(run([planPath], read, checkStat)).rejects.toThrow('not a regular file');
});
