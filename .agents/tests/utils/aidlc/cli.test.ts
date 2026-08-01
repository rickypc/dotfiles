import { expect, mock, test } from 'bun:test';

import {
  formatAidlcCliError,
  runAidlcCliWhenMain,
} from '../../../utils/aidlc/cli.js';

test('turns a malformed intent failure into an actionable AIDLC message', () => {
  expect(
    formatAidlcCliError(new Error('AIDLC intent frontmatter is invalid.')),
  ).toContain('Repair its YAML frontmatter with gray-matter');
  expect(
    formatAidlcCliError(new Error('AIDLC intent stage ledger is missing.')),
  ).toContain('Do not replace the file manually');
});

test('preserves non-intent command failures without a stack trace contract', () => {
  expect(formatAidlcCliError(new Error('Usage: aidlc'))).toBe(
    'AIDLC command failed: Usage: aidlc',
  );
});

test('reports a main-boundary failure as actionable text', async () => {
  const originalError = console.error;
  const report = mock();
  console.error = report;
  try {
    runAidlcCliWhenMain(true, [], async () => {
      throw new Error('AIDLC intent frontmatter is invalid.');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('Repair its YAML frontmatter with gray-matter'),
    );
    expect(process.exitCode).toBe(1);
  } finally {
    console.error = originalError;
    process.exitCode = 0;
  }
});
