import type { CommandBody, CommandDeclaration, ParsedInput } from '../../utils/cli/declaration.js';
import { CliError } from '../../utils/cli/errors.js';
import type { GateDependencies } from './index.js';

type GateRunner = (args: readonly string[], deps: GateDependencies) => Promise<number>;

type Options = NonNullable<CommandBody<unknown>['options']>;

const gateText = (data: unknown): string =>
  typeof data === 'object' && data !== null && 'output' in data
    ? String(data.output).trimEnd()
    : JSON.stringify(data, null, 2);

const RECORD_FLAGS = ['allow-equal', 'rebaseline', 'allow-swap', 'rotate-pool'] as const;

const gateBody = (
  name: string,
  summary: string,
  [positionals, min, max]: readonly [string, number, number],
  toArgs: (input: ParsedInput) => readonly string[],
  runGate: GateRunner,
  makeDeps: () => GateDependencies,
  options?: Options,
): CommandBody<unknown> => ({
  arity: [min, max],
  ...(options ? { options } : {}),
  positionals,
  renderText: gateText,
  run: async (input) => {
    const lines: string[] = [];
    const agentsRoot = input.agentsRoot === undefined ? {} : { agentsRoot: input.agentsRoot };
    const deps = { ...makeDeps(), ...agentsRoot, write: (message: string) => lines.push(message) };
    const exitCode = await runGate([name, ...toArgs(input)], deps);
    const output = lines.join('');
    const data =
      exitCode === 0 && output.startsWith('{') ? JSON.parse(output) : { exitCode, output };
    if (exitCode !== 0) {
      throw new CliError(`instruction-gate ${name} reported failures.`, 1, data);
    }
    return data;
  },
  summary,
});

export const buildCommand = (
  runGate: GateRunner,
  makeDeps: () => GateDependencies,
): CommandDeclaration<unknown> => ({
  commands: {
    calibrate: gateBody(
      'calibrate',
      'Mutate selected atoms, record which probes flip, and with --write store it in the atom maps.',
      ['<owner-id>...', 1, Number.POSITIVE_INFINITY],
      (input) => [...input.positionals, ...(input.values.write === true ? ['--write'] : [])],
      runGate,
      makeDeps,
      { write: { description: 'Store the measured sensitivity.', type: 'boolean' } },
    ),
    'evaluate-batch': gateBody(
      'evaluate-batch',
      'Score up to 3 candidate sources per document in one reader run; writes no receipt.',
      ['<absolute-request-json> [<absolute-output-json>]', 1, 2],
      (input) => input.positionals,
      runGate,
      makeDeps,
    ),
    record: gateBody(
      'record',
      'Record receipts for instruction documents or descriptions (descriptions only for the default root).',
      ['[<instruction-path> | descriptions]...', 0, Number.POSITIVE_INFINITY],
      (input) => [
        ...RECORD_FLAGS.flatMap((flag) => {
          const value = input.values[flag];
          return typeof value === 'string' ? [`--${flag}`, value] : [];
        }),
        ...input.positionals,
      ],
      runGate,
      makeDeps,
      Object.fromEntries(
        RECORD_FLAGS.map((flag) => [flag, { description: `Value for --${flag}.`, type: 'string' }]),
      ) as Options,
    ),
    verify: gateBody(
      'verify',
      'Verify that every instruction document and the skill description routing have current receipts.',
      ['', 0, 0],
      () => [],
      runGate,
      makeDeps,
    ),
  },
  script: 'scripts/instruction-gate/index.ts',
  summary:
    'Gate instruction documents with never-worse receipts; --agents-root selects a content root.',
});
