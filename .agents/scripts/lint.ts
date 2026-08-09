import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import type { CommandResult, CommandSpec } from '../utils/contracts.js';
import { checkImmutableAgentsConfig } from '../utils/immutable-agents-config.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';

export interface LintReceipt {
  readonly name: 'biome' | 'declaration-order' | 'skills';
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
      "rg --files -0 -g '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}' | xargs -0 bun scripts/declaration-order.ts --summary",
      agentsRoot,
    ),
  },
  {
    name: 'skills',
    spec: shellCommand('bun scripts/validate-skills.ts', agentsRoot),
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

export const usage = (): string => 'Usage: bun <agents-root>/scripts/lint.ts';

export const processExit = {
  setExitCode: (
    code: number,
    target: { exitCode?: number | string | null } = process,
  ): void => {
    target.exitCode = code;
  },
};

export const writeLintDiagnostics = (
  receipts: readonly LintReceipt[],
  write: (message: string) => void,
): void => {
  for (const { result } of receipts) {
    write(result.stdout);
    write(result.stderr);
  }
};

export const run = async (
  args: readonly string[],
  executor = bunExecutor,
  agentsRoot = `${import.meta.dir}/..`,
  write: (message: string) => void = (message) => process.stdout.write(message),
  setExitCode: (code: number) => void = (code) => processExit.setExitCode(code),
): Promise<void> => {
  if (args.length !== 0) {
    throw new Error(usage());
  }
  const immutableConfigReceipt = await checkImmutableAgentsConfig(
    executor,
    agentsRoot,
  );
  if (immutableConfigReceipt.status === 'failed') {
    throw new Error(immutableConfigReceipt.detail);
  }
  const receipts = await runLintCommands(executor, agentsRoot);
  writeLintDiagnostics(receipts, write);
  const exitCode = lintExitCode(receipts);
  if (exitCode !== 0) {
    setExitCode(exitCode);
  }
};

export const runWhenMain = runCliWhenMain;

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
