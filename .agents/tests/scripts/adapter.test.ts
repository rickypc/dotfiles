import { expect, test } from 'bun:test';
import { command } from '../../scripts/adapter.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const exec = async (args: readonly string[]) => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  return { code: await runCommand(command, [...args, '--format', 'text'], context), out };
};

test.each([
  ['codex', 'Codex'],
  ['kiro-ide', 'Kiro IDE'],
  ['vscode', 'VS Code'],
])('renders the %s manual adapter handoff', async (assistant, label) => {
  const { code, out } = await exec([assistant, '/agents']);
  expect(code).toBe(0);
  expect(out[0]).toContain(label);
});

test('prints the handoff as the envelope data by default', async () => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  await runCommand(command, ['codex', '/agents'], context);
  expect(JSON.parse(out[0] ?? '').data).toContain('Codex');
});

test('rejects an unknown assistant or wrong arity with usage exit 2', async () => {
  expect((await exec(['nope', '/agents'])).code).toBe(2);
  expect((await exec([])).code).toBe(2);
  expect((await exec(['codex'])).code).toBe(2);
});

test('answers --help', async () => {
  const { code, out } = await exec(['--help']);
  expect(code).toBe(0);
  expect(out[0]).toContain('scripts/adapter.ts');
});
