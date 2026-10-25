import { expect, mock, test } from 'bun:test';
import * as realContracts from '../../../utils/contracts.js';
import type { MatrixCase } from '../../../utils/quality-engine/matrix.js';
import * as realMatrix from '../../../utils/quality-engine/matrix.js';

mock.module('../contracts.js', () => realContracts);
mock.module('./matrix.js', () => realMatrix);

const { isMatrixVerifierId, runIndependentVerifier } = await import(
  '../../../utils/quality-engine/verifier.js'
);

const matrixCase: MatrixCase = {
  assertions: [{ expected: 'Use the skill', kind: 'required-text' }],
  failureMode: 'missing instruction',
  id: 'source',
  independentVerifier: 'source-structure',
  repairBoundary: 'SKILL.md',
  scenario: 'skill has an explicit trigger',
  visibility: 'candidate',
};

test('runs a fixed in-process source verifier', () => {
  expect(isMatrixVerifierId('source-structure')).toBe(true);
  expect(
    runIndependentVerifier(matrixCase, {
      delegatedChecks: {},
      ownedFiles: new Set(),
      text: '---\nname: example\ndescription: test\n---\nUse the skill.',
    }),
  ).toMatchObject({ status: 'passed' });
});

test.each([
  {
    assertions: [],
    expected: 'failed',
    failureMode: 'missing assertion',
    repairBoundary: 'cases.jsonl',
    scenario: 'empty assertions',
  },
  {
    assertions: [{ expected: 'required', kind: 'required-text' }],
    expected: 'failed',
    failureMode: 'missing failure mode',
    repairBoundary: 'cases.jsonl',
    scenario: '  ',
  },
  {
    assertions: [{ expected: 'required', kind: 'required-text' }],
    expected: 'passed',
    failureMode: 'missing failure mode',
    repairBoundary: 'cases.jsonl',
    scenario: 'complete shape',
  },
] as const)('verifies matrix shape partitions', (row) => {
  expect(
    runIndependentVerifier(
      {
        ...matrixCase,
        assertions: row.assertions,
        failureMode: row.failureMode,
        independentVerifier: 'matrix-shape',
        repairBoundary: row.repairBoundary,
        scenario: row.scenario,
      },
      { delegatedChecks: {}, ownedFiles: new Set(), text: '' },
    ),
  ).toMatchObject({ status: row.expected });
});

test('rejects an unknown verifier without executing a command', () => {
  expect(isMatrixVerifierId('shell-command')).toBe(false);
  expect(
    runIndependentVerifier(
      { ...matrixCase, independentVerifier: 'shell-command' as never },
      { delegatedChecks: {}, ownedFiles: new Set(), text: '' },
    ),
  ).toMatchObject({ status: 'blocked' });
});

test('fails a source whose frontmatter starts the text but lacks name and description', () => {
  expect(
    runIndependentVerifier(matrixCase, {
      delegatedChecks: {},
      ownedFiles: new Set(),
      text: '---\nnotes: only\n---\nUse the skill.',
    }),
  ).toMatchObject({
    detail: 'Source must have valid name/description frontmatter and instructions.',
    status: 'failed',
  });
});
