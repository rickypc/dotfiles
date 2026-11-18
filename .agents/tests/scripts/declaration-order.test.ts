import { expect, mock, test } from 'bun:test';
import { command, createCommand } from '../../scripts/declaration-order.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const commandFor = (read: (path: string) => Promise<string>, save = mock(async () => undefined)) =>
  createCommand({ read, save });

const makeContext = () => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  return { context, out };
};

const ordered = 'function alpha() {}\nfunction zebra() {}';
const unordered = 'function zebra() {}\nfunction alpha() {}';
const cycle = 'function beta() { return alpha(); }\nfunction alpha() { return beta(); }';

test('renders declaration-order evidence for canonical source', async () => {
  const { context, out } = makeContext();
  expect(
    await runCommand(
      commandFor(async () => ordered),
      ['file.ts'],
      context,
    ),
  ).toBe(0);
  const envelope = JSON.parse(out[0] ?? '');
  expect(envelope.data.checks[0].status).toBe('passed');
  expect(envelope.data.checks[0].actionPacket).toBeNull();
});

test('renders a concise gate summary and only the failed checks', async () => {
  const passing = makeContext();
  expect(
    await runCommand(
      commandFor(async () => ordered),
      ['--summary', 'a.ts', 'b.ts', '--format', 'text'],
      passing.context,
    ),
  ).toBe(0);
  expect(passing.out).toEqual(['declaration-order: passed - 2 file(s) checked.']);
  const failing = makeContext();
  const read = async (path: string) => (path === 'a.ts' ? ordered : unordered);
  expect(
    await runCommand(
      commandFor(read),
      ['--summary', 'a.ts', 'b.ts', '--format', 'text'],
      failing.context,
    ),
  ).toBe(1);
  const text = failing.out.join('\n');
  expect(text).toContain('declaration-order: failed - 1 of 2 file(s)');
  expect(text).toContain('"errors"');
  expect(text).not.toContain('"path": "a.ts"');
});

test('keeps the action packet in the failure envelope data and exits 1', async () => {
  const { context, out } = makeContext();
  expect(
    await runCommand(
      commandFor(async () => unordered),
      ['file.ts'],
      context,
    ),
  ).toBe(1);
  const envelope = JSON.parse(out[0] ?? '');
  expect(envelope.ok).toBe(false);
  expect(envelope.diagnostics).toEqual([
    'Declaration ordering requires the emitted action packet.',
  ]);
  expect(envelope.data.checks[0].actionPacket.requiredActionGroups[0].title).toBe(
    'Reorder runtime declarations as alpha, zebra.',
  );
});

test('emits a blocked result without authorizing an unsafe reorder', async () => {
  const { context, out } = makeContext();
  expect(
    await runCommand(
      commandFor(async () => cycle),
      ['cycle.ts'],
      context,
    ),
  ).toBe(1);
  const envelope = JSON.parse(out[0] ?? '');
  expect(envelope.diagnostics[0]).toContain('blocked by the reported dependency');
  expect(envelope.data.checks[0].status).toBe('blocked');
  expect(envelope.data.checks[0].actionPacket).toBeNull();
});

test('supports a fresh-session repair loop from baseline to passing candidate', async () => {
  let source = unordered;
  const baseline = makeContext();
  expect(
    await runCommand(
      commandFor(async () => source),
      ['session.ts'],
      baseline.context,
    ),
  ).toBe(1);
  source = ordered;
  const candidate = makeContext();
  expect(
    await runCommand(
      commandFor(async () => source),
      ['session.ts'],
      candidate.context,
    ),
  ).toBe(0);
  expect(JSON.parse(candidate.out[0] ?? '').data.checks[0].status).toBe('passed');
});

test('applies a safe action packet only when explicitly requested', async () => {
  const save = mock(async () => undefined);
  const { context, out } = makeContext();
  expect(
    await runCommand(
      commandFor(async () => unordered, save),
      ['--apply', 'session.ts'],
      context,
    ),
  ).toBe(0);
  expect(save).toHaveBeenCalledWith('session.ts', 'function alpha() {}\n\nfunction zebra() {}');
  expect(JSON.parse(out[0] ?? '').data.checks[0].status).toBe('passed');
});

test('never applies more than one file in a mutation request', async () => {
  const save = mock(async () => undefined);
  const { context, out } = makeContext();
  expect(
    await runCommand(
      commandFor(async () => ordered, save),
      ['--apply', 'one.ts', 'two.ts'],
      context,
    ),
  ).toBe(2);
  expect(save).not.toHaveBeenCalled();
  expect(JSON.parse(out[0] ?? '').diagnostics[0]).toContain('accepts exactly one file');
});

test('rejects unknown flags and a missing path with usage exit 2', async () => {
  const read = async () => ordered;
  expect(await runCommand(commandFor(read), ['--unknown', 'file.ts'], makeContext().context)).toBe(
    2,
  );
  expect(await runCommand(commandFor(read), [], makeContext().context)).toBe(2);
});

test('answers --help with the usage text and uses the real reader by default', async () => {
  const help = makeContext();
  expect(await runCommand(command, ['--help'], help.context)).toBe(0);
  expect(help.out[0]).toContain('declaration-order.ts');
  const real = makeContext();
  expect(await runCommand(command, ['tests/scripts/declaration-order.test.ts'], real.context)).toBe(
    0,
  );
});

test('renders the checks as JSON in the text view without --summary', async () => {
  const { context, out } = makeContext();
  await runCommand(
    commandFor(async () => ordered),
    ['file.ts', '--format', 'text'],
    context,
  );
  expect(JSON.parse(out[0] ?? '').checks[0].status).toBe('passed');
});
