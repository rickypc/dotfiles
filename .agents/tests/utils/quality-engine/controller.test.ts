import { expect, test } from 'bun:test';

import {
  decideBaseline,
  decideCandidate,
  decideChallenge,
} from '../../../utils/quality-engine/controller.js';

const passingReceipt = {
  checks: [{ detail: 'clean', name: 'matrix', status: 'passed' as const }],
  matrixFingerprint: 'matrix',
  sourceFingerprint: 'candidate',
  state: 'candidate_checked',
};

const failingReceipt = {
  checks: [{ detail: 'missing', name: 'matrix', status: 'failed' as const }],
  matrixFingerprint: 'matrix',
  sourceFingerprint: 'candidate',
  state: 'candidate_checked',
};

test('sends a passing candidate to challenge', () => {
  expect(
    decideCandidate({
      attempt: 1,
      attemptBudget: 2,
      baselineSourceFingerprint: 'baseline',
      matrixFingerprint: 'matrix',
      receipt: passingReceipt,
      state: 'candidate_submitted',
    }),
  ).toEqual({ nextState: 'candidate_checked', nextStep: 'challenge' });
});

test('repairs before budget exhaustion and rejects at the budget', () => {
  expect(
    decideCandidate({
      attempt: 1,
      attemptBudget: 2,
      baselineSourceFingerprint: 'baseline',
      matrixFingerprint: 'matrix',
      receipt: failingReceipt,
      state: 'candidate_submitted',
    }),
  ).toEqual({ nextState: 'candidate_requested', nextStep: 'repair' });
  expect(
    decideCandidate({
      attempt: 2,
      attemptBudget: 2,
      baselineSourceFingerprint: 'baseline',
      matrixFingerprint: 'matrix',
      receipt: failingReceipt,
      state: 'candidate_submitted',
    }),
  ).toEqual({ nextState: 'rejected', nextStep: 'reject' });
});

test('rejects an attempt outside the approved budget', () => {
  expect(() =>
    decideCandidate({
      attempt: 0,
      attemptBudget: 2,
      baselineSourceFingerprint: 'baseline',
      matrixFingerprint: 'matrix',
      receipt: passingReceipt,
      state: 'candidate_submitted',
    }),
  ).toThrow('outside');
});

test('gates baseline and challenge receipts by their exact lifecycle phase', () => {
  expect(decideBaseline({ ...passingReceipt, state: 'baseline_recorded' })).toEqual({
    nextState: 'candidate_requested',
    nextStep: 'candidate',
  });
  expect(decideBaseline({ ...failingReceipt, state: 'baseline_recorded' })).toEqual({
    nextState: 'blocked',
    nextStep: 'block',
  });
  expect(() => decideBaseline(passingReceipt)).toThrow('baseline');
  expect(
    decideChallenge({
      expectedMatrixFingerprint: 'matrix',
      expectedSourceFingerprint: 'candidate',
      receipt: { ...passingReceipt, state: 'challenge_checked' },
    }),
  ).toEqual({ nextState: 'accepted', nextStep: 'accept' });
  expect(
    decideChallenge({
      expectedMatrixFingerprint: 'matrix',
      expectedSourceFingerprint: 'candidate',
      receipt: { ...failingReceipt, state: 'challenge_checked' },
    }),
  ).toEqual({ nextState: 'blocked', nextStep: 'block' });
  expect(() =>
    decideChallenge({
      expectedMatrixFingerprint: 'matrix',
      expectedSourceFingerprint: 'candidate',
      receipt: passingReceipt,
    }),
  ).toThrow('challenge');
});

test('rejects candidate evidence that drifts from the frozen matrix or baseline', () => {
  expect(() =>
    decideCandidate({
      attempt: 1,
      attemptBudget: 2,
      baselineSourceFingerprint: 'baseline',
      matrixFingerprint: 'other-matrix',
      receipt: passingReceipt,
      state: 'candidate_submitted',
    }),
  ).toThrow('matrix fingerprint');
  expect(() =>
    decideCandidate({
      attempt: 1,
      attemptBudget: 2,
      baselineSourceFingerprint: 'candidate',
      matrixFingerprint: 'matrix',
      receipt: passingReceipt,
      state: 'candidate_submitted',
    }),
  ).toThrow('differ');
});

test('rejects challenge evidence that does not match the candidate', () => {
  expect(() =>
    decideChallenge({
      expectedMatrixFingerprint: 'other-matrix',
      expectedSourceFingerprint: 'candidate',
      receipt: { ...passingReceipt, state: 'challenge_checked' },
    }),
  ).toThrow('candidate evidence');
});
