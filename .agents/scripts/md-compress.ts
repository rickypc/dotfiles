import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { assertCompressiblePath } from '../utils/md-compress.js';

export const usage = (): string =>
  'Use the md-compress skill to guard, compress Markdown in the current agent session, and finalize.';

export const run = (
  args: readonly string[],
  write: (message: string) => void = console.log,
): void => {
  if (args.length !== 1) {
    throw new Error(
      'Usage: bun ~/.agents/scripts/md-compress.ts <markdown-path>',
    );
  }
  assertCompressiblePath(args[0]);
  write(usage());
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
