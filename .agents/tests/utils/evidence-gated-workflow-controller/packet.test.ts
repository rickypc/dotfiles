import { expect, test } from 'bun:test';

import {
  createActionPacket,
  fingerprint,
  renderActionPacket,
} from '../../../utils/evidence-gated-workflow-controller/packet.js';

const actionGroup = {
  allowedPaths: ['/skill/SKILL.md'],
  id: 'candidate-edit',
  requiredAssertionIds: ['scope'],
  title: 'Repair scope',
};

const input = {
  forbiddenActions: ['change matrix'],
  intentId: 'repair-skill',
  knownUserQuestions: [],
  nextPhase: 'evaluate',
  packetId: 'repair-skill-candidate',
  requiredActionGroups: [actionGroup],
  state: 'candidate_requested' as const,
};

test('creates a stable packet fingerprint and renders JSON', () => {
  const first = createActionPacket(input);
  const second = createActionPacket(input);
  expect(first.packetFingerprint).toBe(second.packetFingerprint);
  expect(renderActionPacket(first)).toContain('candidate-edit');
  expect(fingerprint('source')).toHaveLength(64);
});

test('rejects incomplete packet identities and groups', () => {
  expect(() => createActionPacket({ ...input, intentId: ' ' })).toThrow(
    'identity',
  );
  expect(() =>
    createActionPacket({ ...input, requiredActionGroups: [] }),
  ).toThrow('At least one action group');
  expect(() =>
    createActionPacket({
      ...input,
      requiredActionGroups: [
        { ...actionGroup, id: '', requiredAssertionIds: [] },
      ],
    }),
  ).toThrow('Action group');
});
