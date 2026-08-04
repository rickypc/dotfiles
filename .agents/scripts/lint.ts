import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { checkImmutableAgentsConfig } from '../utils/immutable-agents-config.js';
import {
  lintExitCode,
  runLintCommands,
  writeLintDiagnostics,
} from '../utils/lint.js';
import { bunExecutor } from '../utils/process.js';

export const usage = (): string => 'Usage: bun <agents-root>/scripts/lint.ts';

export const run = async (
  args: readonly string[],
  executor = bunExecutor,
  agentsRoot = `${import.meta.dir}/..`,
  write: (message: string) => void = (message) => process.stdout.write(message),
  setExitCode: (code: number) => void = (code) => {
    process.exitCode = code;
  },
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
