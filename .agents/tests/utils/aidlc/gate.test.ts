import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  defaultFinalGate,
  finalGateFor,
  finalGateReceipt,
  parseAidlcGateConfig,
  resolveFinalGate,
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

test('resolves one configured gate from an absolute project root', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'aidlc-gate-'));
  try {
    writeFileSync(
      join(projectRoot, 'aidlc.config.json'),
      '{"finalGate":"go test ./..."}',
    );
    expect(resolveFinalGate(projectRoot)).toBe('go test ./...');
    expect(resolveFinalGate('/a-project-without-a-config')).toBe(
      'bun run test',
    );
    expect(() => resolveFinalGate('relative')).toThrow('absolute project root');
  } finally {
    rmSync(projectRoot, { force: true, recursive: true });
  }
});
