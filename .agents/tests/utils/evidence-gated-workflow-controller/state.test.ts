import { expect, test } from 'bun:test';

import {
  isTerminal,
  transition,
} from '../../../utils/evidence-gated-workflow-controller/state.js';

test('moves across legal workflow transitions', () => {
  expect(transition('draft', 'matrix_ready')).toBe('matrix_ready');
  expect(transition('candidate_submitted', 'candidate_passed')).toBe(
    'candidate_checked',
  );
  expect(transition('challenge_checked', 'challenge_passed')).toBe('accepted');
  expect(isTerminal('accepted')).toBeTrue();
  expect(isTerminal('blocked')).toBeFalse();
});

test('rejects illegal and unsafe resume transitions', () => {
  expect(() => transition('draft', 'challenge_passed')).toThrow(
    'Illegal workflow transition',
  );
  expect(() => transition('blocked', 'resume')).toThrow('resume state');
  expect(() => transition('blocked', 'resume', 'accepted')).toThrow(
    'non-terminal',
  );
  expect(transition('blocked', 'resume', 'candidate_checked')).toBe(
    'candidate_checked',
  );
});
