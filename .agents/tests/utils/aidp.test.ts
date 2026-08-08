import { expect, mock, test } from 'bun:test';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';

mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));

const {
  cbmIndexForProject,
  derivePlanSummary,
  planPathFor,
  relativePlanPathFor,
  renderPlanHandoff,
  renderAidpPlan,
  resolveProjectRoot,
  slugifyPlanSummary,
  validatePlanFrontmatter,
} = await import('../../utils/aidp.js');

const template = `---
title: "Brief Title"
cbm_index: "demo"
created_at: "2026-08-07"
updated_at: "2026-08-07"
status: "pending"
---

# ROLE
[role]

# OBJECTIVE
[objective]

# CORE DIRECTIVES
- [directive]

# EXECUTION STEPS
1. [step]

# CONSTRAINTS
- [constraint]

# INPUTS TO PROCESS
- [input]
`;

test('slugifies summaries and keeps plan paths inside the relative plans route', () => {
  expect(slugifyPlanSummary('Refactor YAML Frontmatter / Planner')).toBe(
    'refactor-yaml-frontmatter-planner',
  );
  const path = planPathFor('/tmp/project', 'Users-demo', 'A plan summary');
  expect(relativePlanPathFor('/tmp/project', path)).toBe(
    '.agents/plans/Users-demo/a-plan-summary.md',
  );
});

test('derives project CBM indexes without using temporary paths', () => {
  expect(cbmIndexForProject('/workspace/example-app')).toBe(
    'workspace-example-app',
  );
  expect(cbmIndexForProject('/workspace')).toBe('workspace');
  expect(cbmIndexForProject('/workspace/example-app', '/private/tmp')).toBe(
    'workspace-example-app',
  );
  expect(() =>
    cbmIndexForProject('/private/tmp/project', '/private/tmp'),
  ).toThrow('temporary path');
});

test('resolves explicit project context and generates a request-derived summary', () => {
  expect(resolveProjectRoot('/workspace', '/workspace/example-app')).toBe(
    '/workspace/example-app',
  );
  expect(
    derivePlanSummary(
      'Correct AIDP routing and direct AIDX handoff without temporary discovery.',
      '/workspace/example-app',
    ),
  ).toBe(
    'Correct AIDP routing and direct AIDX handoff without temporary discovery.',
  );
  expect(derivePlanSummary('###', '/workspace/example-app')).toBe(
    'Plan for example-app',
  );
});

test('renders the clickable absolute link and fenced relative AIDX command', () => {
  expect(
    renderPlanHandoff(
      '/workspace/example-app',
      '/workspace/example-app/.agents/plans/workspace-example-app/fix-routing.md',
    ),
  ).toBe(
    '[fix-routing.md](/workspace/example-app/.agents/plans/workspace-example-app/fix-routing.md)\n\n```plaintext\n/aidx .agents/plans/workspace-example-app/fix-routing.md\n```',
  );
});

test('renders every template section and replaces all placeholders', () => {
  const rendered = renderAidpPlan(template, {
    cbmIndex: 'Users-demo',
    constraints: ['Do not edit runtime configuration.'],
    coreDirectives: [
      'Preserve the public command contract.',
      'Stop on unresolved ambiguity.',
    ],
    createdAt: '2026-08-07',
    executionSteps: [
      'Inspect the existing parser and record the exact consumers before changing the implementation.',
      'Run focused validation and retain the receipt beside the changed plan artifact.',
    ],
    inputsToProcess: ['.agents/skills/aidp/template.md'],
    objective: 'Persist one detailed implementation plan for later execution.',
    role: 'Principal developer infrastructure architect',
    status: 'pending',
    summary: 'Refactor YAML planner',
    updatedAt: '2026-08-07',
  });
  expect(rendered).toContain('cbm_index: Users-demo');
  expect(rendered).toContain('# EXECUTION STEPS');
  expect(rendered).toContain('Inspect the existing parser');
  expect(rendered).not.toContain('[role]');
});

test('rejects incomplete list content instead of guessing missing requirements', () => {
  expect(() =>
    renderAidpPlan(template, {
      cbmIndex: 'Users-demo',
      constraints: ['Keep the change scoped.'],
      coreDirectives: ['Only one directive.'],
      createdAt: '2026-08-07',
      executionSteps: ['too short'],
      inputsToProcess: ['source file'],
      objective: 'An objective.',
      role: 'An explicit role.',
      status: 'pending',
      summary: 'A valid summary',
      updatedAt: '2026-08-07',
    }),
  ).toThrow('granular');
});

test('rejects empty, placeholder, unsafe, and malformed planner inputs', () => {
  const completeInput = {
    cbmIndex: 'Users-demo',
    constraints: ['Keep the change scoped.'],
    coreDirectives: [
      'Preserve the public command contract.',
      'Stop on ambiguity.',
    ],
    createdAt: '2026-08-07',
    executionSteps: [
      'Inspect the current parser and record every consumer before editing the implementation.',
    ],
    inputsToProcess: ['The approved plan.'],
    objective: 'Persist one detailed implementation plan.',
    role: 'Principal developer infrastructure architect',
    status: 'pending',
    summary: 'Valid planner input',
    updatedAt: '2026-08-07',
  };
  expect(() =>
    renderAidpPlan(template, { ...completeInput, role: '' }),
  ).toThrow('cannot be empty');
  expect(() =>
    renderAidpPlan(template, { ...completeInput, role: '[The role]' }),
  ).toThrow('placeholder');
  expect(() =>
    renderAidpPlan(template, { ...completeInput, constraints: [] }),
  ).toThrow('requires at least');
  expect(() =>
    renderAidpPlan(template.replace('# ROLE', '# WRONG'), completeInput),
  ).toThrow('Template section is missing');
  expect(() =>
    planPathFor('/tmp/project', 'unsafe/index', 'Valid summary'),
  ).toThrow('relative path segment');
  expect(() =>
    relativePlanPathFor('/tmp/project', '/tmp/project/source.md'),
  ).toThrow('.agents/plans');
  expect(() => slugifyPlanSummary('!!!')).toThrow('letters or numbers');
  validatePlanFrontmatter(
    '---\ntitle: Valid\ncbm_index: demo\ncreated_at: today\nupdated_at: today\nstatus: pending\n---\n',
  );
  expect(() =>
    validatePlanFrontmatter('---\ntitle: Missing\nstatus: pending\n---\n'),
  ).toThrow('exactly the required YAML fields');
});
