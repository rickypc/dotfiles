import { isCodingAssistant, renderAdapterHandoff } from '../utils/adapters.js';
import { runWhenMain as runCliWhenMain } from '../utils/cli.js';

export const usage = (): string =>
  'Usage: bun ~/.agents/scripts/adapter.ts <claude-code|codex|kiro-ide|opencode> <agents-root>';

export const run = (
  args: readonly string[],
  write: (message: string) => void = console.log,
): void => {
  const [assistant, agentsRoot] = args;
  if (
    !assistant ||
    !agentsRoot ||
    args.length !== 2 ||
    !isCodingAssistant(assistant)
  ) {
    throw new Error(usage());
  }
  write(renderAdapterHandoff(assistant, agentsRoot));
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
