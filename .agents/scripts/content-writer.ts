import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import {
  type ClaimSource,
  type ContentBrief,
  type ContentPackage,
  canSupportClaim,
  renderContentOutline,
  validateContentPackage,
} from '../utils/content.js';

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/content-writer.ts <outline|validate-draft|validate-source> <json>';

export const run = (
  args: readonly string[],
  write: (message: string) => void = console.log,
): void => {
  const [command, sourceJson] = args;
  if (!sourceJson || args.length !== 2) {
    throw new Error(usage());
  }
  let value: unknown;
  try {
    value = JSON.parse(sourceJson) as unknown;
  } catch {
    throw new Error('Claim source must be valid JSON.');
  }
  if (command === 'outline') {
    write(renderContentOutline(value as ContentBrief));
    return;
  }
  if (command === 'validate-draft') {
    validateContentPackage(value as ContentPackage);
    write(`content-draft: ${(value as ContentPackage).result}`);
    return;
  }
  if (command !== 'validate-source' || !canSupportClaim(value as ClaimSource)) {
    throw new Error('Claim source is not admissible.');
  }
  write('claim-source: passed');
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
