import { expect, mock, test } from 'bun:test';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';

mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));

const { AidpPlanValidationError, run, usage, validateAidpPlan } = await import(
  '../../scripts/aidp-plan-validator.js'
);

const planPath = '/workspace/.agents/plans/Users-demo/valid-plan.md';

const validPlan = `---
title: "Valid AIDP plan"
repo_search_index: "Users-demo"
created_at: "2026-08-09"
updated_at: "2026-08-09"
status: "pending"
---

### 1. TARGET DIRECTIVES
Objective: deliver the approved change. Scope covers the named files; exclusions and one owner are explicit.

### 2. VARIABLE DEFINITION MATRIX
- target_path — type: absolute path; required; source: repository evidence.
- optional_note — type: string; optional; source: user decision.

### 3. CHRONOLOGICAL WORKFLOW
- [ ] Inspect the target and record the owner responsibility; Target: parser module; Dependency and ordering: first; Reason: establish the baseline; Expected result: verified current behavior and preserved invariant; Proof: focused test; Failure or boundary: stop on ambiguity.
- [ ] Apply the selected change; Target: parser module; Owner responsibility: implementation owner; Dependency and ordering: after step 1; Reason: satisfy the objective; Expected result: requested behavior; Preserved behavior: existing valid inputs; Proof and check: focused test; Failure or boundary: return to planning.

### 4. TOOL STRATEGY & FALLBACKS
- Primary method: repository inspection; owner: repo-search; input: approved root and query; fallback: bounded textual search when the primary result is empty or fails.

### 5. SYSTEMATIC VERIFICATION CHECKLIST
- Check the objective and every variable input.
- Check each workflow result and preserved behavior.
- Check exclusions, scope, failure, and stop conditions.

### 6. RIGID OUTPUT SCHEMA
- Required labels are emitted in order with fixed delimiters and format.
- Omission rules state what is omitted when optional values are absent.
`;

test('accepts a complete AIDP plan and returns a compact receipt', () => {
  expect(validateAidpPlan(validPlan, planPath)).toEqual({
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
    status: 'valid',
    title: 'Valid AIDP plan',
  });
});

test('rejects frontmatter drift, index mismatch, and invalid dates', () => {
  expect(() =>
    validateAidpPlan(
      validPlan
        .replace(
          'repo_search_index: "Users-demo"',
          'repo_search_index: "Other"',
        )
        .replace('created_at: "2026-08-09"', 'created_at: "2026-02-30"')
        .replace('status: "pending"', 'extra: "unexpected"\nstatus: "pending"'),
      planPath,
    ),
  ).toThrow(/exactly|calendar|matching/u);
});

test('rejects heading drift, empty sections, and unresolved placeholders', () => {
  expect(() =>
    validateAidpPlan(
      validPlan
        .replace('### 4. TOOL STRATEGY & FALLBACKS', '### 4. TOOL STRATEGY')
        .replace(
          'Scope covers the named files',
          'Scope covers [the named files]',
        ),
      planPath,
    ),
  ).toThrow(AidpPlanValidationError);
});

test('rejects a workflow step that omits an independently testable proof field', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace('Proof and check: focused test; ', ''),
      planPath,
    ),
  ).toThrow(/step 2.*proof/u);
});

test('rejects workflow steps without unchecked task markers', () => {
  expect(() =>
    validateAidpPlan(validPlan.replaceAll('- [ ]', '1.'), planPath),
  ).toThrow(/unchecked Markdown task items/u);
});

test('rejects a plan outside the canonical indexed plan route', () => {
  expect(() => validateAidpPlan(validPlan, '/workspace/notes/plan.md')).toThrow(
    /\.agents\/plans/u,
  );
});

test('runs the validator through its absolute-file command boundary', async () => {
  const write = mock();
  const read = (async () => validPlan) as unknown as Parameters<typeof run>[1];
  const checkStat = (async () => ({
    isFile: () => true,
  })) as unknown as Parameters<typeof run>[2];
  const receipt = await run([planPath], read, checkStat, write);
  expect(receipt.status).toBe('valid');
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"status": "valid"'),
  );
});

test('rejects invalid command arguments and non-file paths', async () => {
  await expect(run([])).rejects.toThrow(usage());
  const read = (async () => validPlan) as unknown as Parameters<typeof run>[1];
  const checkStat = (async () => ({
    isFile: () => false,
  })) as unknown as Parameters<typeof run>[2];
  await expect(run([planPath], read, checkStat)).rejects.toThrow(
    'not a regular file',
  );
});
