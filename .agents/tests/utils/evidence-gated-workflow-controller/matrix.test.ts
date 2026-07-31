import { expect, test } from 'bun:test';

import {
  casesFor,
  evaluateMatrix,
  type MatrixCase,
  validateMatrix,
} from '../../../utils/evidence-gated-workflow-controller/matrix.js';

const candidateCase: MatrixCase = {
  assertions: [{ expected: 'Use the skill', kind: 'required-text' }],
  failureMode: 'missing instruction',
  id: 'scope',
  repairBoundary: 'SKILL.md only',
  scenario: 'skill has an explicit trigger',
  visibility: 'candidate',
};

test('validates a typed matrix and selects by visibility', () => {
  const challengeCase = {
    ...candidateCase,
    id: 'challenge',
    visibility: 'challenge' as const,
  };
  expect(() => validateMatrix([candidateCase, challengeCase])).not.toThrow();
  expect(casesFor([candidateCase, challengeCase], 'challenge')).toEqual([
    challengeCase,
  ]);
});
test('rejects empty, duplicate, incomplete, and invalid matrix cases', () => {
  expect(() => validateMatrix([])).toThrow('At least one');
  expect(() => validateMatrix([candidateCase, candidateCase])).toThrow(
    'unique',
  );
  expect(() =>
    validateMatrix([{ ...candidateCase, assertions: [], scenario: ' ' }]),
  ).toThrow('incomplete');
  expect(() =>
    validateMatrix([
      {
        ...candidateCase,
        assertions: [{ expected: '', kind: 'required-text' }],
      },
    ]),
  ).toThrow('invalid');
});

test('evaluates every typed assertion from independent evidence', () => {
  const checks = evaluateMatrix(
    [
      {
        ...candidateCase,
        assertions: [
          { expected: 'Use this skill', kind: 'required-text' },
          { expected: 'SkillOpt', kind: 'forbidden-text' },
          { expected: 'references/rules.md', kind: 'owned-file' },
          { expected: 'name: example', kind: 'frontmatter' },
          { expected: 'biome', kind: 'delegated-gate' },
        ],
      },
    ],
    {
      delegatedChecks: {
        biome: { detail: 'clean', name: 'biome', status: 'passed' },
      },
      ownedFiles: new Set(['references/rules.md']),
      text: '---\nname: example\n---\nUse this skill now.',
    },
  );
  expect(checks.map((check) => check.status)).toEqual([
    'passed',
    'passed',
    'passed',
    'passed',
    'passed',
  ]);
});

test('reports failed or blocked evidence without trusting the matrix author', () => {
  const checks = evaluateMatrix(
    [
      {
        ...candidateCase,
        assertions: [
          { expected: 'required', kind: 'required-text' },
          { expected: 'forbidden', kind: 'forbidden-text' },
          { expected: 'missing.md', kind: 'owned-file' },
          { expected: 'name: example', kind: 'frontmatter' },
          { expected: 'missing-gate', kind: 'delegated-gate' },
        ],
      },
    ],
    { delegatedChecks: {}, ownedFiles: new Set(), text: 'forbidden' },
  );
  expect(checks.map((check) => check.status)).toEqual([
    'failed',
    'failed',
    'failed',
    'failed',
    'blocked',
  ]);
});
