import {
  BEHAVIOR_RUNS_PER_CASE,
  type BehaviorRunAggregateCaseReceipt,
  type BehaviorRunAggregateReceipt,
  type BehaviorRunCaseReceipt,
  type BehaviorRunExpected,
  type BehaviorRunHardAssertionResult,
  type BehaviorRunMetadata,
  type BehaviorRunReceipt,
  type BehaviorRunSampleSummary,
  behaviorRunReceiptForAggregation,
  canonicalJson,
} from './behavior-run.js';

type BehaviorRunAggregateExpectation = Pick<BehaviorRunExpected, 'axes' | 'cases' | 'split'> & {
  readonly matrixFingerprint: string;
  readonly ownerId: string;
};

const assertionDefinitions = (assertions: readonly BehaviorRunHardAssertionResult[]): string =>
  JSON.stringify(
    assertions
      .map(({ assertionId, expected, kind }) => ({ assertionId, expected, kind }))
      .sort((left, right) => left.assertionId.localeCompare(right.assertionId, 'en')),
  );

const comparableMetadataFor = (
  metadata: BehaviorRunMetadata,
): Omit<BehaviorRunMetadata, 'outputReferenceVersion' | 'runId' | 'runIndex'> => {
  const comparable = Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => key !== 'outputReferenceVersion' && key !== 'runId' && key !== 'runIndex')
      .sort(([left], [right]) => left.localeCompare(right, 'en')),
  );
  return comparable as Omit<BehaviorRunMetadata, 'outputReferenceVersion' | 'runId' | 'runIndex'>;
};

const assertComparableRunMetadata = (receipts: readonly BehaviorRunReceipt[]): void => {
  const first = receipts[0] as BehaviorRunReceipt;
  const expected = comparableMetadataFor(first.metadata);
  const differs = receipts.some(
    (receipt) =>
      receipt.split !== first.split
      || canonicalJson(comparableMetadataFor(receipt.metadata)) !== canonicalJson(expected),
  );
  if (differs) {
    throw new Error('Behavior aggregation requires comparable metadata and one shared split.');
  }
};

const decisionFor = (
  caseResults: readonly BehaviorRunAggregateCaseReceipt[],
  requiredRuns: number,
): 'provisional' | 'reject' =>
  caseResults.every(
    ({ axes, hardAssertionsPass }) =>
      hardAssertionsPass.passCount === requiredRuns
      && Object.values(axes).every(({ passCount }) => passCount === requiredRuns),
  )
    ? 'provisional'
    : 'reject';

const expectedAssertionDefinitions = (
  assertions: BehaviorRunExpected['cases'][number]['hardAssertions'],
): string =>
  JSON.stringify(
    assertions
      .map(({ expected, id, kind }) => ({ assertionId: id, expected, kind }))
      .sort((left, right) => left.assertionId.localeCompare(right.assertionId, 'en')),
  );

const assertFrozenCaseMetadata = (
  candidate: BehaviorRunCaseReceipt,
  frozenCase: BehaviorRunExpected['cases'][number],
  axes: readonly string[],
): void => {
  const candidateAxes = canonicalJson(Object.keys(candidate.axes).sort());
  const expectedAxes = canonicalJson([...axes].sort());
  if (
    candidate.taskFamily !== frozenCase.taskFamily
    || candidateAxes !== expectedAxes
    || assertionDefinitions(candidate.hardAssertions)
      !== expectedAssertionDefinitions(frozenCase.hardAssertions)
  ) {
    throw new Error(
      `Behavior aggregation case metadata differs from the frozen case: ${frozenCase.id}`,
    );
  }
};

const caseResultsByIdForReceipt = (
  receipt: BehaviorRunReceipt,
  expectedById: ReadonlyMap<string, BehaviorRunExpected['cases'][number]>,
  axes: readonly string[],
): Map<string, BehaviorRunCaseReceipt> => {
  const current = new Map(receipt.caseResults.map((result) => [result.caseId, result]));
  if (current.size !== expectedById.size) {
    throw new Error(
      'Behavior aggregation requires every run to match the complete manifest-bound case set.',
    );
  }
  for (const [caseId, frozenCase] of expectedById) {
    const candidate = current.get(caseId);
    if (!candidate) {
      throw new Error(
        'Behavior aggregation requires every run to match the complete manifest-bound case set.',
      );
    }
    assertFrozenCaseMetadata(candidate, frozenCase, axes);
  }
  return current;
};

const resultsByCaseId = (
  receipts: readonly BehaviorRunReceipt[],
  expected: BehaviorRunAggregateExpectation,
): Map<string, BehaviorRunCaseReceipt> => {
  const expectedById = new Map(expected.cases.map((item) => [item.id, item]));
  if (
    expected.cases.length === 0
    || expectedById.size !== expected.cases.length
    || expected.cases.some(({ split }) => split !== expected.split)
  ) {
    throw new Error('Behavior aggregation requires a nonempty, unique manifest-bound case set.');
  }
  for (const receipt of receipts) {
    caseResultsByIdForReceipt(receipt, expectedById, expected.axes);
  }
  return caseResultsByIdForReceipt(receipts[0] as BehaviorRunReceipt, expectedById, expected.axes);
};

const resultsForCase = (
  caseId: string,
  receipts: readonly BehaviorRunReceipt[],
): readonly BehaviorRunCaseReceipt[] =>
  receipts.map(
    (receipt) =>
      receipt.caseResults.find((result) => result.caseId === caseId) as BehaviorRunCaseReceipt,
  );

const sampleSummary = <T extends string | boolean>(
  outcomes: readonly T[],
  isPass: (value: T) => boolean,
): BehaviorRunSampleSummary<T> => {
  const passCount = outcomes.filter(isPass).length;
  const passRate = passCount / outcomes.length;
  const sampleVariance =
    (passCount * (outcomes.length - passCount)) / (outcomes.length * (outcomes.length - 1));
  return { outcomes, passCount, passRate, sampleVariance };
};

const axisSummariesFor = (
  first: BehaviorRunCaseReceipt,
  results: readonly BehaviorRunCaseReceipt[],
): BehaviorRunAggregateCaseReceipt['axes'] =>
  Object.fromEntries(
    Object.keys(first.axes)
      .sort()
      .map((axis) => [
        axis,
        sampleSummary(
          results.map((result) => result.axes[axis] as 'fail' | 'pass'),
          (value) => value === 'pass',
        ),
      ]),
  );

const hardAssertionSummariesFor = (
  first: BehaviorRunCaseReceipt,
  results: readonly BehaviorRunCaseReceipt[],
): Pick<BehaviorRunAggregateCaseReceipt, 'hardAssertionEvidence' | 'hardAssertions'> => {
  const assertions = new Map(
    first.hardAssertions.map((assertion) => [assertion.assertionId, assertion]),
  );
  const ids = [...assertions.keys()].sort();
  const hardAssertions = Object.fromEntries(
    ids.map((assertionId) => [
      assertionId,
      sampleSummary(
        results.map(
          (result) =>
            result.hardAssertions.find((item) => item.assertionId === assertionId)?.status as
              | 'failed'
              | 'passed',
        ),
        (value) => value === 'passed',
      ),
    ]),
  );
  const hardAssertionEvidence = Object.fromEntries(
    ids.map((assertionId) => [
      assertionId,
      results.map(
        (result) =>
          result.hardAssertions.find((item) => item.assertionId === assertionId)
            ?.evidence as string,
      ),
    ]),
  );
  return { hardAssertionEvidence, hardAssertions };
};

const aggregateCase = (
  caseId: string,
  first: BehaviorRunCaseReceipt,
  receipts: readonly BehaviorRunReceipt[],
): BehaviorRunAggregateCaseReceipt => {
  const results = resultsForCase(caseId, receipts);
  const assertionSummaries = hardAssertionSummariesFor(first, results);
  return {
    axes: axisSummariesFor(first, results),
    axisEvidence: Object.fromEntries(
      Object.keys(first.axes)
        .sort()
        .map((axis) => [axis, results.map((result) => result.axisEvidence[axis] as string)]),
    ),
    caseId,
    ...assertionSummaries,
    hardAssertionsPass: sampleSummary(
      results.map(({ hardAssertionsPass }) => hardAssertionsPass),
      Boolean,
    ),
    runEvidence: results.map((result, index) => {
      const metadata = receipts[index]?.metadata as BehaviorRunMetadata;
      return {
        diffDigest: result.diffDigest,
        graderSessionId: result.graderSessionId,
        outputDigest: result.outputDigest,
        runId: metadata.runId,
        runIndex: metadata.runIndex,
        targetSessionId: result.targetSessionId,
        toolTraceDigest: result.toolTraceDigest,
        toolTraceEvidence: result.toolTraceEvidence,
      };
    }),
    taskFamily: first.taskFamily,
  };
};

const sessionCrossesRun = (
  sessions: ReadonlyMap<string, string>,
  sessionId: string,
  runId: string,
): boolean => {
  const recordedRunId = sessions.get(sessionId);
  return recordedRunId !== undefined && recordedRunId !== runId;
};

const assertRunIdentities = (
  receipts: readonly BehaviorRunReceipt[],
  requiredRuns: number,
): void => {
  const runIds = receipts.map(({ metadata }) => metadata.runId);
  const runIndices = receipts.map(({ metadata }) => metadata.runIndex);
  if (
    runIndices.some((runIndex) => runIndex > requiredRuns)
    || new Set(runIndices).size !== runIndices.length
    || new Set(runIds).size !== runIds.length
  ) {
    throw new Error('Behavior aggregation run IDs and indices must be unique and within policy.');
  }
  const targetRuns = new Map<string, string>();
  const graderRuns = new Map<string, string>();
  const sessionBindings = receipts.flatMap(({ caseResults, metadata }) =>
    caseResults.map(({ graderSessionId, targetSessionId }) => ({
      graderSessionId,
      runId: metadata.runId,
      targetSessionId,
    })),
  );
  for (const { graderSessionId, runId, targetSessionId } of sessionBindings) {
    const crossRoleReuse = graderRuns.has(targetSessionId) || targetRuns.has(graderSessionId);
    const crossRunReuse =
      sessionCrossesRun(targetRuns, targetSessionId, runId)
      || sessionCrossesRun(graderRuns, graderSessionId, runId);
    if (targetSessionId === graderSessionId || crossRoleReuse || crossRunReuse) {
      throw new Error(
        'Behavior aggregation session IDs must stay role-separated and unique across runs.',
      );
    }
    targetRuns.set(targetSessionId, runId);
    graderRuns.set(graderSessionId, runId);
  }
};

export const aggregateBehaviorRunReceipts = (
  values: readonly unknown[],
  expected: BehaviorRunAggregateExpectation,
  requiredRuns: number,
  sha256: (value: string) => string,
): BehaviorRunAggregateReceipt => {
  if (requiredRuns !== BEHAVIOR_RUNS_PER_CASE) {
    throw new Error(
      `Behavior aggregation requires exactly ${BEHAVIOR_RUNS_PER_CASE} runs per case.`,
    );
  }
  if (values.length !== requiredRuns) {
    throw new Error(`Behavior aggregation requires exactly ${requiredRuns} run receipts.`);
  }
  const receipts = values.map((value) => behaviorRunReceiptForAggregation(value, sha256));
  const sortedReceipts = [...receipts].sort(
    (left, right) => left.metadata.runIndex - right.metadata.runIndex,
  );
  assertRunIdentities(sortedReceipts, requiredRuns);
  assertComparableRunMetadata(sortedReceipts);
  const first = sortedReceipts[0] as BehaviorRunReceipt;
  if (
    first.split !== expected.split
    || first.metadata.ownerId !== expected.ownerId
    || first.metadata.matrixFingerprint !== expected.matrixFingerprint
  ) {
    throw new Error(
      'Behavior aggregation owner, split, or matrix fingerprint does not match the manifest-bound cases.',
    );
  }
  const firstById = resultsByCaseId(sortedReceipts, expected);
  const caseResults = [...firstById].map(([caseId, result]) =>
    aggregateCase(caseId, result, sortedReceipts),
  );
  const payload = {
    admission: 'run-id-linked' as const,
    caseResults,
    decision: decisionFor(caseResults, requiredRuns),
    evaluationId: first.metadata.evaluationId,
    metadata: comparableMetadataFor(first.metadata),
    ownerId: expected.ownerId,
    requiredRuns,
    runResults: sortedReceipts.map(({ metadata, resultsDigest }) => ({
      resultsDigest,
      runId: metadata.runId,
      runIndex: metadata.runIndex,
    })),
    schemaVersion: 3 as const,
    split: first.split,
  };
  const aggregateDigest = sha256(canonicalJson(payload));
  if (!/^[a-f0-9]{64}$/u.test(aggregateDigest)) {
    throw new Error('Behavior aggregation result fingerprint must be a lowercase SHA-256 value.');
  }
  return { ...payload, aggregateDigest };
};
