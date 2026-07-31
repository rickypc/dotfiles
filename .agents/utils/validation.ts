import type { CheckResult } from './contracts.js';

export const hasFailure = (results: readonly CheckResult[]): boolean =>
  results.some(
    (result) => result.status === 'failed' || result.status === 'blocked',
  );

export const summarizeChecks = (results: readonly CheckResult[]): string =>
  results
    .map((result) => `${result.name}: ${result.status} — ${result.detail}`)
    .join('\n');

export const requirePassingChecks = (results: readonly CheckResult[]): void => {
  if (hasFailure(results)) {
    throw new Error(summarizeChecks(results));
  }
};
