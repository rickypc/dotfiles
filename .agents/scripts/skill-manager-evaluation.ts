import type { EvaluationCase } from '../utils/quality-engine/evaluation-cases.js';
import { parseEvaluationCasesJsonl } from '../utils/quality-engine/evaluation-cases.js';
import type { MatrixCase } from '../utils/quality-engine/matrix.js';
import { matrixRatchetViolations } from '../utils/quality-engine/matrix.js';
import { fingerprint } from '../utils/quality-engine/packet.js';
import { parseTriggerQuerySet, queryRatchetViolations } from '../utils/quality-engine/train.js';
import { evaluateSkillMatrix, parseMatrixJsonl } from '../utils/skill-manager.js';

interface CaseRetirement {
  readonly caseId: string;
  readonly reason: string;
}

interface RatchetPaths {
  readonly nextPath: string;
  readonly previousPath: string;
  readonly retirementPath?: string;
  readonly type: 'cases' | 'queries';
}

interface RatchetResult {
  readonly details: Record<string, unknown>;
  readonly violations: readonly string[];
}

type Read = (path: string) => Promise<string | Buffer>;

type Write = (message: string) => void;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const evaluationCasesFor = (content: string): EvaluationCase[] => {
  const versionedContent = content
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        throw new Error(`Evaluation case line ${index + 1} is not valid JSON.`);
      }
      return JSON.stringify(
        isRecord(value) && !('kind' in value) ? { ...value, kind: 'contract' } : value,
      );
    })
    .join('\n');
  return parseEvaluationCasesJsonl(versionedContent);
};

const hasVersionedCases = (content: string): boolean =>
  content.split(/\r?\n/u).some((line) => {
    if (!line.trim()) {
      return false;
    }
    try {
      const value: unknown = JSON.parse(line);
      return isRecord(value) && (value.kind === 'contract' || value.kind === 'behavior');
    } catch {
      return false;
    }
  });

const legacyMatrixResultFor = (
  previous: string,
  next: string,
  retirementPath: string | undefined,
): RatchetResult => {
  if (retirementPath) {
    throw new Error('Retirement manifests require versioned evaluation case records.');
  }
  return {
    details: {},
    violations: matrixRatchetViolations(parseMatrixJsonl(previous), parseMatrixJsonl(next)),
  };
};

const matrixCaseFor = (item: EvaluationCase): MatrixCase | undefined =>
  item.kind === 'contract'
    ? {
        assertions: item.assertions,
        failureMode: item.failureMode,
        id: item.id,
        independentVerifier: item.independentVerifier,
        repairBoundary: item.repairBoundary,
        scenario: item.scenario,
        visibility: item.visibility,
      }
    : undefined;

const contractViolationsFor = (
  previous: readonly EvaluationCase[],
  next: readonly EvaluationCase[],
  retirements: readonly CaseRetirement[],
): string[] => {
  const retiredIds = new Set(retirements.map(({ caseId }) => caseId));
  const previousContracts = previous
    .filter((item) => item.kind === 'contract' && !retiredIds.has(item.id))
    .map(matrixCaseFor)
    .filter((item): item is MatrixCase => item !== undefined);
  const nextContracts = next
    .map(matrixCaseFor)
    .filter((item): item is MatrixCase => item !== undefined);
  return matrixRatchetViolations(previousContracts, nextContracts);
};

const parseRetirements = (content: string): readonly CaseRetirement[] => {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new Error('Retirement manifest is not valid JSON.');
  }
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['retirements', 'schemaVersion'])
    || value.schemaVersion !== 1
    || !Array.isArray(value.retirements)
  ) {
    throw new Error('Retirement manifest must contain schemaVersion 1 and a retirements array.');
  }
  const seen = new Set<string>();
  return value.retirements.map((item, index): CaseRetirement => {
    if (
      !isRecord(item)
      || !hasExactKeys(item, ['caseId', 'reason'])
      || typeof item.caseId !== 'string'
      || !item.caseId.trim()
      || typeof item.reason !== 'string'
      || !item.reason.trim()
      || seen.has(item.caseId)
    ) {
      throw new Error(`Retirement record ${index + 1} is malformed or duplicated.`);
    }
    seen.add(item.caseId);
    return { caseId: item.caseId, reason: item.reason };
  });
};

const querySetResultFor = (paths: RatchetPaths, previous: string, next: string): RatchetResult => ({
  details: {},
  violations: queryRatchetViolations(
    parseTriggerQuerySet(previous, paths.previousPath),
    parseTriggerQuerySet(next, paths.nextPath),
  ),
});

const ratchetPathsFor = (args: readonly string[], usage: () => string): RatchetPaths => {
  const [, previousPath, nextPath, retirementPath] = args;
  const type = previousPath?.endsWith('.jsonl') ? 'cases' : 'queries';
  const validRetirementPath =
    type === 'cases' && retirementPath?.startsWith('/') && retirementPath.endsWith('.json');
  const validPaths =
    previousPath?.startsWith('/')
    && nextPath?.startsWith('/')
    && previousPath.endsWith(type === 'cases' ? '.jsonl' : '.json')
    && nextPath.endsWith(type === 'cases' ? '.jsonl' : '.json');
  if (
    (args.length !== 3 && args.length !== 4)
    || !validPaths
    || (retirementPath !== undefined && !validRetirementPath)
  ) {
    throw new Error(usage());
  }
  return {
    nextPath,
    previousPath,
    ...(retirementPath ? { retirementPath } : {}),
    type,
  };
};

const retirementViolationsFor = (
  previous: readonly EvaluationCase[],
  next: readonly EvaluationCase[],
  retirements: readonly CaseRetirement[],
): string[] => {
  const previousIds = new Set(previous.map(({ id }) => id));
  const nextIds = new Set(next.map(({ id }) => id));
  return retirements.flatMap(({ caseId }) => {
    if (!previousIds.has(caseId)) {
      return [`Retirement ${caseId} does not match a previous case.`];
    }
    return nextIds.has(caseId) ? [`Retirement ${caseId} is stale because the case remains.`] : [];
  });
};

export const runSkillManagerEvaluation = async (
  args: readonly string[],
  read: Read,
  write: Write,
  usage: () => string,
): Promise<void> => {
  const [, phase, matrixPath, skillFilePath] = args;
  if (!phase || !matrixPath || !skillFilePath || args.length !== 4) {
    throw new Error(usage());
  }
  const [matrixContent, sourceContent] = await Promise.all([read(matrixPath), read(skillFilePath)]);
  const phaseFor = {
    baseline: 'baseline_recorded',
    candidate: 'candidate_checked',
    challenge: 'challenge_checked',
  } as const;
  const selectedPhase = phaseFor[phase as keyof typeof phaseFor];
  if (!selectedPhase) {
    throw new Error(usage());
  }
  const sourceText = String(sourceContent);
  const receipt = evaluateSkillMatrix(
    parseMatrixJsonl(String(matrixContent)),
    { delegatedChecks: {}, ownedFiles: new Set(), text: sourceText },
    fingerprint(sourceText),
    selectedPhase,
  );
  write(JSON.stringify(receipt, null, 2));
};

const stableJsonFor = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonFor).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJsonFor(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

const recordViolationsFor = (
  previous: readonly EvaluationCase[],
  next: readonly EvaluationCase[],
  retirements: readonly CaseRetirement[],
): string[] => {
  const nextById = new Map(next.map((item) => [item.id, item]));
  const retiredIds = new Set(retirements.map(({ caseId }) => caseId));
  return previous.flatMap((before) => {
    const after = nextById.get(before.id);
    if (!after) {
      return retiredIds.has(before.id)
        ? []
        : [`Case ${before.id} was removed without an owner-local retirement record.`];
    }
    if (before.kind !== after.kind) {
      return [`Case ${before.id} changed kind.`];
    }
    return before.kind === 'behavior' && stableJsonFor(before) !== stableJsonFor(after)
      ? [`Behavior case ${before.id} changed its frozen record.`]
      : [];
  });
};

const evaluationCaseViolationsFor = (
  previous: readonly EvaluationCase[],
  next: readonly EvaluationCase[],
  retirements: readonly CaseRetirement[],
): string[] => [
  ...retirementViolationsFor(previous, next, retirements),
  ...recordViolationsFor(previous, next, retirements),
  ...contractViolationsFor(previous, next, retirements),
];

const versionedCasesResultFor = (
  previousContent: string,
  nextContent: string,
  retirementContent: string,
  retirementRequired: boolean,
): RatchetResult => {
  const previous = evaluationCasesFor(previousContent);
  const next = evaluationCasesFor(nextContent);
  const retirements = retirementRequired ? parseRetirements(retirementContent) : [];
  const violations = evaluationCaseViolationsFor(previous, next, retirements);
  return {
    details: {
      addedCaseIds: next
        .filter(({ id }) => !previous.some((item) => item.id === id))
        .map(({ id }) => id)
        .sort((left, right) => left.localeCompare(right, 'en')),
      caseCounts: { next: next.length, previous: previous.length },
      retiredCaseIds: retirements.map(({ caseId }) => caseId),
      schemaVersion: 2,
    },
    violations,
  };
};

const ratchetResultFor = (paths: RatchetPaths, contents: readonly string[]): RatchetResult => {
  const [previous = '', next = '', retirement = ''] = contents;
  if (paths.type === 'queries') {
    return querySetResultFor(paths, previous, next);
  }
  if (!hasVersionedCases(previous) && !hasVersionedCases(next)) {
    return legacyMatrixResultFor(previous, next, paths.retirementPath);
  }
  return versionedCasesResultFor(previous, next, retirement, paths.retirementPath !== undefined);
};

export const runSkillManagerRatchet = async (
  args: readonly string[],
  read: Read,
  write: Write,
  usage: () => string,
): Promise<void> => {
  const paths = ratchetPathsFor(args, usage);
  const inputPaths = paths.retirementPath
    ? [paths.previousPath, paths.nextPath, paths.retirementPath]
    : [paths.previousPath, paths.nextPath];
  const contents = (await Promise.all(inputPaths.map(read))).map(String);
  const result = ratchetResultFor(paths, contents);
  if (result.violations.length > 0) {
    throw new Error(`Ratchet violations: ${result.violations.join(' ')}`);
  }
  write(
    JSON.stringify(
      {
        ...result.details,
        nextPath: paths.nextPath,
        previousPath: paths.previousPath,
        status: 'ratchet-ok',
        violations: result.violations,
      },
      null,
      2,
    ),
  );
};
