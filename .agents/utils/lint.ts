import type { CommandResult, CommandSpec } from './contracts.js';
import type { CommandExecutor } from './process.js';

export interface LintReceipt {
  readonly name: 'biome' | 'declaration-order';
  readonly result: CommandResult;
}

export const lintExitCode = (receipts: readonly LintReceipt[]): number =>
  receipts.reduce((exitCode, { result }) => Math.max(exitCode, result.code), 0);

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
    name: 'biome',
    spec: shellCommand('bun x biome check .', agentsRoot),
  },
  {
    name: 'declaration-order',
    spec: shellCommand(
      "rg --files -0 -g '*.{ts,tsx,mts,cts}' | xargs -0 bun scripts/declaration-order.ts --summary",
      agentsRoot,
    ),
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

export const writeLintDiagnostics = (
  receipts: readonly LintReceipt[],
  write: (message: string) => void,
): void => {
  for (const { result } of receipts) {
    write(result.stdout);
    write(result.stderr);
  }
};
