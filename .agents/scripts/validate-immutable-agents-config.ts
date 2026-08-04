import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import {
  checkImmutableAgentsConfig,
  type ImmutableAgentsConfigReceipt,
} from '../utils/immutable-agents-config.js';
import { bunExecutor } from '../utils/process.js';

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/validate-immutable-agents-config.ts';

export const run = async (
  args: readonly string[],
  executor = bunExecutor,
  agentsRoot = `${import.meta.dir}/..`,
  write: (message: string) => void = console.log,
): Promise<ImmutableAgentsConfigReceipt> => {
  if (args.length !== 0) {
    throw new Error(usage());
  }
  const receipt = await checkImmutableAgentsConfig(executor, agentsRoot);
  write(receipt.detail);
  write('\n');
  if (receipt.status === 'failed') {
    throw new Error(receipt.detail);
  }
  return receipt;
};

export const runWhenMain = runCliWhenMain;

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
