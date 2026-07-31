import type { CheckResult } from '../contracts.js';

export interface EvidenceReceipt {
  readonly checks: readonly CheckResult[];
  readonly sourceFingerprint: string;
  readonly state: string;
}

export const createReceipt = (receipt: EvidenceReceipt): EvidenceReceipt => {
  if (!receipt.sourceFingerprint.trim() || !receipt.state.trim()) {
    throw new Error('Receipt fingerprint and state are required.');
  }
  if (receipt.checks.length === 0) {
    throw new Error('Receipt requires at least one check.');
  }
  return receipt;
};

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
