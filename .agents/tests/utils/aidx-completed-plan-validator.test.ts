import { expect, mock, test } from 'bun:test';
import * as realFs from 'node:fs/promises';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';
import * as realCli from '../../utils/cli.js';

// Importing the SUT as a module keeps its Bun.argv CLI dispatch inert; the run() tests inject
// read, stat, and write so the process filesystem and console are never touched, and every module
// the SUT imports is registered below before the dynamic import. The Date boundary is exercised
// for real but only over fixed fixture strings, so no live clock or fake time source is needed.
mock.module('node:fs/promises', () => realFs);
mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../utils/cli.js', () => realCli);

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

test('rejects a non-string frontmatter field', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace('created_at: "2026-09-01"', 'created_at: 20260901'),
      planPath,
    ),
  ).toThrow(/created_at must be a non-empty string/u);
});

test('rejects a required section holding an unresolved placeholder', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace(
        '- Primary method: repository inspection; owner: repo-search; input: approved root; fallback: bounded textual search.',
        '- Primary method: inspection; fallback: TBD.',
      ),
      planPath,
    ),
  ).toThrow(/TOOL STRATEGY & FALLBACKS contains an unresolved placeholder/u);
});

test('rejects a body with zero H1 headings', () => {
  expect(() =>
    validateAidxCompletedPlan(completedPlan.replace('# Completed plan\n\n', ''), planPath),
  ).toThrow(/exactly one H1/u);
});

test('rejects a body with two H1 headings', () => {
  expect(() => validateAidxCompletedPlan(`${completedPlan}\n# Duplicate H1\n`)).toThrow(/found 2/u);
});

test('rejects an H1 that differs from the frontmatter title', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace('# Completed plan', '# Drifted plan'),
      planPath,
    ),
  ).toThrow(/must equal the frontmatter title/u);
});

test('rejects a plan path routed under a different index directory', () => {
  expect(() =>
    validateAidxCompletedPlan(completedPlan, '/workspace/.agents/plans/other-index/plan.md'),
  ).toThrow(/matching \.agents\/plans/u);
});

test('rejects an unsafe repo_search_index segment', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace('repo_search_index: "Users-demo"', 'repo_search_index: "bad index"'),
      planPath,
    ),
  ).toThrow(/one safe path segment/u);
});

test('rejects a plan file placed directly inside the plans directory', () => {
  expect(() =>
    validateAidxCompletedPlan(completedPlan, '/workspace/.agents/plans/plan.md'),
  ).toThrow(/one named plan file/u);
});

test('rejects a created_at value without the YYYY-MM-DD format', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace('created_at: "2026-09-01"', 'created_at: "Sept 1, 2026"'),
      planPath,
    ),
  ).toThrow(/must use YYYY-MM-DD/u);
});

test('rejects a frontmatter key set that is not exactly the five required keys', () => {
  expect(() =>
    validateAidxCompletedPlan(completedPlan.replace('status: "completed"\n', '')),
  ).toThrow(/Frontmatter must contain exactly/u);
});

test('rejects a title holding an unresolved placeholder token', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan
        .replace('title: "Completed plan"', 'title: "Completed TODO plan"')
        .replace('# Completed plan', '# Completed TODO plan'),
      planPath,
    ),
  ).toThrow(/title contains an unresolved placeholder/u);
});

test('rejects plan frontmatter that is not valid YAML', () => {
  expect(() => validateAidxCompletedPlan('---\ntitle: [unclosed\n---\n\n# Broken plan\n')).toThrow(
    /valid YAML/u,
  );
});

test('accepts schema placeholder tokens in the RIGID OUTPUT SCHEMA section', () => {
  expect(() =>
    validateAidxCompletedPlan(
      completedPlan.replace(
        '- Required labels are emitted in order with fixed delimiters and format.',
        '- Receipt rows look like COMMANDS: <command> -> exit status; COVERAGE: <file>: percentages.',
      ),
      planPath,
    ),
  ).not.toThrow();
});
