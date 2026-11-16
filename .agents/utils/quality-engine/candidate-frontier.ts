import type { BehaviorRubricAxis } from './evaluation-cases.js';
import { behaviorRubricAxes } from './evaluation-cases.js';

export type CandidateAxisStatus = 'fail' | 'pass';

export interface CandidateCaseResult {
  readonly axes: Readonly<Record<BehaviorRubricAxis, CandidateAxisStatus>>;
  readonly evidencePath: string;
  readonly hardAssertionsPass: boolean;
  readonly taskFamily: string;
}

export interface CandidateSnapshot {
  readonly candidateId: string;
  readonly matrixFingerprint: string;
  readonly snapshotPath: string;
  readonly sourceFingerprint: string;
  readonly validationCases: Readonly<Record<string, CandidateCaseResult>>;
}

interface ParsedCandidateSnapshot extends CandidateSnapshot {
  readonly taskAxes: Readonly<
    Record<string, Readonly<Record<BehaviorRubricAxis, CandidateAxisStatus>>>
  >;
}

const aggregateTaskAxes = (
  validationCases: Readonly<Record<string, CandidateCaseResult>>,
): Record<string, Record<BehaviorRubricAxis, CandidateAxisStatus>> => {
  const families = [...new Set(Object.values(validationCases).map(({ taskFamily }) => taskFamily))];
  return Object.fromEntries(
    families.map((taskFamily) => [
      taskFamily,
      Object.fromEntries(
        behaviorRubricAxes.map((axis) => [
          axis,
          Object.values(validationCases).some(
            (result) => result.taskFamily === taskFamily && result.axes[axis] === 'fail',
          )
            ? 'fail'
            : 'pass',
        ]),
      ),
    ]),
  ) as Record<string, Record<BehaviorRubricAxis, CandidateAxisStatus>>;
};

const dominates = (candidate: ParsedCandidateSnapshot, other: ParsedCandidateSnapshot): boolean => {
  const relations = Object.keys(candidate.taskAxes).map((taskFamily) => {
    const axes = behaviorRubricAxes.map((axis) => {
      const status = candidate.taskAxes[taskFamily][axis];
      const otherStatus = other.taskAxes[taskFamily][axis];
      return status === otherStatus ? 'equal' : status === 'pass' ? 'better' : 'worse';
    });
    return axes.includes('worse') ? 'worse' : axes.includes('better') ? 'better' : 'equal';
  });
  return !relations.includes('worse') && relations.includes('better');
};

const frontierForParsedSnapshots = (
  candidates: readonly ParsedCandidateSnapshot[],
): ParsedCandidateSnapshot[] => {
  const eligible = candidates.filter((candidate) =>
    Object.values(candidate.validationCases).every(({ hardAssertionsPass }) => hardAssertionsPass),
  );
  return eligible
    .filter(
      (candidate) => !eligible.some((other) => other !== candidate && dominates(other, candidate)),
    )
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId, 'en'));
};

const hasAllValidationAxesPass = (candidate: ParsedCandidateSnapshot): boolean =>
  Object.values(candidate.validationCases).every((result) =>
    behaviorRubricAxes.every((axis) => result.axes[axis] === 'pass'),
  );

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'));
  const expected = [...keys].sort((left, right) => left.localeCompare(right, 'en'));
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const hasNoRegression = (
  candidate: ParsedCandidateSnapshot,
  baseline: ParsedCandidateSnapshot,
): boolean =>
  Object.entries(baseline.validationCases).every(([caseId, baselineResult]) =>
    behaviorRubricAxes.every(
      (axis) =>
        !(
          baselineResult.axes[axis] === 'pass'
          && candidate.validationCases[caseId].axes[axis] === 'fail'
        ),
    ),
  );

const hasValidationGain = (
  candidate: ParsedCandidateSnapshot,
  baseline: ParsedCandidateSnapshot,
): boolean =>
  Object.entries(baseline.validationCases).some(([caseId, baselineResult]) =>
    behaviorRubricAxes.some(
      (axis) =>
        baselineResult.axes[axis] === 'fail'
        && candidate.validationCases[caseId].axes[axis] === 'pass',
    ),
  );

const isBlank = (value: string): boolean => value.trim().length === 0;

const isFingerprint = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

const isNonBlankString = (value: unknown): value is string =>
  typeof value === 'string' && !isBlank(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const axesFor = (caseId: string, value: unknown): CandidateCaseResult['axes'] => {
  if (!isRecord(value) || !hasExactKeys(value, behaviorRubricAxes)) {
    throw new Error(`Candidate snapshot has incomplete rubric axes: ${caseId}`);
  }
  const axes = {} as Record<BehaviorRubricAxis, CandidateAxisStatus>;
  for (const axis of behaviorRubricAxes) {
    const status = value[axis];
    if (status !== 'pass' && status !== 'fail') {
      throw new Error(`Candidate snapshot has an invalid axis status: ${caseId}/${axis}`);
    }
    axes[axis] = status;
  }
  return axes;
};

const candidateSnapshotObjectFor = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error('Candidate snapshot must be an object.');
  }
  if (
    !hasExactKeys(value, [
      'candidateId',
      'matrixFingerprint',
      'snapshotPath',
      'sourceFingerprint',
      'validationCases',
    ])
  ) {
    throw new Error('Candidate snapshot has missing or unsupported fields.');
  }
  return value;
};

const publicSnapshotFor = (snapshot: ParsedCandidateSnapshot): CandidateSnapshot => ({
  candidateId: snapshot.candidateId,
  matrixFingerprint: snapshot.matrixFingerprint,
  snapshotPath: snapshot.snapshotPath,
  sourceFingerprint: snapshot.sourceFingerprint,
  validationCases: snapshot.validationCases,
});

const sameValidationCoverage = (
  left: ParsedCandidateSnapshot,
  right: ParsedCandidateSnapshot,
): boolean => {
  const leftCases = Object.keys(left.validationCases).sort();
  const rightCases = Object.keys(right.validationCases).sort();
  return (
    leftCases.length === rightCases.length
    && leftCases.every(
      (caseId, index) =>
        caseId === rightCases[index]
        && left.validationCases[caseId].taskFamily === right.validationCases[caseId].taskFamily,
    )
  );
};

const validateBaselineSnapshot = (baseline: ParsedCandidateSnapshot): void => {
  if (
    !Object.values(baseline.validationCases).every(({ hardAssertionsPass }) => hardAssertionsPass)
  ) {
    throw new Error('Baseline validation requires passing hard assertions.');
  }
};

const validateComparableSnapshots = (snapshots: readonly ParsedCandidateSnapshot[]): void => {
  const first = snapshots[0];
  for (const snapshot of snapshots) {
    if (first && snapshot.matrixFingerprint !== first.matrixFingerprint) {
      throw new Error('Candidate snapshots do not share the frozen matrix fingerprint.');
    }
    if (first && !sameValidationCoverage(snapshot, first)) {
      throw new Error('Candidate snapshots have different validation case coverage.');
    }
  }
};

const validateUniqueSnapshots = (snapshots: readonly ParsedCandidateSnapshot[]): void => {
  const candidateIds = new Set<string>();
  const sourceFingerprints = new Set<string>();
  for (const snapshot of snapshots) {
    if (candidateIds.has(snapshot.candidateId)) {
      throw new Error(`Candidate snapshot id is duplicated: ${snapshot.candidateId}`);
    }
    candidateIds.add(snapshot.candidateId);
    if (sourceFingerprints.has(snapshot.sourceFingerprint)) {
      throw new Error(`Candidate source fingerprint is duplicated: ${snapshot.sourceFingerprint}`);
    }
    sourceFingerprints.add(snapshot.sourceFingerprint);
  }
};

const validationCaseFor = (caseId: string, value: unknown): CandidateCaseResult => {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['axes', 'evidencePath', 'hardAssertionsPass', 'taskFamily'])
  ) {
    throw new Error(`Candidate snapshot has malformed validation evidence: ${caseId}`);
  }
  if (!isNonBlankString(caseId) || !isNonBlankString(value.taskFamily)) {
    throw new Error('Candidate snapshot needs nonblank validation case ids and task families.');
  }
  if (!isNonBlankString(value.evidencePath) || typeof value.hardAssertionsPass !== 'boolean') {
    throw new Error(`Candidate snapshot has incomplete validation evidence: ${caseId}`);
  }
  return {
    axes: axesFor(caseId, value.axes),
    evidencePath: value.evidencePath,
    hardAssertionsPass: value.hardAssertionsPass,
    taskFamily: value.taskFamily,
  };
};

const validationCasesFor = (value: unknown): Record<string, CandidateCaseResult> => {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new Error('Candidate snapshot needs validation case evidence.');
  }
  return Object.fromEntries(
    Object.entries(value).map(([caseId, result]) => [caseId, validationCaseFor(caseId, result)]),
  );
};

const candidateSnapshotFor = (value: unknown): ParsedCandidateSnapshot => {
  const snapshot = candidateSnapshotObjectFor(value);
  if (!isNonBlankString(snapshot.candidateId) || !isNonBlankString(snapshot.snapshotPath)) {
    throw new Error('Candidate snapshot needs a candidate id and snapshot path.');
  }
  if (!isFingerprint(snapshot.matrixFingerprint) || !isFingerprint(snapshot.sourceFingerprint)) {
    throw new Error('Candidate snapshot fingerprints must be lowercase SHA-256 values.');
  }
  const validationCases = validationCasesFor(snapshot.validationCases);
  return {
    candidateId: snapshot.candidateId,
    matrixFingerprint: snapshot.matrixFingerprint,
    snapshotPath: snapshot.snapshotPath,
    sourceFingerprint: snapshot.sourceFingerprint,
    taskAxes: aggregateTaskAxes(validationCases),
    validationCases,
  };
};

const candidateSnapshotsFor = (snapshots: unknown): ParsedCandidateSnapshot[] => {
  if (!Array.isArray(snapshots)) {
    throw new Error('Candidate snapshots must be an array.');
  }
  const candidates = snapshots.map(candidateSnapshotFor);
  validateUniqueSnapshots(candidates);
  validateComparableSnapshots(candidates);
  return candidates;
};

export const paretoFrontierFor = (snapshots: readonly CandidateSnapshot[]): CandidateSnapshot[] =>
  frontierForParsedSnapshots(candidateSnapshotsFor(snapshots)).map(publicSnapshotFor);

const validationGainCount = (
  candidate: ParsedCandidateSnapshot,
  baseline: ParsedCandidateSnapshot,
): number =>
  Object.entries(baseline.validationCases).reduce(
    (count, [caseId, baselineResult]) =>
      count
      + behaviorRubricAxes.filter(
        (axis) =>
          baselineResult.axes[axis] === 'fail'
          && candidate.validationCases[caseId].axes[axis] === 'pass',
      ).length,
    0,
  );

export const selectValidationCandidate = (
  snapshots: readonly CandidateSnapshot[],
  baselineSnapshot: CandidateSnapshot,
): CandidateSnapshot | null => {
  const candidates = candidateSnapshotsFor(snapshots);
  const baseline = candidateSnapshotFor(baselineSnapshot);
  validateBaselineSnapshot(baseline);
  validateUniqueSnapshots([baseline, ...candidates]);
  validateComparableSnapshots([baseline, ...candidates]);
  const eligible = candidates.filter(
    (candidate) =>
      Object.values(candidate.validationCases).every(({ hardAssertionsPass }) => hardAssertionsPass)
      && hasAllValidationAxesPass(candidate)
      && hasNoRegression(candidate, baseline)
      && hasValidationGain(candidate, baseline),
  );
  const selected = frontierForParsedSnapshots(eligible).sort(
    (left, right) =>
      validationGainCount(right, baseline) - validationGainCount(left, baseline)
      || left.candidateId.localeCompare(right.candidateId, 'en'),
  )[0];
  return selected ? publicSnapshotFor(selected) : null;
};
