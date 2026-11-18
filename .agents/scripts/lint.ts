import { agentsRootOf } from '../utils/agents-root.js';
import type { CommandDeclaration } from '../utils/cli/declaration.js';
import { CliError } from '../utils/cli/errors.js';
import { runMain } from '../utils/cli/index.js';
import type { CommandResult, CommandSpec } from '../utils/contracts.js';
import { checkImmutableAgentsConfig } from '../utils/immutable-agents-config.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';

export interface LintDependencies {
  readonly agentsRoot: string;
  readonly executor: CommandExecutor;
}

export interface LintReceipt {
  readonly name: 'atom-maps' | 'biome' | 'declaration-order' | 'instruction-gate' | 'skills';
  readonly result: CommandResult;
}

const defaultDependencies: LintDependencies = {
  agentsRoot: agentsRootOf(import.meta.dir),
  executor: bunExecutor,
};

export const lintExitCode = (receipts: readonly LintReceipt[]): number =>
  receipts.reduce((exitCode, { result }) => Math.max(exitCode, result.code), 0);

const lintLine = ({ name, result }: LintReceipt): string => {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.code !== 0) {
    return [`${name}: failed`, stdout, stderr].filter(Boolean).join('\n');
  }
  return stdout || `${name}: passed - ${stderr.split('\n').at(-1) ?? ''}`.trimEnd();
};

export const lintDiagnostics = (receipts: readonly LintReceipt[]): string =>
  receipts.map(lintLine).join('\n');

const shellCommand = (command: string, cwd: string): CommandSpec => ({
  args: ['-lc', command],
  command: 'zsh',
  cwd,
});

export const lintCommandsFor = (
  agentsRoot: string,
): readonly {
  readonly name: LintReceipt['name'];
  readonly spec: CommandSpec;
}[] => [
  {
    name: 'atom-maps',
    spec: shellCommand(
      'bun scripts/skill-manager/index.ts audit "$PWD" --check --format text',
      agentsRoot,
    ),
  },
  {
    name: 'biome',
    spec: shellCommand(
      "rg --files -0 -g '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}' | xargs -0 bun x biome check",
      agentsRoot,
    ),
  },
  {
    name: 'declaration-order',
    spec: shellCommand(
      "rg --files -0 -g '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}' | xargs -0 bun scripts/declaration-order.ts --summary --format text",
      agentsRoot,
    ),
  },
  {
    name: 'instruction-gate',
    spec: shellCommand('bun scripts/instruction-gate/index.ts verify --format text', agentsRoot),
  },
  {
    name: 'skills',
    spec: shellCommand('bun scripts/validate/skills.ts --format text', agentsRoot),
  },
];

export const runLintCommands = async (
  executor: CommandExecutor,
  agentsRoot: string,
): Promise<readonly LintReceipt[]> =>
  Promise.all(
    lintCommandsFor(agentsRoot).map(async ({ name, spec }) => ({
      name,
      result: await executor(spec),
    })),
  );

export const createCommand = (
  overrides: Partial<LintDependencies> = {},
): CommandDeclaration<readonly LintReceipt[]> => {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    arity: [0, 0],
    renderText: lintDiagnostics,
    run: async (input) => {
      const agentsRoot = input.agentsRoot ?? dependencies.agentsRoot;
      const immutableConfigReceipt = await checkImmutableAgentsConfig(
        dependencies.executor,
        agentsRoot,
      );
      if (immutableConfigReceipt.status === 'failed') {
        throw new CliError(immutableConfigReceipt.detail);
      }
      const receipts = await runLintCommands(dependencies.executor, agentsRoot);
      if (lintExitCode(receipts) !== 0) {
        throw new CliError(
          `Lint failed: ${receipts
            .filter(({ result }) => result.code !== 0)
            .map(({ name }) => name)
            .join(', ')}.`,
          1,
          receipts,
        );
      }
      return receipts;
    },
    script: 'scripts/lint.ts',
    summary:
      'Run the atom-map audit, Biome, declaration-order, instruction-gate, and skill checks together.',
  };
};

export const command = createCommand();

void runMain(command, import.meta.main);
