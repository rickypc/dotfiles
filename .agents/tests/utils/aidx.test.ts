import { expect, mock, test } from 'bun:test';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';

mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));

const { completeAidxPlan, parseAidxPlan } = await import('../../utils/aidx.js');

const validPlan = `---
title: "Execute the parser refactor"
cbm_index: "Users-demo"
created_at: "2026-08-07"
updated_at: "2026-08-07"
status: "pending"
---

# ROLE
Principal developer infrastructure architect

# OBJECTIVE
Execute the accepted parser refactor one step at a time.

# CORE DIRECTIVES
- Read the plan before touching source files.
- Stop when a step is ambiguous or changes scope.

# EXECUTION STEPS
1. Inspect the current parser imports and record every direct consumer before editing the implementation.
2. Apply the smallest compatible change and run the focused proof required by this step.

# CONSTRAINTS
- Do not invent missing requirements or edit files outside the approved scope.

# INPUTS TO PROCESS
- The approved plan and the repository instructions.
`;

test('parses the six-section plan and exposes ordered execution steps', () => {
  const plan = parseAidxPlan(validPlan);
  expect(plan.title).toBe('Execute the parser refactor');
  expect(plan.coreDirectives).toHaveLength(2);
  expect(plan.executionSteps).toHaveLength(2);
  expect(plan.executionSteps[0]).toContain(
    'Inspect the current parser imports',
  );
});

test('hands only the relative plan path to the importer and consumes its receipt', async () => {
  const importer = mock(async (planPath: string) => ({
    conceptPath: 'Users-demo/plans/execute-the-parser-refactor.md',
    planPath,
  }));
  const remover = mock(async () => undefined);
  await expect(
    completeAidxPlan(
      '.agents/plans/Users-demo/execute-the-parser-refactor.md',
      parseAidxPlan(validPlan),
      importer,
      remover,
    ),
  ).resolves.toEqual({
    importerReceipt: {
      conceptPath: 'Users-demo/plans/execute-the-parser-refactor.md',
      planPath: '.agents/plans/Users-demo/execute-the-parser-refactor.md',
    },
    planPath: '.agents/plans/Users-demo/execute-the-parser-refactor.md',
    status: 'completed-with-knowledge-base-receipt',
    title: 'Execute the parser refactor',
  });
  expect(importer).toHaveBeenCalledWith(
    '.agents/plans/Users-demo/execute-the-parser-refactor.md',
  );
  expect(remover).toHaveBeenCalledWith(
    '.agents/plans/Users-demo/execute-the-parser-refactor.md',
  );
});

test('does not emit a completion receipt when the importer fails', async () => {
  const importer = mock(async () => {
    throw new Error('import failed');
  });
  const remover = mock(async () => undefined);
  await expect(
    completeAidxPlan(
      '.agents/plans/Users-demo/execute-the-parser-refactor.md',
      parseAidxPlan(validPlan),
      importer,
      remover,
    ),
  ).rejects.toThrow('import failed');
  expect(remover).not.toHaveBeenCalled();
});

test('supports the parser utility without a filesystem cleanup callback', async () => {
  await expect(
    completeAidxPlan(
      '.agents/plans/Users-demo/execute-the-parser-refactor.md',
      parseAidxPlan(validPlan),
      async () => ({ conceptPath: 'Users-demo/plans/plan.md' }),
    ),
  ).resolves.toMatchObject({ status: 'completed-with-knowledge-base-receipt' });
});

test('does not emit a completion receipt when source-plan cleanup fails', async () => {
  const importer = mock(async () => ({
    conceptPath: 'Users-demo/plans/plan.md',
  }));
  const remover = mock(async () => {
    throw new Error('cleanup failed');
  });
  await expect(
    completeAidxPlan(
      '.agents/plans/Users-demo/execute-the-parser-refactor.md',
      parseAidxPlan(validPlan),
      importer,
      remover,
    ),
  ).rejects.toThrow('cleanup failed');
});

test('rejects plans with missing sections or non-granular steps', () => {
  expect(() =>
    parseAidxPlan(validPlan.replace('# CONSTRAINTS', '# BROKEN')),
  ).toThrow('six required sections');
  expect(() =>
    parseAidxPlan(
      validPlan.replace(
        'Inspect the current parser imports and record every direct consumer before editing the implementation.',
        'Inspect it.',
      ),
    ),
  ).toThrow('granular');
});

test('rejects partially structured execution steps before execution', () => {
  expect(() =>
    parseAidxPlan(
      validPlan.replace(
        'Inspect the current parser imports and record every direct consumer before editing the implementation.',
        'Action: inspect; Target or Boundary: parser; Change or Decision: record; Dependency or Ordering: first; Reason: evidence.',
      ),
    ),
  ).toThrow('Acceptance or Proof');
});

test('rejects missing frontmatter, unsupported metadata, and unfinished sections', () => {
  expect(() => parseAidxPlan('# ROLE\nrole')).toThrow(
    'frontmatter is required',
  );
  expect(() =>
    parseAidxPlan(
      validPlan.replace(
        'status: "pending"',
        'unexpected: true\nstatus: "pending"',
      ),
    ),
  ).toThrow('unsupported field');
  expect(() =>
    parseAidxPlan(
      validPlan.replace('title: "Execute the parser refactor"', 'title: ""'),
    ),
  ).toThrow('frontmatter field is required');
  expect(() =>
    parseAidxPlan(
      validPlan.replace(
        'Principal developer infrastructure architect',
        '[role]',
      ),
    ),
  ).toThrow('unfinished item');
  expect(() =>
    parseAidxPlan(
      validPlan.replace(
        '- Do not invent missing requirements or edit files outside the approved scope.',
        '- [constraint]',
      ),
    ),
  ).toThrow('unfinished item');
  expect(() =>
    parseAidxPlan(
      validPlan
        .replace('# ROLE', '# ROLE\n\n')
        .replace('Principal developer infrastructure architect\n\n', ''),
    ),
  ).toThrow('section is required');
});
