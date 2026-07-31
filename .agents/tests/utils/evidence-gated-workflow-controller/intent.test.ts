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
});
