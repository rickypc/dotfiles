import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import type { CheckResult, CheckStatus } from '../utils/contracts.js';
import { requirePassingChecks, summarizeChecks } from '../utils/validation.js';

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/validate.ts <name>:<blocked|failed|not-applicable|passed>:<detail>';

const statuses = new Set<CheckStatus>([
  'passed',
  'failed',
  'blocked',
  'not-applicable',
]);

export const parseCheck = (value: string): CheckResult => {
  const [name, status, ...detailParts] = value.split(':');
  const detail = detailParts.join(':');
  if (!name || !status || !detail || !statuses.has(status as CheckStatus)) {
    throw new Error(`Invalid check: ${value}`);
  }
  return { detail, name, status: status as CheckStatus };
};

export const run = (
  args: readonly string[],
  write: (message: string) => void = console.log,
): void => {
  if (args.length === 0) {
    throw new Error(usage());
  }
  const checks = args.map(parseCheck);
  requirePassingChecks(checks);
  write(summarizeChecks(checks));
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
