import { expect, test } from 'bun:test';

import {
  skillHistoryPathsFor,
  temporarySnapshotRootFor,
} from '../../../utils/quality-engine/skill-history-paths.js';

const joinPath = (...parts: readonly string[]): string => parts.join('/');
const temporarySnapshotRoot = '/os-temp/agents-evaluation-snapshots/repo-id/owner-id';

test('keeps the owner ledger tracked and snapshots in the temporary root', () => {
  expect(
    skillHistoryPathsFor(
      {
        legacyRoot: '/plans/quality',
        ownerRoot: '/agents/evals/skills/demo',
        skillName: 'demo',
        temporarySnapshotRoot,
      },
      joinPath,
    ),
  ).toEqual({
    ledgerPath: '/agents/evals/skills/demo/ledger.jsonl',
    snapshotRoot: temporarySnapshotRoot,
  });
});

test('keeps an explicit ledger override ahead of a central owner root', () => {
  expect(
    skillHistoryPathsFor(
      {
        legacyRoot: '/plans/quality',
        overrideRoot: '/tmp/custom-quality',
        ownerRoot: '/agents/evals/skills/demo',
        skillName: 'demo',
        temporarySnapshotRoot,
      },
      joinPath,
    ),
  ).toEqual({
    ledgerPath: '/tmp/custom-quality/demo.json',
    snapshotRoot: temporarySnapshotRoot,
  });
});

test('keeps legacy ledger placement while snapshots use the temporary root', () => {
  expect(
    skillHistoryPathsFor(
      { legacyRoot: '/plans/quality', skillName: 'demo', temporarySnapshotRoot },
      joinPath,
    ),
  ).toEqual({
    ledgerPath: '/plans/quality/demo.json',
    snapshotRoot: temporarySnapshotRoot,
  });
});

test('uses stable repository and owner hashes for temporary snapshot namespaces', () => {
  const fingerprint = (value: object | string): string => {
    const key = typeof value === 'string' ? value : JSON.stringify(value);
    return key === '/agents'
      ? 'a'.repeat(64)
      : key.includes('"skillName":"demo"')
        ? 'b'.repeat(64)
        : 'c'.repeat(64);
  };
  const input = {
    ownerRoot: '/agents/evals/skills/demo',
    repositoryRoot: '/agents',
    skillName: 'demo',
    temporaryDirectory: '/os-temp',
  };
  const expected = `/os-temp/agents-evaluation-snapshots/${'a'.repeat(24)}/${'b'.repeat(24)}`;

  expect(temporarySnapshotRootFor(input, joinPath, fingerprint)).toBe(expected);
  expect(temporarySnapshotRootFor(input, joinPath, fingerprint)).toBe(expected);
  expect(temporarySnapshotRootFor({ ...input, skillName: 'other' }, joinPath, fingerprint)).toBe(
    `/os-temp/agents-evaluation-snapshots/${'a'.repeat(24)}/${'c'.repeat(24)}`,
  );
});
