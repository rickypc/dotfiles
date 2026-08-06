import { expect, mock, test } from 'bun:test';
import * as nodeChildProcess from 'node:child_process';
import * as nodeFs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as nodeFsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { join } from 'node:path';

mock.module('node:child_process', () => nodeChildProcess);
mock.module('node:fs', () => nodeFs);
mock.module('node:fs/promises', () => nodeFsPromises);
mock.module('node:path', () => nodePath);

import {
  aidxConfigJsonPathFor,
  defaultFinalGate,
  executeFinalGate,
  finalGateFor,
  finalGateReceipt,
  gateDiagnosticsFor,
  resolveFinalGate,
} from '../../utils/final-gate.js';

test('uses the explicit camelCase finalGate or the default command', () => {
  expect(finalGateFor({})).toBe(defaultFinalGate);
  expect(finalGateFor({ finalGate: 'bun test ./src' })).toBe('bun test ./src');
  expect(finalGateFor({ finalGate: '  ' })).toBe(defaultFinalGate);
});

test('uses the canonical compact AIDX JSON configuration path', () => {
  expect(aidxConfigJsonPathFor('/tmp/project')).toBe('/tmp/project/aidx.json');
});

test('returns an observable result from the injected gate executor', () => {
  const result = executeFinalGate('/tmp/project', 'bun run test', () => ({
    output: [null, Buffer.from('ok\n'), Buffer.from('')],
    pid: 1,
    signal: null,
    status: 0,
    stderr: Buffer.from(''),
    stdout: Buffer.from('ok\n'),
  }));
  expect(result).toEqual({
    diagnostics: [],
    exitCode: 0,
    gate: 'bun run test',
    receipt: 'final gate: bun run test passed (exit 0)',
  });
});

test('preserves failure diagnostics in the gate receipt', () => {
  const diagnostics = gateDiagnosticsFor(
    'error: declaration order\ncoverage: 99%\n',
  );
  expect(diagnostics).toEqual(['error: declaration order', 'coverage: 99%']);
  expect(finalGateReceipt('bun run test', 1, diagnostics)).toContain(
    'declaration order',
  );
});

test('resolves the JSON config or the default command', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'aidx-final-gate-'));
  const configuredPath = join(projectRoot, 'aidx.json');
  try {
    expect(await resolveFinalGate(projectRoot)).toEqual({
      command: defaultFinalGate,
      configPath: configuredPath,
      source: 'default',
    });
    writeFileSync(configuredPath, '{"finalGate":"bun test"}\n');
    expect(await resolveFinalGate(projectRoot)).toEqual({
      command: 'bun test',
      configPath: configuredPath,
      source: 'aidx-config-json',
    });
  } finally {
    rmSync(projectRoot, { force: true, recursive: true });
  }
});

test('reports invalid project roots and invalid JSON config values', async () => {
  await expect(resolveFinalGate('relative')).rejects.toThrow(
    'absolute project root',
  );
  const projectRoot = mkdtempSync(join(tmpdir(), 'aidx-invalid-gate-'));
  try {
    writeFileSync(join(projectRoot, 'aidx.json'), '[]\n');
    await expect(resolveFinalGate(projectRoot)).rejects.toThrow(
      'must contain an object',
    );
  } finally {
    rmSync(projectRoot, { force: true, recursive: true });
  }
  const loadErrorRoot = mkdtempSync(join(tmpdir(), 'aidx-invalid-json-'));
  try {
    writeFileSync(join(loadErrorRoot, 'aidx.json'), '{\n');
    await expect(resolveFinalGate(loadErrorRoot)).rejects.toThrow(
      'file could not be loaded',
    );
  } finally {
    rmSync(loadErrorRoot, { force: true, recursive: true });
  }
});

test('returns a failed result when the injected executor has no status', () => {
  expect(
    executeFinalGate('/tmp/project', 'bun run test', () => ({
      output: [],
      pid: 1,
      signal: null,
      status: null,
      stderr: Buffer.from('error: command failed\n'),
      stdout: Buffer.from(''),
    })),
  ).toMatchObject({
    diagnostics: ['error: command failed'],
    exitCode: 1,
    receipt:
      'final gate: bun run test failed (exit 1); diagnostics: error: command failed',
  });
});
