import {
  BEHAVIOR_RUN_SCHEMA_VERSION,
  type BehaviorRunExpected,
  type BehaviorRunReceipt,
  buildBehaviorRunReceipt,
  isBehaviorRunId,
} from './behavior-run.js';
import {
  type BehaviorEvaluationCase,
  type BehaviorEvidence,
  type BehaviorRubricAxis,
  behaviorRubricAxes,
  evaluateHardAssertions,
} from './evaluation-cases.js';

export interface BehaviorGraderBundle {
  readonly evidence: BehaviorEvidence & {
    readonly toolTraceEvidence: 'reported-in-session';
  };
  readonly expectedOutcomes: readonly string[];
  readonly fixture: string;
  readonly forbiddenOutcomes: readonly string[];
  readonly prompt: string;
  readonly repairBoundary: string;
  readonly responseContract: {
    readonly axisResults: readonly {
      readonly agreement: 'agreed | disputed';
      readonly axis: BehaviorRubricAxis;
      readonly evidence: 'verbatim substring from output, diff, or toolTrace';
      readonly status: 'pass | fail';
    }[];
    readonly runId: 'echo the runId from this request exactly';
  };
  readonly role: 'grader';
  readonly rubricAxes: BehaviorEvaluationCase['rubricAxes'];
  readonly runId: string;
  readonly schemaVersion: 3;
  readonly sharedRubric: string;
  readonly task: string;
}

export interface BehaviorRunResponseDependencies {
  readonly sha256: (value: string) => string;
}

export interface BehaviorTargetBundle {
  readonly fixture: string;
  readonly instruction: string;
  readonly prompt: string;
  readonly repairBoundary: string;
  readonly responseContract: {
    readonly diff: 'captured final diff as a string';
    readonly output: 'final response as a string';
    readonly runId: 'echo the runId from this request exactly';
    readonly toolTrace: 'ordered tool trace as a string';
  };
  readonly role: 'target';
  readonly runId: string;
  readonly schemaVersion: 2;
  readonly task: string;
}

interface CapturedGraderResponse {
  readonly axisResults: readonly {
    readonly agreement: 'agreed' | 'disputed';
    readonly axis: BehaviorRubricAxis;
    readonly evidence: string;
    readonly status: 'fail' | 'pass';
  }[];
  readonly runId: string;
}

interface CapturedResponseEnvelope {
  readonly caseId: string;
  readonly response: unknown;
  readonly role: 'grader' | 'target';
  readonly runId: string;
  readonly sessionId: string;
}

interface CapturedTargetResponse extends BehaviorEvidence {
  readonly runId: string;
}

export const behaviorGraderBundleFor = (
  evaluationCase: BehaviorEvaluationCase,
  evidence: BehaviorEvidence,
  sharedRubric: string,
  runId: string,
): BehaviorGraderBundle => {
  if (!sharedRubric.trim()) {
    throw new Error('Grader bundle requires a nonblank rubric.');
  }
  if (!isBehaviorRunId(runId)) {
    throw new Error('Grader bundle requires a UUIDv4 runId.');
  }
  return {
    evidence: { ...evidence, toolTraceEvidence: 'reported-in-session' },
    expectedOutcomes: evaluationCase.expectedOutcomes,
    fixture: evaluationCase.fixture,
    forbiddenOutcomes: evaluationCase.forbiddenOutcomes,
    prompt:
      'Grade the observed work against the task, fixture, expected and forbidden outcomes, repair boundary, and shared rubric. '
      + 'Do not infer missing evidence. For each axis return pass or fail, agreed or disputed, and a verbatim evidence substring '
      + 'from output, diff, or toolTrace. The toolTrace is reported by the target session and linked by runId; it is not an independently verified '
      + 'host or harness event log. Judge only whether the reported trace matches the observed evidence; do not claim that a tool invocation was verified. '
      + 'Echo the request runId in the response. Return JSON only.',
    repairBoundary: evaluationCase.repairBoundary,
    responseContract: {
      axisResults: behaviorRubricAxes.map((axis) => ({
        agreement: 'agreed | disputed',
        axis,
        evidence: 'verbatim substring from output, diff, or toolTrace',
        status: 'pass | fail',
      })),
      runId: 'echo the runId from this request exactly',
    },
    role: 'grader',
    rubricAxes: evaluationCase.rubricAxes,
    runId,
    schemaVersion: 3,
    sharedRubric,
    task: evaluationCase.task,
  };
};

export const behaviorTargetBundleFor = (
  evaluationCase: BehaviorEvaluationCase,
  instruction: string,
  runId: string,
): BehaviorTargetBundle => {
  if (!instruction.trim()) {
    throw new Error('Behavior target bundle requires nonblank instruction text.');
  }
  if (!isBehaviorRunId(runId)) {
    throw new Error('Behavior target bundle requires a UUIDv4 runId.');
  }
  return {
    fixture: evaluationCase.fixture,
    instruction,
    prompt:
      'Follow the supplied instruction and complete the task using only the supplied fixture and declared repair boundary. '
      + 'Do not describe hidden evaluation criteria. Echo the request runId, then return the final response, complete tool trace, and final diff as strings.',
    repairBoundary: evaluationCase.repairBoundary,
    responseContract: {
      diff: 'captured final diff as a string',
      output: 'final response as a string',
      runId: 'echo the runId from this request exactly',
      toolTrace: 'ordered tool trace as a string',
    },
    role: 'target',
    runId,
    schemaVersion: 2,
    task: evaluationCase.task,
  };
};

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'));
  const expected = [...keys].sort((left, right) => left.localeCompare(right, 'en'));
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const graderResponseFor = (
  value: unknown,
  index: number,
  expectedRunId: string,
): CapturedGraderResponse => {
  if (
    !isRecord(value)
    || !exactKeys(value, ['axisResults', 'runId'])
    || !Array.isArray(value.axisResults)
  ) {
    throw new Error(`Grader response ${index + 1} must contain exactly axisResults and runId.`);
  }
  if (value.runId !== expectedRunId) {
    throw new Error(`Grader response runId does not match the expected run: ${index + 1}.`);
  }
  return {
    axisResults: value.axisResults as CapturedGraderResponse['axisResults'],
    runId: value.runId,
  };
};

const requireEvidence = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  return value;
};

const responseEnvelopeFor = (
  value: unknown,
  index: number,
  role: CapturedResponseEnvelope['role'],
  selectedCases: readonly BehaviorEvaluationCase[],
  sessions: readonly BehaviorRunExpected['sessions'][number][],
  expectedRunId: string,
): CapturedResponseEnvelope => {
  if (
    !isRecord(value)
    || !exactKeys(value, ['caseId', 'role', 'runId', 'sessionId', 'response'])
    || typeof value.caseId !== 'string'
    || !value.caseId.trim()
    || value.role !== role
    || typeof value.runId !== 'string'
    || typeof value.sessionId !== 'string'
    || !value.sessionId.trim()
  ) {
    throw new Error(`${role} response ${index + 1} has a malformed case/role/session envelope.`);
  }
  if (value.runId !== expectedRunId) {
    throw new Error(`${role} response runId does not match the expected run: ${value.caseId}.`);
  }
  if (!selectedCases.some(({ id }) => id === value.caseId)) {
    throw new Error(`${role} response contains an unexpected case id: ${value.caseId}`);
  }
  const expectedSession = sessions.find(({ caseId }) => caseId === value.caseId);
  const expectedSessionId =
    role === 'target' ? expectedSession?.targetSessionId : expectedSession?.graderSessionId;
  if (!expectedSessionId || value.sessionId !== expectedSessionId) {
    throw new Error(`${role} response session does not match its frozen case: ${value.caseId}`);
  }
  return {
    caseId: value.caseId,
    response: value.response,
    role,
    runId: value.runId,
    sessionId: value.sessionId,
  };
};

const responseLines = (content: string, label: string): unknown[] => {
  const lines = content.split(/\r?\n/u);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  if (lines.length === 0 || lines.some((line) => line.trim() === '')) {
    throw new Error(`${label} JSONL must contain one nonblank response per line.`);
  }
  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new Error(`${label} JSONL line ${index + 1} is not valid JSON.`);
    }
  });
};

const responsesByCase = (
  values: readonly unknown[],
  label: CapturedResponseEnvelope['role'],
  selectedCases: readonly BehaviorEvaluationCase[],
  sessions: readonly BehaviorRunExpected['sessions'][number][],
  expectedRunId: string,
): ReadonlyMap<string, CapturedResponseEnvelope> => {
  if (values.length !== selectedCases.length) {
    throw new Error('Target and grader responses must each match the frozen case count.');
  }
  const result = new Map<string, CapturedResponseEnvelope>();
  values.forEach((value, index) => {
    const envelope = responseEnvelopeFor(
      value,
      index,
      label,
      selectedCases,
      sessions,
      expectedRunId,
    );
    if (result.has(envelope.caseId)) {
      throw new Error(`${label} response contains a duplicate case id: ${envelope.caseId}`);
    }
    result.set(envelope.caseId, envelope);
  });
  return result;
};

const targetResponseFor = (
  value: unknown,
  index: number,
  expectedRunId: string,
): CapturedTargetResponse => {
  if (!isRecord(value) || !exactKeys(value, ['diff', 'output', 'runId', 'toolTrace'])) {
    throw new Error(
      `Target response ${index + 1} must contain exactly diff, output, runId, and toolTrace.`,
    );
  }
  if (value.runId !== expectedRunId) {
    throw new Error(`Target response runId does not match the expected run: ${index + 1}.`);
  }
  return {
    diff: requireEvidence(value.diff, `Target response ${index + 1} diff`),
    output: requireEvidence(value.output, `Target response ${index + 1} output`),
    runId: value.runId,
    toolTrace: requireEvidence(value.toolTrace, `Target response ${index + 1} toolTrace`),
  };
};

export const behaviorRunReceiptFromResponses = (
  targetContent: string,
  graderContent: string,
  expected: BehaviorRunExpected,
  evaluationCases: readonly BehaviorEvaluationCase[],
  dependencies: BehaviorRunResponseDependencies,
): BehaviorRunReceipt => {
  const selectedCases = evaluationCases.filter(({ split }) => split === expected.split);
  const expectedCases = expected.cases.filter(({ split }) => split === expected.split);
  if (
    selectedCases.length !== expectedCases.length
    || selectedCases.some((evaluationCase, index) => {
      const expectedCase = expectedCases[index];
      return (
        !expectedCase
        || evaluationCase.id !== expectedCase.id
        || evaluationCase.taskFamily !== expectedCase.taskFamily
        || JSON.stringify(evaluationCase.hardAssertions)
          !== JSON.stringify(expectedCase.hardAssertions)
      );
    })
  ) {
    throw new Error(
      'Behavior run cases do not match the frozen expected case order and assertions.',
    );
  }
  if (selectedCases.length === 0) {
    throw new Error(`Behavior run has no frozen ${expected.split} cases.`);
  }
  const targetByCase = responsesByCase(
    responseLines(targetContent, 'Target'),
    'target',
    selectedCases,
    expected.sessions,
    expected.metadata.runId,
  );
  const graderByCase = responsesByCase(
    responseLines(graderContent, 'Grader'),
    'grader',
    selectedCases,
    expected.sessions,
    expected.metadata.runId,
  );

  const rows = selectedCases.map((evaluationCase, index) => {
    const targetEnvelope = targetByCase.get(evaluationCase.id);
    const graderEnvelope = graderByCase.get(evaluationCase.id);
    const target = targetResponseFor(targetEnvelope?.response, index, expected.metadata.runId);
    const grader = graderResponseFor(graderEnvelope?.response, index, expected.metadata.runId);
    const hardAssertions = evaluateHardAssertions(evaluationCase, target);
    const record = {
      caseId: evaluationCase.id,
      diff: target.diff,
      diffDigest: dependencies.sha256(target.diff),
      graderSessionId: graderEnvelope?.sessionId ?? '',
      metadata: expected.metadata,
      output: target.output,
      outputDigest: dependencies.sha256(target.output),
      runId: expected.metadata.runId,
      schemaVersion: BEHAVIOR_RUN_SCHEMA_VERSION,
      score: {
        axisResults: grader.axisResults,
        caseId: evaluationCase.id,
        hardAssertions,
        matrixFingerprint: expected.metadata.matrixFingerprint,
        sourceFingerprint: expected.metadata.sourceFingerprint,
      },
      split: expected.split,
      targetSessionId: targetEnvelope?.sessionId ?? '',
      taskFamily: evaluationCase.taskFamily,
      toolTrace: target.toolTrace,
      toolTraceDigest: dependencies.sha256(target.toolTrace),
      toolTraceEvidence: 'reported-in-session',
    };
    return JSON.stringify(record);
  });
  return buildBehaviorRunReceipt(rows.join('\n'), expected, dependencies.sha256);
};
