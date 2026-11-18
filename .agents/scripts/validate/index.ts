import type { CommandDeclaration } from '../../utils/cli/declaration.js';
import { runMain } from '../../utils/cli/index.js';
import { UsageError } from '../../utils/cli/usage-error.js';
import type { CheckResult, CheckStatus } from '../../utils/contracts.js';
import { requirePassingChecks, summarizeChecks } from '../../utils/validation.js';

const statuses = new Set<CheckStatus>(['blocked', 'failed', 'not-applicable', 'passed']);

export const parseCheck = (value: string): CheckResult => {
  const [name, status, ...detailParts] = value.split(':');
  const detail = detailParts.join(':');
  if (!name || !status || !detail || !statuses.has(status as CheckStatus)) {
    throw new UsageError(`Invalid check: ${value}`);
  }
  return { detail, name, status: status as CheckStatus };
};

export const command: CommandDeclaration<readonly CheckResult[]> = {
  arity: [1, Number.POSITIVE_INFINITY],
  positionals: '<name>:<blocked|failed|not-applicable|passed>:<detail>...',
  renderText: summarizeChecks,
  run: (input) => {
    const checks = input.positionals.map(parseCheck);
    requirePassingChecks(checks);
    return checks;
  },
  script: 'scripts/validate/index.ts',
  summary: 'Render validation evidence and fail when any check is not passing.',
};

void runMain(command, import.meta.main);
