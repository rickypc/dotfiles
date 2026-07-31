import {
  runStaticChecks,
  type SourceReader,
} from '../utils/biome-tsc-checker.js';
import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { normalizePaths } from '../utils/contracts.js';
import { bunExecutor } from '../utils/process.js';
import { requirePassingChecks, summarizeChecks } from '../utils/validation.js';

export const run = async (
  args: readonly string[],
  executor = bunExecutor,
  agentsRoot = `${import.meta.dir}/..`,
  write: (message: string) => void = console.log,
  read: SourceReader = (path) => Bun.file(path).text(),
): Promise<void> => {
  const paths = normalizePaths(args);
  const results = await runStaticChecks(executor, { agentsRoot, paths }, read);
  write(summarizeChecks(results));
  requirePassingChecks(results);
};

export const runWhenMain = runCliWhenMain;

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
