import { expect, test } from 'bun:test';

import {
  defaultFinalGate,
  finalGateFor,
  finalGateReceipt,
  parseAidlcGateConfig,
} from '../../../utils/aidlc/gate.js';

test('uses one configured project gate or the universal default', () => {
  expect(finalGateFor({})).toBe(defaultFinalGate);
  expect(finalGateFor({ finalGate: 'phpunit' })).toBe('phpunit');
  expect(parseAidlcGateConfig('{"finalGate":"go test ./..."}')).toEqual({
    finalGate: 'go test ./...',
  });
  expect(() => parseAidlcGateConfig('{')).toThrow('valid JSON');
  expect(() => parseAidlcGateConfig('{"finalGate":[]}')).toThrow('string');
});

test('renders an unambiguous final-gate receipt', () => {
  expect(finalGateReceipt('bun run test', 0)).toBe(
    'final gate: bun run test passed (exit 0)',
  );
  expect(finalGateReceipt('go test ./...', 1)).toContain('failed');
});
