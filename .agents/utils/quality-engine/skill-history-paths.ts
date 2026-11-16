export type Fingerprint = (value: object | string) => string;

export type JoinPath = (...parts: readonly string[]) => string;

export interface SkillHistoryPathInput {
  readonly legacyRoot: string;
  readonly overrideRoot?: string;
  readonly ownerRoot?: string;
  readonly skillName: string;
  readonly temporarySnapshotRoot: string;
}

export interface SkillHistoryPaths {
  readonly ledgerPath: string;
  readonly snapshotRoot: string;
}

export interface TemporarySnapshotRootInput {
  readonly ownerRoot: string;
  readonly repositoryRoot: string;
  readonly skillName: string;
  readonly temporaryDirectory: string;
}

export const skillHistoryPathsFor = (
  input: SkillHistoryPathInput,
  joinPath: JoinPath,
): SkillHistoryPaths => {
  if (input.overrideRoot === undefined && input.ownerRoot !== undefined) {
    return {
      ledgerPath: joinPath(input.ownerRoot, 'ledger.jsonl'),
      snapshotRoot: input.temporarySnapshotRoot,
    };
  }
  const ledgerRoot = input.overrideRoot ?? input.legacyRoot;
  return {
    ledgerPath: joinPath(ledgerRoot, `${input.skillName}.json`),
    snapshotRoot: input.temporarySnapshotRoot,
  };
};

export const temporarySnapshotRootFor = (
  input: TemporarySnapshotRootInput,
  joinPath: JoinPath,
  fingerprint: Fingerprint,
): string =>
  joinPath(
    input.temporaryDirectory,
    'agents-evaluation-snapshots',
    fingerprint(input.repositoryRoot).slice(0, 24),
    fingerprint({ ownerRoot: input.ownerRoot, skillName: input.skillName }).slice(0, 24),
  );
