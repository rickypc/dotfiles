import { expect, test } from 'bun:test';

import {
  createReceipt,
  failedCheckNames,
  receiptPasses,
  renderReceipt,
} from '../../../utils/quality-engine/receipt.js';

test('accepts passing and not-applicable checks', () => {
  const receipt = {
    checks: [
      { detail: 'clean', name: 'biome', status: 'passed' as const },
      { detail: 'JavaScript', name: 'tsc', status: 'not-applicable' as const },
    ],
    sourceFingerprint: 'abc',
    state: 'candidate_checked',
  };
  expect(receiptPasses(receipt)).toBeTrue();
  expect(failedCheckNames(receipt)).toEqual([]);
  expect(renderReceipt(receipt)).toContain('candidate_checked');
});

test('reports failed and blocked checks', () => {
  const receipt = {
    checks: [
      { detail: 'bad', name: 'matrix', status: 'failed' as const },
      { detail: 'ask user', name: 'scope', status: 'blocked' as const },
    ],
    sourceFingerprint: 'abc',
    state: 'candidate_checked',
  };
  expect(receiptPasses(receipt)).toBeFalse();
  expect(failedCheckNames(receipt)).toEqual(['matrix', 'scope']);
});

test('requires a fingerprint, state, and check for a created receipt', () => {
  expect(() =>
    createReceipt({ checks: [], sourceFingerprint: 'x', state: 's' }),
  ).toThrow('check');
  expect(() =>
    createReceipt({
      checks: [{ detail: 'd', name: 'n', status: 'passed' }],
      sourceFingerprint: '',
      state: 's',
    }),
  ).toThrow('fingerprint');
  expect(
    createReceipt({
      checks: [{ detail: 'd', name: 'n', status: 'passed' }],
      sourceFingerprint: 'x',
      state: 's',
    }).state,
  ).toBe('s');
});
