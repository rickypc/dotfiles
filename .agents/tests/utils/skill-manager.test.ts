import { expect, test } from 'bun:test';

import {
  createSkillManagerPacket,
  evaluateSkillMatrix,
  parseMatrixJsonl,
} from '../../utils/skill-manager.js';

test('creates a matrix-definition packet from the draft state', () => {
  const packet = createSkillManagerPacket({
    failedAssertionIds: [],
    intentId: 'improve-skill',
    state: 'draft',
    targetSkillPath: '/skills/example',
  });
  expect(packet.nextPhase).toBe('baseline');
  expect(packet.requiredActionGroups[0]?.requiredAssertionIds).toEqual([
    'matrix-definition',
  ]);
});

test('requires failed assertions and rejects a state without an action', () => {
  expect(() =>
    createSkillManagerPacket({
      failedAssertionIds: [],
      intentId: 'improve-skill',
      state: 'candidate_requested',
      targetSkillPath: '/skills/example',
    }),
  ).toThrow('At least one failed assertion');
  expect(() =>
    createSkillManagerPacket({
      failedAssertionIds: ['case-a'],
      intentId: 'improve-skill',
      state: 'accepted',
      targetSkillPath: '/skills/example',
    }),
  ).toThrow('No Skill Manager action packet');
});

test.each(['candidate_requested', 'candidate_checked'] as const)(
  'creates an evaluation packet for %s',
  (state) => {
    const packet = createSkillManagerPacket({
      failedAssertionIds: ['scope'],
      intentId: 'improve-skill',
      state,
      targetSkillPath: '/skills/example',
    });
    expect(packet.nextPhase).toBe('evaluate');
    expect(packet.requiredActionGroups[0]?.title).toContain('Repair');
  },
);

test('parses and evaluates a frozen candidate and challenge matrix', () => {
  const matrix = parseMatrixJsonl(
    [
      JSON.stringify({
        assertions: [{ expected: 'required', kind: 'required-text' }],
        failureMode: 'missing',
        id: 'candidate',
        repairBoundary: '/skill',
        scenario: 'content',
        visibility: 'candidate',
      }),
      JSON.stringify({
        assertions: [{ expected: 'secret', kind: 'forbidden-text' }],
        failureMode: 'leak',
        id: 'challenge',
        repairBoundary: '/skill',
        scenario: 'safety',
        visibility: 'challenge',
      }),
    ].join('\n'),
  );
  expect(
    evaluateSkillMatrix(
      matrix,
      { delegatedChecks: {}, ownedFiles: new Set(), text: 'required' },
      'f',
      'candidate_checked',
    ).checks[0]?.status,
  ).toBe('passed');
  expect(
    evaluateSkillMatrix(
      matrix,
      { delegatedChecks: {}, ownedFiles: new Set(), text: 'safe' },
      'f',
      'challenge_checked',
    ).checks[0]?.status,
  ).toBe('passed');
  expect(() => parseMatrixJsonl('{')).toThrow('line 1');
});
