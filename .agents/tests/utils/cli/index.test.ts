import { describe, expect, mock, test } from 'bun:test';

import type { CliContext } from '../../../utils/cli/context.js';
import type { CommandDeclaration } from '../../../utils/cli/declaration.js';
import { CliError } from '../../../utils/cli/errors.js';
import { runCommand, runMain } from '../../../utils/cli/index.js';
import { UsageError } from '../../../utils/cli/usage-error.js';

const makeContext = (
  entries: readonly { isDirectory: boolean; name: string }[] = [
    { isDirectory: true, name: 'skills' },
  ],
) => {
  const out: string[] = [];
  const err: string[] = [];
  const codes: number[] = [];
  const context: CliContext = {
    listDirectory: async () => entries,
    readStdin: async () => 'stdin',
    setExitCode: (code) => codes.push(code),
    write: (message) => out.push(message),
    writeError: (message) => err.push(message),
  };
  return { codes, context, err, out };
};

const base = {
  arity: [1, 1] as const,
  positionals: '<value>',
  script: 'scripts/echo.ts',
  summary: 'Echo.',
};

const declaration: CommandDeclaration<{ echoed: readonly string[] }> = {
  ...base,
  renderText: (data) => data.echoed.join(','),
  run: (input) => ({ echoed: input.positionals }),
};

describe('runCommand', () => {
  test('prints a success envelope as JSON and returns exit 0', async () => {
    const { codes, context, out } = makeContext();
    expect(await runCommand(declaration, ['hi'], context)).toBe(0);
    expect(JSON.parse(out[0] ?? '')).toEqual({
      command: 'scripts/echo.ts',
      data: { echoed: ['hi'] },
      diagnostics: [],
      exitCode: 0,
      ok: true,
    });
    expect(codes).toEqual([0]);
  });

  test('renders the human view with --format text', async () => {
    const { context, out } = makeContext();
    await runCommand(declaration, ['hi', '--format', 'text'], context);
    expect(out).toEqual(['hi']);
  });

  test('prints raw usage for --help, -h, and --usage without running', async () => {
    const run = mock(() => ({ echoed: [] as string[] }));
    for (const flag of ['--help', '-h', '--usage']) {
      const { codes, context, out } = makeContext();
      expect(await runCommand({ ...declaration, run }, [flag], context)).toBe(0);
      expect(out[0]).toContain('Usage: bun <agents-root>/scripts/echo.ts');
      expect(codes).toEqual([0]);
    }
    expect(run).not.toHaveBeenCalled();
  });

  test('maps a usage error to exit 2 and prints the failure envelope', async () => {
    const { codes, context, out } = makeContext();
    expect(await runCommand(declaration, ['--nope'], context)).toBe(2);
    const envelope = JSON.parse(out[0] ?? '');
    expect(envelope.ok).toBe(false);
    expect(envelope.exitCode).toBe(2);
    expect(codes).toEqual([2]);
  });

  test('maps thrown errors through the exit table', async () => {
    const throwing = (error: unknown): CommandDeclaration<never> => ({
      ...base,
      run: () => {
        throw error;
      },
    });
    expect(await runCommand(throwing(new Error('boom')), ['x'], makeContext().context)).toBe(1);
    expect(await runCommand(throwing(new UsageError('bad')), ['x'], makeContext().context)).toBe(2);
    expect(
      await runCommand(throwing(new CliError('custom', 1)), ['x'], makeContext().context),
    ).toBe(1);
    expect(await runCommand(throwing('text'), ['x'], makeContext().context)).toBe(1);
  });

  test('renders failure data through the declared text renderer', async () => {
    const { context, err } = makeContext();
    const failing: CommandDeclaration<{ echoed: readonly string[] }> = {
      ...base,
      renderText: (data) => `echo:${data.echoed.join(',')}`,
      run: () => {
        throw new CliError('blocked', 1, { echoed: ['a'] });
      },
    };
    expect(await runCommand(failing, ['x', '--format', 'text'], context)).toBe(1);
    expect(err).toEqual(['echo:a\nblocked']);
  });

  test('writes a text-format failure to the error stream', async () => {
    const { context, err, out } = makeContext();
    const failing: CommandDeclaration<never> = {
      ...base,
      run: () => {
        throw new Error('boom');
      },
    };
    expect(await runCommand(failing, ['x', '--format', 'text'], context)).toBe(1);
    expect(err).toEqual(['boom']);
    expect(out).toEqual([]);
  });

  test('validates --agents-root before running and passes it through', async () => {
    const good = makeContext();
    const seen: (string | undefined)[] = [];
    const reading: CommandDeclaration<string> = {
      ...base,
      run: (input) => {
        seen.push(input.agentsRoot);
        return 'ok';
      },
    };
    expect(await runCommand(reading, ['x', '--agents-root', '/some/root'], good.context)).toBe(0);
    expect(seen).toEqual(['/some/root']);

    const bad = makeContext([{ isDirectory: true, name: 'src' }]);
    expect(await runCommand(reading, ['x', '--agents-root', '/some/root'], bad.context)).toBe(2);
    expect(bad.out[0]).toContain('--agents-root');

    const relative = makeContext();
    expect(await runCommand(reading, ['x', '--agents-root', 'rel'], relative.context)).toBe(2);
  });

  test('awaits an asynchronous handler', async () => {
    const asynchronous: CommandDeclaration<string> = { ...base, run: async () => 'later' };
    const { context, out } = makeContext();
    await runCommand(asynchronous, ['x', '--format', 'text'], context);
    expect(out).toEqual(['later']);
  });
});

describe('runMain', () => {
  test('runs only at the main boundary', async () => {
    const { context, out } = makeContext();
    const args = ['hi'];
    expect(runMain(declaration, false, args, context)).toBeUndefined();
    expect(out).toEqual([]);
    await runMain(declaration, true, args, context);
    expect(out).toHaveLength(1);
  });
});
