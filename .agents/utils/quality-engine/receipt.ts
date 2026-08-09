import type { CheckResult, CheckStatus } from '../contracts.js';

export interface EvidenceReceipt {
  readonly checks: readonly CheckResult[];
  readonly matrixFingerprint: string;
  readonly sourceFingerprint: string;
  readonly state: string;
}

const checkStatuses = new Set<CheckStatus>([
  'passed',
  'failed',
  'not-applicable',
  'blocked',
]);

export const failedCheckNames = (receipt: EvidenceReceipt): string[] =>
  receipt.checks
    .filter((check) => check.status === 'failed' || check.status === 'blocked')
    .map((check) => check.name);

export const receiptPasses = (receipt: EvidenceReceipt): boolean =>
  receipt.checks.every(
    (check) => check.status === 'passed' || check.status === 'not-applicable',
  );

export const renderReceipt = (receipt: EvidenceReceipt): string =>
  JSON.stringify(receipt, null, 2);

const validateReceiptChecks = (checks: readonly CheckResult[]): void => {
  const names = new Set<string>();
  for (const check of checks) {
    if (!check.name.trim() || !check.detail.trim()) {
      throw new Error('Receipt checks require nonblank names and details.');
    }
    if (names.has(check.name)) {
      throw new Error(`Receipt check names must be unique: ${check.name}`);
    }
    names.add(check.name);
    if (!checkStatuses.has(check.status)) {
      throw new Error(`Receipt check status is invalid: ${check.status}`);
    }
  }
};

export const createReceipt = (receipt: EvidenceReceipt): EvidenceReceipt => {
  if (
    !receipt.matrixFingerprint.trim() ||
    !receipt.sourceFingerprint.trim() ||
    !receipt.state.trim()
  ) {
    throw new Error(
      'Receipt matrix fingerprint, source fingerprint, and state are required.',
    );
  }
  if (receipt.checks.length === 0) {
    throw new Error('Receipt requires at least one check.');
  }
  validateReceiptChecks(receipt.checks);
  return receipt;
};
