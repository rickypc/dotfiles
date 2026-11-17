import type { EvaluationCase } from './evaluation-cases.js';

export const BEHAVIOR_RUN_SCHEMA_VERSION = 8 as const;
export const BEHAVIOR_RUN_OUTPUT_REFERENCE_SCHEMA_VERSION = 9 as const;
export const BEHAVIOR_RUNS_PER_CASE = 3 as const;

export interface BehaviorRunAggregateCaseReceipt {
  readonly axes: Readonly<Record<string, BehaviorRunSampleSummary<BehaviorRunAxisStatus>>>;
  readonly axisEvidence: Readonly<Record<string, readonly string[]>>;
  readonly caseId: string;
  readonly hardAssertionEvidence: Readonly<Record<string, readonly string[]>>;
  readonly hardAssertions: Readonly<
    Record<string, BehaviorRunSampleSummary<BehaviorRunHardAssertionStatus>>
  >;
  readonly hardAssertionsPass: BehaviorRunSampleSummary<boolean>;
  readonly runEvidence: readonly {
    readonly diffDigest: string;
    readonly graderSessionId: string;
    readonly outputDigest: string;
    readonly runId: string;
    readonly runIndex: number;
    readonly targetSessionId: string;
    readonly toolTraceEvidence: 'reported-in-session';
    readonly toolTraceDigest: string;
  }[];
  readonly taskFamily: string;
}

export interface BehaviorRunAggregateReceipt {
  readonly admission: 'run-id-linked';
  readonly aggregateDigest: string;
  readonly caseResults: readonly BehaviorRunAggregateCaseReceipt[];
  readonly decision: 'provisional' | 'reject';
  readonly evaluationId: string;
  readonly metadata: Omit<BehaviorRunMetadata, 'outputReferenceVersion' | 'runId' | 'runIndex'>;
  readonly ownerId: string;
  readonly requiredRuns: number;
  readonly runResults: readonly {
    readonly resultsDigest: string;
    readonly runId: string;
    readonly runIndex: number;
  }[];
  readonly schemaVersion: 3;
  readonly split: BehaviorRunSplit;
}

export type BehaviorRunAgreement = 'agreed' | 'disputed';

export interface BehaviorRunAssertion {
  readonly expected: string;
  readonly id: string;
  readonly kind:
    | 'diff-contains'
    | 'diff-omits'
    | 'output-contains'
    | 'output-omits'
    | 'trace-contains'
    | 'trace-omits';
}

export type BehaviorRunAxisStatus = 'fail' | 'pass';

export interface BehaviorRunCase {
  readonly hardAssertions: readonly BehaviorRunAssertion[];
  readonly id: string;
  readonly split: BehaviorRunSplit;
  readonly taskFamily: string;
}

export interface BehaviorRunCaseReceipt {
  readonly axes: Readonly<Record<string, BehaviorRunAxisStatus>>;
  readonly axisEvidence: Readonly<Record<string, string>>;
  readonly caseId: string;
  readonly diff: string;
  readonly diffDigest: string;
  readonly graderSessionId: string;
  readonly hardAssertions: readonly BehaviorRunHardAssertionResult[];
  readonly hardAssertionsPass: boolean;
  readonly output: string;
  readonly outputDigest: string;
  readonly runId: string;
  readonly targetSessionId: string;
  readonly taskFamily: string;
  readonly toolTrace: string;
  readonly toolTraceDigest: string;
  readonly toolTraceEvidence: 'reported-in-session';
}

export interface BehaviorRunCaseSessions {
  readonly caseId: string;
  readonly graderSessionId: string;
  readonly targetSessionId: string;
}

export interface BehaviorRunExpected {
  readonly axes: readonly string[];
  readonly cases: readonly BehaviorRunCase[];
  readonly metadata: BehaviorRunMetadata;
  readonly sessions: readonly BehaviorRunCaseSessions[];
  readonly split: BehaviorRunSplit;
}

export interface BehaviorRunHardAssertionResult {
  readonly assertionId: string;
  readonly evidence: string;
  readonly expected: string;
  readonly kind: BehaviorRunAssertion['kind'];
  readonly status: BehaviorRunHardAssertionStatus;
}

export type BehaviorRunHardAssertionStatus = 'failed' | 'passed';

export interface BehaviorRunMetadata {
  readonly candidateId: string;
  readonly evaluationId: string;
  readonly graderModelId: string;
  readonly graderPromptVersion: string;
  readonly graderRuntimeId: string;
  readonly manifestFingerprint: string;
  readonly matrixFingerprint: string;
  readonly modelId: string;
  readonly outputReferenceVersion?: 2;
  readonly ownerId: string;
  readonly reflectionPromptVersion: string;
  readonly rubricFingerprint: string;
  readonly runId: string;
  readonly runIndex: number;
  readonly runnerVersion: string;
  readonly sourceFingerprint: string;
  readonly targetRuntimeId: string;
  readonly taskPromptVersion: string;
}

export interface BehaviorRunReceipt {
  readonly admission: 'run-id-linked';
  readonly caseResults: readonly BehaviorRunCaseReceipt[];
  readonly decision: 'provisional' | 'reject';
  readonly metadata: BehaviorRunMetadata;
  readonly resultsDigest: string;
  readonly schemaVersion:
    | typeof BEHAVIOR_RUN_OUTPUT_REFERENCE_SCHEMA_VERSION
    | typeof BEHAVIOR_RUN_SCHEMA_VERSION;
  readonly split: BehaviorRunSplit;
}

export interface BehaviorRunSampleSummary<T> {
  readonly outcomes: readonly T[];
  readonly passCount: number;
  readonly passRate: number;
  readonly sampleVariance: number;
}

export type BehaviorRunSplit = 'challenge' | 'train' | 'validation';

interface EvidencePayload {
  readonly diff: string;
  readonly output: string;
  readonly toolTrace: string;
}

const legacyMetadataFields = [
  'candidateId',
  'evaluationId',
  'graderModelId',
  'graderPromptVersion',
  'graderRuntimeId',
  'manifestFingerprint',
  'matrixFingerprint',
  'modelId',
  'ownerId',
  'reflectionPromptVersion',
  'runId',
  'runIndex',
  'runnerVersion',
  'rubricFingerprint',
  'sourceFingerprint',
  'targetRuntimeId',
  'taskPromptVersion',
] as const;

const metadataFields = [...legacyMetadataFields, 'outputReferenceVersion'] as const;

const metadataFingerprintFields = [
  'manifestFingerprint',
  'matrixFingerprint',
  'rubricFingerprint',
  'sourceFingerprint',
] as const;

const metadataStringFields = [
  'candidateId',
  'evaluationId',
  'graderModelId',
  'graderPromptVersion',
  'graderRuntimeId',
  'modelId',
  'ownerId',
  'reflectionPromptVersion',
  'runId',
  'runnerVersion',
  'targetRuntimeId',
  'taskPromptVersion',
] as const;

const recordFields = [
  'caseId',
  'diff',
  'diffDigest',
  'graderSessionId',
  'metadata',
  'output',
  'outputDigest',
  'runId',
  'schemaVersion',
  'score',
  'split',
  'taskFamily',
  'targetSessionId',
  'toolTraceEvidence',
  'toolTrace',
  'toolTraceDigest',
] as const;

const scoreFields = [
  'axisResults',
  'caseId',
  'hardAssertions',
  'matrixFingerprint',
  'sourceFingerprint',
] as const;

export const assertBehaviorRunOutputReference = (
  output: string,
  metadata: Pick<BehaviorRunMetadata, 'outputReferenceVersion' | 'runId' | 'runIndex'>,
): void => {
  if (metadata.outputReferenceVersion !== 2) {
    return;
  }
  const lines = output.split(/\r?\n/u);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  const runReference = `run-${metadata.runIndex}-${metadata.runId}`;
  const acceptedReferences = new Set([`runId: ${runReference}`, `runId: \`${runReference}\``]);
  if (lines.filter((line) => acceptedReferences.has(line)).length !== 1) {
    throw new Error(
      'Behavior run output must contain exactly one standalone runIndex-linked runId reference.',
    );
  }
};

const evidenceFor = (evidence: EvidencePayload, kind: BehaviorRunAssertion['kind']): string => {
  if (kind.startsWith('output-')) {
    return evidence.output;
  }
  if (kind.startsWith('trace-')) {
    return evidence.toolTrace;
  }
  return evidence.diff;
};

const hardAssertionResultFor = (
  actual: Record<string, unknown> | undefined,
  assertion: BehaviorRunAssertion,
  evaluationCase: BehaviorRunCase,
  evidence: EvidencePayload,
): BehaviorRunHardAssertionResult => {
  if (!actual) {
    throw new Error(
      `Behavior score hard assertion does not match the frozen case: ${evaluationCase.id}/${assertion.id}`,
    );
  }
  const evidenceName = assertion.kind.startsWith('output-')
    ? 'output'
    : assertion.kind.startsWith('trace-')
      ? 'toolTrace'
      : 'diff';
  const contains = evidenceFor(evidence, assertion.kind).includes(assertion.expected);
  const expectedStatus = contains === assertion.kind.endsWith('contains') ? 'passed' : 'failed';
  const expectedEvidence = `${evidenceName} ${contains ? 'contains' : 'omits'} expected literal: ${assertion.expected}`;
  if (actual.status !== expectedStatus || actual.evidence !== expectedEvidence) {
    throw new Error(
      `Behavior score hard assertion disagrees with captured evidence: ${evaluationCase.id}/${assertion.id}`,
    );
  }
  return {
    assertionId: assertion.id,
    evidence: actual.evidence as string,
    expected: assertion.expected,
    kind: assertion.kind,
    status: actual.status as BehaviorRunHardAssertionStatus,
  };
};

const hasExactKeys = (value: Record<string, unknown>, fields: readonly string[]): boolean => {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'));
  const expected = [...fields].sort((left, right) => left.localeCompare(right, 'en'));
  return (
    actual.length === expected.length && actual.every((field, index) => field === expected[index])
  );
};

export const isBehaviorRunId = (value: unknown): value is string =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertMetadataShape = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(
      'Behavior run metadata is missing required fields or contains unsupported fields.',
    );
  }
  const expectedFields =
    value.outputReferenceVersion === undefined ? legacyMetadataFields : metadataFields;
  if (!hasExactKeys(value, expectedFields)) {
    throw new Error(
      'Behavior run metadata is missing required fields or contains unsupported fields.',
    );
  }
  return value;
};

export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Behavior run result cannot be canonically serialized.');
  }
  return serialized;
};

export const evaluationMatrixFingerprintFor = (
  cases: readonly EvaluationCase[],
  sha256: (value: string) => string,
): string =>
  sha256(canonicalJson([...cases].sort((left, right) => left.id.localeCompare(right.id, 'en'))));

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

const evidenceDigestMatches = (
  value: unknown,
  digest: unknown,
  sha256: (value: string) => string,
): boolean => typeof value === 'string' && isSha256(digest) && sha256(value) === digest;

const nonblankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const addAxisResult = (
  axes: Record<string, BehaviorRunAxisStatus>,
  axisEvidence: Record<string, string>,
  result: unknown,
  expectedAxes: readonly string[],
  caseId: string,
  evidence: EvidencePayload,
): void => {
  if (
    !isRecord(result)
    || !hasExactKeys(result, ['agreement', 'axis', 'evidence', 'status'])
    || !nonblankString(result.axis)
    || !nonblankString(result.evidence)
    || (result.status !== 'pass' && result.status !== 'fail')
    || (result.agreement !== 'agreed' && result.agreement !== 'disputed')
    || result.agreement !== 'agreed'
    || !expectedAxes.includes(result.axis)
    || axes[result.axis] !== undefined
    || ![evidence.output, evidence.diff, evidence.toolTrace].some((text) =>
      text.includes(result.evidence as string),
    )
  ) {
    throw new Error(`Behavior score has an invalid, duplicate, or uncited rubric axis: ${caseId}`);
  }
  axes[result.axis] = result.status;
  axisEvidence[result.axis] = result.evidence;
};

const addExpectedCase = (byId: Map<string, BehaviorRunCase>, item: BehaviorRunCase): void => {
  if (!nonblankString(item.id) || byId.has(item.id)) {
    throw new Error(`Behavior run case IDs must be nonblank and unique: ${item.id}`);
  }
  if (!nonblankString(item.taskFamily) || item.hardAssertions.length === 0) {
    throw new Error(`Behavior run case is incomplete: ${item.id}`);
  }
  const assertionIds = item.hardAssertions.map(({ id }) => id);
  const invalidAssertionIds = assertionIds.some((id) => !nonblankString(id));
  if (invalidAssertionIds || new Set(assertionIds).size !== assertionIds.length) {
    throw new Error(`Behavior run case hard assertion IDs must be nonblank and unique: ${item.id}`);
  }
  byId.set(item.id, item);
};

const assertMetadataValues = (value: Record<string, unknown>): void => {
  if (value.outputReferenceVersion !== undefined && value.outputReferenceVersion !== 2) {
    throw new Error('Behavior run metadata outputReferenceVersion must be 2 when present.');
  }
  if (!Number.isInteger(value.runIndex) || Number(value.runIndex) < 1) {
    throw new Error('Behavior run metadata runIndex must be a positive integer.');
  }
  if (metadataFingerprintFields.some((field) => !isSha256(value[field]))) {
    throw new Error('Behavior run metadata fingerprints must be lowercase SHA-256 values.');
  }
  if (metadataStringFields.some((field) => !nonblankString(value[field]))) {
    throw new Error('Behavior run metadata string fields must be nonblank.');
  }
  if (!isBehaviorRunId(value.evaluationId)) {
    throw new Error('Behavior run metadata evaluationId must be a UUIDv4.');
  }
  if (!isBehaviorRunId(value.runId)) {
    throw new Error('Behavior run metadata runId must be a fresh UUIDv4.');
  }
};

const assertMetadata = (value: unknown): BehaviorRunMetadata => {
  const metadata = assertMetadataShape(value);
  assertMetadataValues(metadata);
  return metadata as unknown as BehaviorRunMetadata;
};

const axisResultsFor = (
  value: unknown,
  expectedAxes: readonly string[],
  caseId: string,
  evidence: EvidencePayload,
): {
  readonly axes: Readonly<Record<string, BehaviorRunAxisStatus>>;
  readonly axisEvidence: Readonly<Record<string, string>>;
} => {
  if (!Array.isArray(value) || value.length !== expectedAxes.length) {
    throw new Error(`Behavior score is missing one or more rubric axes: ${caseId}`);
  }
  const axes: Record<string, BehaviorRunAxisStatus> = {};
  const axisEvidence: Record<string, string> = {};
  value.forEach((result) => {
    addAxisResult(axes, axisEvidence, result, expectedAxes, caseId, evidence);
  });
  return { axes, axisEvidence };
};

const expectedSessionMap = (
  expected: BehaviorRunExpected,
  cases: ReadonlyMap<string, BehaviorRunCase>,
): Map<string, BehaviorRunCaseSessions> => {
  const selectedSessions = expected.sessions;
  if (selectedSessions.length !== cases.size) {
    throw new Error(
      `Behavior run requires one target and grader session pair per ${expected.split} case.`,
    );
  }
  const byCaseId = new Map<string, BehaviorRunCaseSessions>();
  const targetSessionIds = new Set<string>();
  const graderSessionIds = new Set<string>();
  for (const sessions of selectedSessions) {
    if (
      !nonblankString(sessions.caseId)
      || !nonblankString(sessions.targetSessionId)
      || !nonblankString(sessions.graderSessionId)
      || sessions.targetSessionId === sessions.graderSessionId
      || !cases.has(sessions.caseId)
      || byCaseId.has(sessions.caseId)
      || graderSessionIds.has(sessions.targetSessionId)
      || targetSessionIds.has(sessions.graderSessionId)
    ) {
      throw new Error(
        'Behavior run session metadata must map every case to one target and one separate grader session.',
      );
    }
    byCaseId.set(sessions.caseId, sessions);
    targetSessionIds.add(sessions.targetSessionId);
    graderSessionIds.add(sessions.graderSessionId);
  }
  return byCaseId;
};

const hardAssertionReceiptFrom = (
  value: unknown,
  evidence: EvidencePayload,
): BehaviorRunHardAssertionResult => {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['assertionId', 'evidence', 'expected', 'kind', 'status'])
    || !nonblankString(value.assertionId)
    || !nonblankString(value.evidence)
    || !nonblankString(value.expected)
    || ![
      'diff-contains',
      'diff-omits',
      'output-contains',
      'output-omits',
      'trace-contains',
      'trace-omits',
    ].includes(String(value.kind))
    || (value.status !== 'passed' && value.status !== 'failed')
  ) {
    throw new Error('Behavior aggregation input contains a malformed hard assertion result.');
  }
  const assertion = value as unknown as BehaviorRunAssertion & {
    readonly assertionId: string;
    readonly evidence: string;
    readonly status: BehaviorRunHardAssertionStatus;
  };
  const evidenceName = assertion.kind.startsWith('output-')
    ? 'output'
    : assertion.kind.startsWith('trace-')
      ? 'toolTrace'
      : 'diff';
  const contains = evidence[evidenceName].includes(assertion.expected);
  const expectedStatus = contains === assertion.kind.endsWith('contains') ? 'passed' : 'failed';
  const expectedEvidence = `${evidenceName} ${contains ? 'contains' : 'omits'} expected literal: ${assertion.expected}`;
  if (assertion.status !== expectedStatus || assertion.evidence !== expectedEvidence) {
    throw new Error('Behavior aggregation input hard assertion status disagrees with evidence.');
  }
  return assertion as BehaviorRunHardAssertionResult;
};

const behaviorRunCaseReceiptFields = [
  'axes',
  'axisEvidence',
  'caseId',
  'diff',
  'diffDigest',
  'graderSessionId',
  'hardAssertions',
  'hardAssertionsPass',
  'output',
  'outputDigest',
  'runId',
  'targetSessionId',
  'taskFamily',
  'toolTrace',
  'toolTraceDigest',
  'toolTraceEvidence',
] as const;

const assertBehaviorRunCaseReceiptShape: (
  value: unknown,
) => asserts value is Record<string, unknown> = (value) => {
  if (
    !isRecord(value)
    || !hasExactKeys(value, behaviorRunCaseReceiptFields)
    || !nonblankString(value.caseId)
    || !nonblankString(value.taskFamily)
    || !isBehaviorRunId(value.runId)
    || value.toolTraceEvidence !== 'reported-in-session'
    || typeof value.hardAssertionsPass !== 'boolean'
    || !nonblankString(value.targetSessionId)
    || !nonblankString(value.graderSessionId)
    || value.targetSessionId === value.graderSessionId
    || !Array.isArray(value.hardAssertions)
    || value.hardAssertions.length === 0
  ) {
    throw new Error('Behavior aggregation input has malformed or duplicate case evidence.');
  }
};

const behaviorRunResultRecordFrom = (
  value: unknown,
  split: BehaviorRunSplit,
): Record<string, unknown> => {
  if (!isRecord(value) || !hasExactKeys(value, recordFields)) {
    throw new Error('Behavior run result is malformed or uses an unsupported schema.');
  }
  const metadata = assertMetadata(value.metadata);
  const expectedSchemaVersion =
    metadata.outputReferenceVersion === 2
      ? BEHAVIOR_RUN_OUTPUT_REFERENCE_SCHEMA_VERSION
      : BEHAVIOR_RUN_SCHEMA_VERSION;
  if (value.schemaVersion !== expectedSchemaVersion) {
    throw new Error('Behavior run result schema does not match its output reference version.');
  }
  if (
    !nonblankString(value.caseId)
    || value.split !== split
    || !nonblankString(value.taskFamily)
    || !isBehaviorRunId(value.runId)
    || !nonblankString(value.targetSessionId)
    || !nonblankString(value.graderSessionId)
    || typeof value.output !== 'string'
    || typeof value.diff !== 'string'
    || typeof value.toolTrace !== 'string'
    || value.toolTraceEvidence !== 'reported-in-session'
    || !isSha256(value.outputDigest)
    || !isSha256(value.diffDigest)
    || !isSha256(value.toolTraceDigest)
  ) {
    throw new Error('Behavior run result has incomplete fields or invalid evidence hashes.');
  }
  return value;
};

const evidenceFromBehaviorRunCaseReceipt = (
  value: Record<string, unknown>,
  sha256: (value: string) => string,
): EvidencePayload => {
  if (
    typeof value.diff !== 'string'
    || typeof value.output !== 'string'
    || typeof value.toolTrace !== 'string'
    || !evidenceDigestMatches(value.diff, value.diffDigest, sha256)
    || !evidenceDigestMatches(value.output, value.outputDigest, sha256)
    || !evidenceDigestMatches(value.toolTrace, value.toolTraceDigest, sha256)
  ) {
    throw new Error('Behavior aggregation input has malformed or duplicate case evidence.');
  }
  if (
    !isRecord(value.axes)
    || !isRecord(value.axisEvidence)
    || Object.keys(value.axes).length === 0
    || Object.values(value.axes).some((status) => status !== 'pass' && status !== 'fail')
    || JSON.stringify(Object.keys(value.axes).sort())
      !== JSON.stringify(Object.keys(value.axisEvidence).sort())
    || Object.values(value.axisEvidence).some(
      (item) =>
        !nonblankString(item)
        || ![value.output as string, value.diff as string, value.toolTrace as string].some((text) =>
          text.includes(item),
        ),
    )
  ) {
    throw new Error('Behavior aggregation input has malformed or duplicate case evidence.');
  }
  return {
    diff: value.diff,
    output: value.output,
    toolTrace: value.toolTrace,
  };
};

const expectedRunDecision = (
  caseResults: readonly BehaviorRunCaseReceipt[],
): 'provisional' | 'reject' =>
  caseResults.every(
    ({ axes, hardAssertionsPass }) =>
      hardAssertionsPass && Object.values(axes).every((status) => status === 'pass'),
  )
    ? 'provisional'
    : 'reject';

const hardAssertionReceiptsFrom = (
  value: readonly unknown[],
  evidence: EvidencePayload,
): readonly BehaviorRunHardAssertionResult[] => {
  const ids = new Set<string>();
  return value.map((item) => {
    const assertion = hardAssertionReceiptFrom(item, evidence);
    if (ids.has(assertion.assertionId)) {
      throw new Error('Behavior aggregation input has duplicate hard assertion IDs.');
    }
    ids.add(assertion.assertionId);
    return assertion;
  });
};

const behaviorRunCaseReceiptFrom = (
  value: unknown,
  sha256: (value: string) => string,
  caseIds: Set<string>,
  targetSessionIds: Set<string>,
  graderSessionIds: Set<string>,
  expectedMetadata: BehaviorRunMetadata,
): BehaviorRunCaseReceipt => {
  assertBehaviorRunCaseReceiptShape(value);
  if (value.runId !== expectedMetadata.runId) {
    throw new Error('Behavior aggregation case runId does not match its run receipt.');
  }
  assertBehaviorRunOutputReference(value.output as string, expectedMetadata);
  const evidence = evidenceFromBehaviorRunCaseReceipt(value, sha256);
  const hardAssertions = hardAssertionReceiptsFrom(
    value.hardAssertions as readonly unknown[],
    evidence,
  );
  if (value.hardAssertionsPass !== hardAssertions.every(({ status }) => status === 'passed')) {
    throw new Error('Behavior aggregation input hard assertion summary is inconsistent.');
  }
  if (
    caseIds.has(value.caseId as string)
    || value.targetSessionId === value.graderSessionId
    || graderSessionIds.has(value.targetSessionId as string)
    || targetSessionIds.has(value.graderSessionId as string)
  ) {
    throw new Error('Behavior aggregation input has malformed or duplicate case evidence.');
  }
  caseIds.add(value.caseId as string);
  targetSessionIds.add(value.targetSessionId as string);
  graderSessionIds.add(value.graderSessionId as string);
  return { ...value, hardAssertions } as unknown as BehaviorRunCaseReceipt;
};

export const behaviorRunReceiptForAggregation = (
  value: unknown,
  sha256: (value: string) => string,
): BehaviorRunReceipt => {
  const receiptFields = [
    'admission',
    'caseResults',
    'decision',
    'metadata',
    'resultsDigest',
    'schemaVersion',
    'split',
  ];
  if (!isRecord(value) || !hasExactKeys(value, receiptFields)) {
    throw new Error('Behavior aggregation input is not a complete run receipt.');
  }
  const metadata = assertMetadata(value.metadata);
  const expectedSchemaVersion =
    metadata.outputReferenceVersion === 2
      ? BEHAVIOR_RUN_OUTPUT_REFERENCE_SCHEMA_VERSION
      : BEHAVIOR_RUN_SCHEMA_VERSION;
  if (
    value.admission !== 'run-id-linked'
    || value.schemaVersion !== expectedSchemaVersion
    || !['challenge', 'train', 'validation'].includes(String(value.split))
    || !isSha256(value.resultsDigest)
    || !Array.isArray(value.caseResults)
    || value.caseResults.length === 0
    || (value.decision !== 'provisional' && value.decision !== 'reject')
  ) {
    throw new Error('Behavior aggregation input has invalid run receipt fields.');
  }
  const caseIds = new Set<string>();
  const targetSessionIds = new Set<string>();
  const graderSessionIds = new Set<string>();
  const caseResults = value.caseResults.map((result) =>
    behaviorRunCaseReceiptFrom(
      result,
      sha256,
      caseIds,
      targetSessionIds,
      graderSessionIds,
      metadata,
    ),
  );
  if (sha256(canonicalJson(caseResults)) !== value.resultsDigest) {
    throw new Error('Behavior aggregation result fingerprint does not match case results.');
  }
  const decision = expectedRunDecision(caseResults);
  if (value.decision !== decision) {
    throw new Error('Behavior aggregation input decision disagrees with its case outcomes.');
  }
  return {
    admission: 'run-id-linked',
    caseResults,
    decision,
    metadata,
    resultsDigest: value.resultsDigest,
    schemaVersion: expectedSchemaVersion,
    split: value.split as BehaviorRunSplit,
  };
};

const hardAssertionResultsFor = (
  value: unknown,
  evaluationCase: BehaviorRunCase,
  evidence: EvidencePayload,
): readonly BehaviorRunHardAssertionResult[] => {
  if (!Array.isArray(value) || value.length !== evaluationCase.hardAssertions.length) {
    throw new Error(`Behavior score hard assertions are incomplete: ${evaluationCase.id}`);
  }
  const results = new Map<string, Record<string, unknown>>();
  for (const result of value) {
    if (
      !isRecord(result)
      || !hasExactKeys(result, ['assertionId', 'evidence', 'status'])
      || !nonblankString(result.assertionId)
      || !nonblankString(result.evidence)
      || (result.status !== 'passed' && result.status !== 'failed')
      || results.has(result.assertionId)
    ) {
      throw new Error(
        `Behavior score has an invalid or duplicate hard assertion: ${evaluationCase.id}`,
      );
    }
    results.set(result.assertionId, result);
  }
  return evaluationCase.hardAssertions.map((assertion) =>
    hardAssertionResultFor(results.get(assertion.id), assertion, evaluationCase, evidence),
  );
};

const scoreFor = (
  value: unknown,
  evaluationCase: BehaviorRunCase,
  expected: BehaviorRunExpected,
  evidence: EvidencePayload,
): {
  readonly axes: Readonly<Record<string, BehaviorRunAxisStatus>>;
  readonly axisEvidence: Readonly<Record<string, string>>;
  readonly hardAssertions: readonly BehaviorRunHardAssertionResult[];
  readonly hardAssertionsPass: boolean;
} => {
  if (
    !isRecord(value)
    || !hasExactKeys(value, scoreFields)
    || value.caseId !== evaluationCase.id
    || value.matrixFingerprint !== expected.metadata.matrixFingerprint
    || value.sourceFingerprint !== expected.metadata.sourceFingerprint
  ) {
    throw new Error(
      `Behavior score is malformed or bound to different inputs: ${evaluationCase.id}`,
    );
  }
  const axisResults = axisResultsFor(value.axisResults, expected.axes, evaluationCase.id, evidence);
  const hardAssertions = hardAssertionResultsFor(value.hardAssertions, evaluationCase, evidence);
  return {
    axes: axisResults.axes,
    axisEvidence: axisResults.axisEvidence,
    hardAssertions,
    hardAssertionsPass: hardAssertions.every(({ status }) => status === 'passed'),
  };
};

const resultFor = (
  value: unknown,
  expected: BehaviorRunExpected,
  cases: ReadonlyMap<string, BehaviorRunCase>,
  sessions: ReadonlyMap<string, BehaviorRunCaseSessions>,
  sha256: (value: string) => string,
): BehaviorRunCaseReceipt => {
  const row = behaviorRunResultRecordFrom(value, expected.split);
  const metadata = assertMetadata(row.metadata);
  if (row.runId !== metadata.runId || row.runId !== expected.metadata.runId) {
    throw new Error(`Behavior run result runId does not match the frozen host run: ${row.caseId}`);
  }
  if (metadataFields.some((field) => metadata[field] !== expected.metadata[field])) {
    throw new Error(`Behavior run metadata does not match the frozen host run: ${row.caseId}`);
  }
  const evaluationCase = cases.get(row.caseId as string);
  const caseSessions = sessions.get(row.caseId as string);
  if (!evaluationCase || row.taskFamily !== evaluationCase.taskFamily) {
    throw new Error(`Behavior run contains an extra or mismatched case: ${row.caseId}`);
  }
  if (
    !caseSessions
    || row.targetSessionId !== caseSessions.targetSessionId
    || row.graderSessionId !== caseSessions.graderSessionId
    || row.targetSessionId === row.graderSessionId
  ) {
    throw new Error(
      `Behavior target and grader sessions are missing, reused, or mismatched: ${row.caseId}`,
    );
  }
  const evidence = {
    diff: row.diff as string,
    output: row.output as string,
    toolTrace: row.toolTrace as string,
  };
  assertBehaviorRunOutputReference(evidence.output, metadata);
  const expectedHashes = {
    diffDigest: sha256(row.diff as string),
    outputDigest: sha256(row.output as string),
    toolTraceDigest: sha256(row.toolTrace as string),
  };
  if (
    Object.keys(expectedHashes).some(
      (key) => expectedHashes[key as keyof typeof expectedHashes] !== row[key],
    )
  ) {
    throw new Error(`Behavior run evidence hash does not match captured data: ${row.caseId}`);
  }
  const score = scoreFor(row.score, evaluationCase, expected, evidence);
  return {
    axes: score.axes,
    axisEvidence: score.axisEvidence,
    caseId: evaluationCase.id,
    diff: row.diff as string,
    diffDigest: row.diffDigest as string,
    graderSessionId: caseSessions.graderSessionId,
    hardAssertions: score.hardAssertions,
    hardAssertionsPass: score.hardAssertionsPass,
    output: row.output as string,
    outputDigest: row.outputDigest as string,
    runId: row.runId as string,
    targetSessionId: caseSessions.targetSessionId,
    taskFamily: evaluationCase.taskFamily,
    toolTrace: row.toolTrace as string,
    toolTraceDigest: row.toolTraceDigest as string,
    toolTraceEvidence: 'reported-in-session',
  };
};

const validateAxes = (axes: readonly string[]): void => {
  if (axes.length !== 4 || axes.some((axis) => !nonblankString(axis))) {
    throw new Error('Behavior run requires the four nonblank frozen rubric axes.');
  }
  if (new Set(axes).size !== axes.length) {
    throw new Error('Behavior run rubric axes must be unique.');
  }
};

const expectedCaseMap = (expected: BehaviorRunExpected): Map<string, BehaviorRunCase> => {
  validateAxes(expected.axes);
  const selectedCases = expected.cases.filter((item) => item.split === expected.split);
  if (selectedCases.length === 0) {
    throw new Error(`Behavior run has no frozen ${expected.split} cases.`);
  }
  const byId = new Map<string, BehaviorRunCase>();
  selectedCases.forEach((item) => {
    addExpectedCase(byId, item);
  });
  return byId;
};

export const buildBehaviorRunReceipt = (
  content: string,
  expected: BehaviorRunExpected,
  sha256: (value: string) => string,
): BehaviorRunReceipt => {
  const metadata = assertMetadata(expected.metadata);
  const cases = expectedCaseMap(expected);
  const sessions = expectedSessionMap(expected, cases);
  const lines = content.split(/\r?\n/u);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  if (lines.length === 0 || lines.some((line) => line.trim().length === 0)) {
    throw new Error('Behavior run JSONL must contain one nonblank result per line.');
  }
  const results = new Map<string, BehaviorRunCaseReceipt>();
  lines.forEach((line, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Behavior run JSONL line ${index + 1} is not valid JSON.`);
    }
    const result = resultFor(parsed, expected, cases, sessions, sha256);
    if (results.has(result.caseId)) {
      throw new Error(`Behavior run contains a duplicate case id: ${result.caseId}`);
    }
    results.set(result.caseId, result);
  });
  const missing = [...cases.keys()].filter((caseId) => !results.has(caseId));
  if (missing.length > 0 || results.size !== cases.size) {
    throw new Error(`Behavior run is incomplete; missing cases: ${missing.join(', ') || 'none'}.`);
  }
  const caseResults = [...cases.keys()].map(
    (caseId) => results.get(caseId) as BehaviorRunCaseReceipt,
  );
  const allPassed = caseResults.every(
    ({ axes, hardAssertionsPass }) =>
      hardAssertionsPass && expected.axes.every((axis) => axes[axis] === 'pass'),
  );
  const resultsDigest = sha256(canonicalJson(caseResults));
  if (!isSha256(resultsDigest)) {
    throw new Error('Behavior run result fingerprint must be a lowercase SHA-256 value.');
  }
  return {
    admission: 'run-id-linked',
    caseResults,
    decision: allPassed ? 'provisional' : 'reject',
    metadata,
    resultsDigest,
    schemaVersion:
      metadata.outputReferenceVersion === 2
        ? BEHAVIOR_RUN_OUTPUT_REFERENCE_SCHEMA_VERSION
        : BEHAVIOR_RUN_SCHEMA_VERSION,
    split: expected.split,
  };
};
