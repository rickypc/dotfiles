import { describe, expect, mock, test } from 'bun:test';
import path from 'node:path';
import type { GateDependencies } from '../../scripts/instruction-gate.js';
import type { CommandResult, CommandSpec } from '../../utils/contracts.js';

interface GateCommandContext {
  readonly DOCUMENT: string;
  readonly makeHarness: (options?: {
    readonly overrides?: (spec: CommandSpec) => CommandResult | undefined;
    readonly tree?: Record<string, readonly { isDirectory: boolean; name: string }[]>;
  }) => GateCommandHarness;
  readonly parseRecordArguments: typeof import('../../scripts/instruction-gate.js').parseRecordArguments;
  readonly processExit: typeof import('../../scripts/instruction-gate.js').processExit;
  readonly RECEIPT: string;
  readonly ROOT: string;
  readonly record: typeof import('../../scripts/instruction-gate.js').record;
  readonly run: typeof import('../../scripts/instruction-gate.js').run;
  readonly runCli: typeof import('../../scripts/instruction-gate.js').runCli;
  readonly SET: string;
  readonly usage: typeof import('../../scripts/instruction-gate.js').usage;
}

interface GateCommandHarness {
  readonly deps: GateDependencies;
  readonly executor: ReturnType<typeof mock>;
  readonly files: Map<string, string>;
  readonly output: string[];
}

const registerGateArgumentCases = (context: GateCommandContext): void => {
  const { DOCUMENT, makeHarness, parseRecordArguments, processExit, run, runCli, usage } = context;
  describe('arguments, run, and the command line', () => {
    test('parses paths and reasons', () => {
      expect(parseRecordArguments(['a.md', '--allow-equal', 'typo fix', 'b.md'])).toEqual({
        documents: ['a.md', 'b.md'],
        options: { allowEqualReason: 'typo fix', rebaselineReason: undefined },
      });
      expect(parseRecordArguments(['--rebaseline', 'new model']).options.rebaselineReason).toBe(
        'new model',
      );
      expect(parseRecordArguments([]).documents).toEqual([]);
    });

    test.each<[readonly string[]]>([
      [['--allow-equal']],
      [['--rebaseline', ' ']],
      [['--allow-equal', '--rebaseline', 'x']],
    ])('a flag without a written reason is refused: %p', (args) => {
      expect(() => parseRecordArguments(args)).toThrow('needs a written reason');
    });

    test('run routes verify and record and rejects everything else', async () => {
      const harness = makeHarness();

      expect(await run(['verify'], harness.deps)).toBe(1);
      expect(await run(['record', DOCUMENT], harness.deps)).toBe(0);
      for (const bad of [[], ['verify', 'extra'], ['unknown']]) {
        await expect(run(bad, harness.deps)).rejects.toThrow('Usage:');
      }
      expect(usage()).toContain('instruction-gate.ts verify');
    });

    test('runCli sets the exit code, reports errors, and handles help flags', async () => {
      const harness = makeHarness();
      const codes: number[] = [];

      await runCli(['verify'], harness.deps, (code) => codes.push(code));
      await runCli(['bogus'], harness.deps, (code) => codes.push(code));
      await runCli(
        ['verify'],
        {
          ...harness.deps,
          listDirectory: mock(async () => {
            throw 'not an error';
          }),
        },
        (code) => codes.push(code),
      );

      for (const flag of ['--help', '-h']) {
        const helpHarness = makeHarness();
        const helpExitCode = mock();
        await runCli([flag], helpHarness.deps, helpExitCode);
        expect(helpHarness.output.join('')).toContain('Usage:');
        expect(helpExitCode).not.toHaveBeenCalled();
        expect(helpHarness.executor).not.toHaveBeenCalled();
      }

      expect(codes).toEqual([1, 1, 1]);
      expect(harness.output.join('')).toContain('Usage:');
      expect(harness.output.join('')).toContain('not an error');
    });

    test('runCli defaults its exit-code setter to the process boundary', async () => {
      const harness = makeHarness();
      const original = processExit.setExitCode;
      const setter = mock();
      processExit.setExitCode = setter;
      try {
        await runCli(['bogus'], harness.deps);
      } finally {
        processExit.setExitCode = original;
      }

      expect(setter).toHaveBeenCalledWith(1);
    });

    test('processExit writes to a supplied target', () => {
      const exitTarget: { exitCode?: number } = {};
      processExit.setExitCode(3, exitTarget);

      expect(exitTarget.exitCode).toBe(3);
    });
  });
};

const registerGateRecordFailureCases = (context: GateCommandContext): void => {
  const { DOCUMENT, RECEIPT, ROOT, makeHarness, record } = context;

  describe('record failures', () => {
    test.each([
      [
        'train bundle',
        (spec: CommandSpec) =>
          spec.args.includes('bundle') ? { code: 1, stderr: 'no set', stdout: '' } : undefined,
        'train bundle failed: no set',
      ],
      [
        'the reader without a GPU',
        (spec: CommandSpec) =>
          spec.args.some((a) => a.endsWith('weak-reader.ts'))
            ? { code: 2, stderr: 'no adapter', stdout: '' }
            : undefined,
        'outside the sandbox',
      ],
      [
        'the reader failing otherwise',
        (spec: CommandSpec) =>
          spec.args.some((a) => a.endsWith('weak-reader.ts'))
            ? { code: 3, stderr: 'bad blob', stdout: '' }
            : undefined,
        'weak reader exited 3: bad blob',
      ],
      [
        'train measure',
        (spec: CommandSpec) =>
          spec.args.includes('measure')
            ? { code: 1, stderr: 'bad answers', stdout: '' }
            : undefined,
        'train measure failed: bad answers',
      ],
      [
        'unusable measure output',
        (spec: CommandSpec) =>
          spec.args.includes('measure')
            ? { code: 0, stderr: '', stdout: '{"measurement":{}}' }
            : undefined,
        'returned no trainQueries',
      ],
      [
        'unusable measure output shape',
        (spec: CommandSpec) =>
          spec.args.includes('measure') ? { code: 0, stderr: '', stdout: '[]' } : undefined,
        'returned no trainQueries',
      ],
    ])(
      '%s fails the document with its reason and writes no receipt',
      async (_label, overrides, message) => {
        const harness = makeHarness({ overrides });

        expect(await record([DOCUMENT], {}, harness.deps)).toBe(1);
        expect(harness.output.join('')).toContain(`FAILED ${DOCUMENT}`);
        expect(harness.output.join('')).toContain(message);
        expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(false);
      },
    );

    test('a thrown non-error value is still reported', async () => {
      const harness = makeHarness();
      const failing = {
        ...harness.deps,
        executor: mock(async () => {
          throw 'plain text';
        }),
      };

      expect(await record([DOCUMENT], {}, failing)).toBe(1);
      expect(harness.output.join('')).toContain('FAILED skills/aidp/SKILL.md: plain text');
    });
  });
};

const PROJECT = '/project/.agents';
const projectTree = {
  [PROJECT]: [{ isDirectory: true, name: 'skills' }],
  [path.join(PROJECT, 'skills')]: [{ isDirectory: true, name: 'aidp' }],
  [path.join(PROJECT, 'skills', 'aidp')]: [{ isDirectory: false, name: 'SKILL.md' }],
};
const commandsOf = (harness: GateCommandHarness): string[] =>
  harness.executor.mock.calls.map(([spec]) => (spec as CommandSpec).args.join(' '));
const projectHarness = (context: GateCommandContext): GateCommandHarness => {
  const { DOCUMENT, ROOT, SET, makeHarness } = context;
  const harness = makeHarness({ tree: projectTree });
  for (const relative of [DOCUMENT, SET]) {
    harness.files.set(
      path.join(PROJECT, relative),
      harness.files.get(path.join(ROOT, relative)) ?? '',
    );
    harness.files.delete(path.join(ROOT, relative));
  }
  return harness;
};

const registerAgentRootRecordCases = (context: GateCommandContext): void => {
  const { DOCUMENT, RECEIPT, ROOT, SET, makeHarness, run } = context;
  describe('--agents-root record', () => {
    test('without the flag the content root stays the package root', async () => {
      const harness = makeHarness();

      expect(await run(['record', DOCUMENT], harness.deps)).toBe(0);
      expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(true);
      expect(commandsOf(harness)[0]).toContain(`train bundle ${path.join(ROOT, SET)}`);
    });

    test('record resolves the document, set, and receipt under the flag root', async () => {
      const harness = projectHarness(context);

      expect(await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps)).toBe(0);

      expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(false);
      expect(JSON.parse(harness.files.get(path.join(PROJECT, RECEIPT)) ?? '{}')).toMatchObject({
        document: DOCUMENT,
        setPath: SET,
      });
      expect(commandsOf(harness)[0]).toContain(`train bundle ${path.join(PROJECT, SET)}`);
    });

    test('tools still resolve from the package root', async () => {
      const harness = projectHarness(context);

      await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps);

      const commands = commandsOf(harness);
      expect(commands[0]).toContain(path.join(ROOT, 'scripts', 'skill-manager.ts'));
      expect(commands[1]).toContain(path.join(ROOT, 'scripts', 'weak-reader.ts'));
      expect(commands.some((command) => command.includes(path.join(PROJECT, 'scripts')))).toBe(
        false,
      );
    });
  });
};

const registerAgentRootValidationCases = (context: GateCommandContext): void => {
  const { DOCUMENT, makeHarness, run, usage } = context;
  describe('--agents-root validation', () => {
    test('verify checks the documents under the flag root and skips the routing receipt', async () => {
      const harness = projectHarness(context);
      await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps);
      harness.output.length = 0;

      expect(await run(['verify', '--agents-root', PROJECT], harness.deps)).toBe(0);
      expect(harness.output.join('')).toContain('passed - 1 instruction documents have');
    });

    test.each<[string[], string]>([
      [['relative/path'], 'an absolute path'],
      [['/project/../etc'], 'without ".." segments'],
      [['/missing'], 'an existing directory'],
      [['/empty'], 'contains a skills or evals directory'],
      [[], 'an absolute path'],
    ])('the root %p is rejected before measurement begins', async (value, message) => {
      const harness = makeHarness();
      const deps: GateDependencies = {
        ...harness.deps,
        listDirectory: mock(async (directory: string) => {
          if (directory === '/missing') {
            throw new Error('ENOENT');
          }
          return directory === '/empty' ? [{ isDirectory: false, name: 'notes.md' }] : [];
        }),
      };

      await expect(run(['record', '--agents-root', ...value], deps)).rejects.toThrow(message);
      expect(harness.executor).not.toHaveBeenCalled();
    });

    test('descriptions are rejected for a non-default root and documented in the usage', async () => {
      const harness = projectHarness(context);

      await expect(
        run(['record', '--agents-root', PROJECT, 'descriptions'], harness.deps),
      ).rejects.toThrow('gated only for the default root');
      expect(harness.executor).not.toHaveBeenCalled();
      expect(usage()).toContain('--agents-root <absolute-path>');
    });
  });
};

export const registerGateCommandCases = (context: GateCommandContext): void => {
  registerAgentRootRecordCases(context);
  registerAgentRootValidationCases(context);
  registerGateArgumentCases(context);
  registerGateRecordFailureCases(context);
};
