import { expect, test } from 'bun:test';

import {
  parseIntent,
  renderIntent,
} from '../../../utils/evidence-gated-workflow-controller/intent.js';

test('renders and parses the minimal persisted intent', () => {
  const intent = {
    attempt: 1,
    attemptBudget: 2,
    intentId: 'repair-skill',
    matrixFingerprint: 'frozen',
    state: 'candidate_requested' as const,
    target: '/skills/example/SKILL.md',
  };
  expect(parseIntent(renderIntent(intent))).toEqual(intent);
});

test('rejects malformed intent frontmatter', () => {
  expect(() => parseIntent('not frontmatter')).toThrow('frontmatter');
  expect(() =>
    parseIntent(
      renderIntent({
        attempt: 2,
        attemptBudget: 1,
        intentId: 'bad',
        matrixFingerprint: 'f',
        state: 'draft',
        target: '/target',
      }),
    ),
  ).toThrow('attempt');
  expect(() =>
    parseIntent(
      renderIntent({
        attempt: 1,
        attemptBudget: 2,
        intentId: 'bad-type',
        matrixFingerprint: 'f',
        state: 'draft',
        target: '/target',
      }).replace('attempt: 1', 'attempt: one'),
    ),
  ).toThrow('frontmatter');
  expect(() =>
    parseIntent(
      renderIntent({
        attempt: 1,
        attemptBudget: 2,
        intentId: 'bad-string',
        matrixFingerprint: 'f',
        state: 'draft',
        target: '/target',
      }).replace('target: /target', "target: ''"),
    ),
  ).toThrow('frontmatter');
});

test('parses valid intent metadata regardless of frontmatter field order', () => {
  expect(
    parseIntent(
      [
        '---',
        'state: candidate_requested',
        'attempt_budget: 2',
        'matrix_fingerprint: frozen',
        'target: /skills/example/SKILL.md',
        'intent_id: repair-skill',
        'attempt: 1',
        '---',
        '',
        '# repair-skill',
      ].join('\n'),
    ),
  ).toEqual({
    attempt: 1,
    attemptBudget: 2,
    intentId: 'repair-skill',
    matrixFingerprint: 'frozen',
    state: 'candidate_requested',
    target: '/skills/example/SKILL.md',
  });
});
