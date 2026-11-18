import { expect, mock, test } from 'bun:test';
import * as realFs from 'node:fs/promises';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';
import * as realConsistency from '../../../scripts/plans/aidp-consistency.js';
import type { CliContext } from '../../../utils/cli/context.js';
import * as realCli from '../../../utils/cli/index.js';
import { runCommand } from '../../../utils/cli/index.js';

// Importing the SUT as a module keeps its Bun.argv CLI dispatch inert; the run() tests inject
// read, stat, and write so the process filesystem and console are never touched, and every module
// the SUT imports is registered below before the dynamic import. The Date boundary is exercised
// for real but only over fixed fixture strings, so no live clock or fake time source is needed.
mock.module('node:fs/promises', () => realFs);
mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../utils/cli.js', () => realCli);
mock.module('./aidp-plan-consistency.js', () => realConsistency);

const { AidpPlanValidationError, createCommand, validateAidpPlan } = await import(
  '../../../scripts/plans/aidp-validator.js'
);
type Deps = NonNullable<Parameters<typeof createCommand>[0]>;

const runPlan = async (args: readonly string[], deps: Deps = {}) => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  const code = await runCommand(createCommand(deps), args, context);
  return { code, envelope: out[0] === undefined ? undefined : JSON.parse(out[0]) };
};

const planPath = '/workspace/.agents/plans/Users-demo/valid-plan.md';

const validPlan = `---
title: "Valid AIDP plan"
repo_search_index: "Users-demo"
created_at: "2026-08-09"
updated_at: "2026-08-09"
status: "pending"
---

# Valid AIDP plan

## 1. TARGET DIRECTIVES
Objective: deliver the approved change. Scope covers the named files; exclusions and one owner are explicit.

**Evidence record**: retrieval receipts are cited, and each fact is verified by a command or file read.

**Bounded execution rules**: two repair attempts per step, then escalate; checkpoints stay outside the plan body.

## 2. VARIABLE DEFINITION MATRIX
- target_path - type: absolute path; required; source: repository evidence.
- optional_note - type: string; optional; source: user decision.

## 3. CHRONOLOGICAL WORKFLOW

### Phase 1 - Apply

Phase inputs: the parser module and its recorded owner responsibility. Completion criteria: both steps pass their focused tests. Resume point: checkpoint records completed steps, receipts, and the next action.

- [ ] Inspect the target and record the owner responsibility; Target: parser module; Dependency and ordering: first; Reason: establish the baseline; Expected result: verified current behavior and preserved invariant; Proof: focused test; Failure or boundary: stop on ambiguity.
- [ ] Apply the selected change; Target: parser module; Owner responsibility: implementation owner; Dependency and ordering: after step 1; Reason: satisfy the objective; Expected result: requested behavior; Preserved behavior: existing valid inputs; Proof and check: focused test; Failure or boundary: return to planning.

## 4. TOOL STRATEGY & FALLBACKS
- Primary method: repository inspection; owner: repo-search; input: approved root and query; fallback: bounded textual search when the primary result is empty or fails.

## 5. SYSTEMATIC VERIFICATION CHECKLIST
- Check the objective and every variable input.
- Check each workflow result and preserved behavior.
- Check exclusions, scope, failure, and stop conditions.

## 6. RIGID OUTPUT SCHEMA
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
        .replace('repo_search_index: "Users-demo"', 'repo_search_index: "Other"')
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
        .replace('## 4. TOOL STRATEGY & FALLBACKS', '## 4. TOOL STRATEGY')
        .replace('Scope covers the named files', 'Scope covers [the named files]'),
      planPath,
    ),
  ).toThrow(AidpPlanValidationError);
});

test('rejects a workflow step that omits an independently testable proof field', () => {
  expect(() =>
    validateAidpPlan(validPlan.replace('Proof and check: focused test; ', ''), planPath),
  ).toThrow(/step 2.*proof/u);
});

test('rejects a plan without an evidence record or bounded execution rules', () => {
  expect(() =>
    validateAidpPlan(validPlan.replace('**Evidence record**', '**Findings**'), planPath),
  ).toThrow(/must state Evidence record/u);
  expect(() =>
    validateAidpPlan(validPlan.replace('**Bounded execution rules**', '**Limits**'), planPath),
  ).toThrow(/must state Bounded execution rules/u);
  expect(() =>
    validateAidpPlan(
      validPlan.replace('two repair attempts per step, then escalate; ', ''),
      planPath,
    ),
  ).toThrow(/must state attempt or attempts/u);
});

test('rejects workflow steps without unchecked task markers', () => {
  expect(() => validateAidpPlan(validPlan.replaceAll('- [ ]', '1.'), planPath)).toThrow(
    /unchecked Markdown task items/u,
  );
});

test('rejects a workflow without phase blocks', () => {
  const phaseless = validPlan.replace(/^### Phase 1 - Apply\n\nPhase inputs: .+\n\n/gmu, '');
  expect(() => validateAidpPlan(phaseless, planPath)).toThrow(/must decompose/u);
});

test('rejects a phase block that omits the resume point', () => {
  const noResume = validPlan.replace(
    ' Resume point: checkpoint records completed steps, receipts, and the next action.',
    '',
  );
  expect(() => validateAidpPlan(noResume, planPath)).toThrow(/phase 1 must state resume/u);
});

test('rejects a task item outside every phase block', () => {
  const strayStep = validPlan.replace(
    '### Phase 1 - Apply',
    '- [ ] Stray preamble step; Target: parser module; Owner responsibility: implementation owner; Dependency and ordering: first; Reason: establish the baseline; Expected result: verified behavior; Preserved behavior: existing valid inputs; Proof: focused test; Failure or boundary: stop.\n\n### Phase 1 - Apply',
  );
  expect(() => validateAidpPlan(strayStep, planPath)).toThrow(
    /not before the first phase heading/u,
  );
});

test('rejects phase numbering that does not ascend from 1', () => {
  const renumbered = validPlan.replace('### Phase 1 - Apply', '### Phase 2 - Apply');
  expect(() => validateAidpPlan(renumbered, planPath)).toThrow(/ascend from 1/u);
});

test('rejects a phase block with no unchecked step', () => {
  const emptyPhase = validPlan.replace(
    '## 4. TOOL STRATEGY & FALLBACKS',
    '### Phase 2 - Deliver\n\nPhase inputs: the applied change. Completion criteria: the final gate passes. Resume point: closeout recorded.\n\n## 4. TOOL STRATEGY & FALLBACKS',
  );
  expect(() => validateAidpPlan(emptyPhase, planPath)).toThrow(
    /phase 2 must contain at least one unchecked/u,
  );
});

test('rejects a plan outside the canonical indexed plan route', () => {
  expect(() => validateAidpPlan(validPlan, '/workspace/notes/plan.md')).toThrow(/\.agents\/plans/u);
});

test('rejects a plan whose document H1 differs from the frontmatter title', () => {
  expect(() =>
    validateAidpPlan(validPlan.replace('# Valid AIDP plan', '# Different title'), planPath),
  ).toThrow(/H1/u);
});

test('rejects a plan with no document H1', () => {
  expect(() => validateAidpPlan(validPlan.replace('# Valid AIDP plan\n\n', ''), planPath)).toThrow(
    /H1/u,
  );
});

test('rejects an unflagged assumption phrase', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace(
        'Reason: satisfy the objective;',
        'Reason: likely satisfies the objective;',
      ),
      planPath,
    ),
  ).toThrow(/unflagged assumption/u);
});

test('rejects a workflow step asserting a user decision without a decision or clarified marker', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace(
        'Reason: satisfy the objective;',
        'Reason: the user authorized the change;',
      ),
      planPath,
    ),
  ).toThrow(/decision:|clarified:/u);
});

test('accepts a workflow step that asserts a user decision with a decision marker', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace(
        'Reason: satisfy the objective;',
        'Reason: decision: the user authorized the change;',
      ),
      planPath,
    ),
  ).not.toThrow();
});

test('runs the validator through its absolute-file command boundary', async () => {
  const read = (async () => validPlan) as unknown as Deps['read'];
  const checkStat = (async () => ({ isFile: () => true })) as unknown as Deps['checkStat'];
  const { code, envelope } = await runPlan([planPath], { checkStat, read });
  expect(code).toBe(0);
  expect(envelope.data.status).toBe('valid');
});

test('rejects invalid command arguments and non-file paths', async () => {
  expect((await runPlan([])).code).toBe(2);
  expect((await runPlan(['relative.md'])).code).toBe(2);
  const read = (async () => validPlan) as unknown as Deps['read'];
  const checkStat = (async () => ({ isFile: () => false })) as unknown as Deps['checkStat'];
  const { code, envelope } = await runPlan([planPath], { checkStat, read });
  expect(code).toBe(1);
  expect(envelope.diagnostics[0]).toContain('not a regular file');
});

test('rejects a non-string frontmatter field', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace('created_at: "2026-08-09"', 'created_at: 20260809'),
      planPath,
    ),
  ).toThrow(/created_at must be a non-empty string/u);
});

test('rejects a body with two H1 headings', () => {
  expect(() => validateAidpPlan(`${validPlan}\n# Duplicate H1\n`, planPath)).toThrow(/found 2/u);
});

test('rejects an unsafe repo_search_index segment', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace('repo_search_index: "Users-demo"', 'repo_search_index: "bad index"'),
      planPath,
    ),
  ).toThrow(/one safe path segment/u);
});

test('rejects a plan file placed directly inside the plans directory', () => {
  expect(() => validateAidpPlan(validPlan, '/workspace/.agents/plans/plan.md')).toThrow(
    /one named plan file/u,
  );
});

test('rejects a variable definition matrix with no item or table row', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace(
        '- target_path - type: absolute path; required; source: repository evidence.\n- optional_note - type: string; optional; source: user decision.\n',
        '',
      ),
      planPath,
    ),
  ).toThrow(/VARIABLE DEFINITION MATRIX must contain at least one item or table row/u);
});

test('rejects a verification checklist with no check', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace(
        '- Check the objective and every variable input.\n- Check each workflow result and preserved behavior.\n- Check exclusions, scope, failure, and stop conditions.\n',
        '',
      ),
      planPath,
    ),
  ).toThrow(/SYSTEMATIC VERIFICATION CHECKLIST must contain at least one check/u);
});

test('rejects a created_at value without the YYYY-MM-DD format', () => {
  expect(() =>
    validateAidpPlan(
      validPlan.replace('created_at: "2026-08-09"', 'created_at: "Sept 1, 2026"'),
      planPath,
    ),
  ).toThrow(/must use YYYY-MM-DD/u);
});

test('rejects an invalid status value', () => {
  expect(() =>
    validateAidpPlan(validPlan.replace('status: "pending"', 'status: "archived"'), planPath),
  ).toThrow(/status must be draft, pending, blocked, in-progress, complete, or completed/u);
});

test('rejects a title holding an unresolved placeholder token', () => {
  expect(() =>
    validateAidpPlan(
      validPlan
        .replace('title: "Valid AIDP plan"', 'title: "Valid TODO plan"')
        .replace('# Valid AIDP plan', '# Valid TODO plan'),
      planPath,
    ),
  ).toThrow(/title contains an unresolved placeholder/u);
});

test('rejects plan frontmatter that is not valid YAML', () => {
  // Distinct content per suite: gray-matter caches unparsed results by content, so a throwing
  // parse in another suite must not poison this fixture's parse.
  expect(() =>
    validateAidpPlan('---\ntitle: [unclosed, extra\n---\n\n# Broken aidp plan\n'),
  ).toThrow(/valid YAML/u);
});

test('blocks the handoff with a consistency finding alongside the structural findings', () => {
  const contradictory = validPlan
    .replace(
      '## 2. VARIABLE DEFINITION MATRIX',
      'Cap: 2 x 3 = 7.\n\n## 2. VARIABLE DEFINITION MATRIX',
    )
    .replace(
      ' Resume point: checkpoint records completed steps, receipts, and the next action.',
      '',
    );
  expect(() => validateAidpPlan(contradictory, planPath)).toThrow(
    /phase 1 must state resume[\s\S]*Cap arithmetic 2 x 3 = 7 is wrong/u,
  );
});
