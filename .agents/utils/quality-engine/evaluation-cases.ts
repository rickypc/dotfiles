export const EVALUATION_CASE_SCHEMA_VERSION = 2;

export const behaviorRubricAxes = [
  'schema-diff-integrity',
  'negative-constraint-adherence',
  'step-sequence-compliance',
  'scope-discipline',
] as const;

export const contractCaseRequiredFields = [
  'kind',
  'id',
  'visibility',
  'scenario',
  'assertions',
  'failureMode',
  'repairBoundary',
  'independentVerifier',
] as const;

export const behaviorCaseRequiredFields = [
  'kind',
  'id',
  'split',
  'taskFamily',
  'task',
  'fixture',
  'expectedOutcomes',
  'forbiddenOutcomes',
  'hardAssertions',
  'rubricAxes',
  'failureMode',
  'repairBoundary',
] as const;

export interface AxisRubricRule {
  readonly evidence: string;
  readonly fail: string;
  readonly pass: string;
}

export interface BehaviorAxisResult {
  readonly agreement: 'agreed' | 'disputed';
  readonly axis: BehaviorRubricAxis;
  readonly evidence: string;
  readonly status: 'fail' | 'pass';
}

export interface BehaviorEvaluationCase {
  readonly expectedOutcomes: readonly string[];
  readonly failureMode: string;
  readonly fixture: string;
  readonly forbiddenOutcomes: readonly string[];
  readonly hardAssertions: readonly BehaviorHardAssertion[];
  readonly id: string;
  readonly kind: 'behavior';
  readonly repairBoundary: string;
  readonly rubricAxes: Readonly<Record<BehaviorRubricAxis, string>>;
  readonly split: BehaviorSplit;
  readonly task: string;
  readonly taskFamily: string;
}

export interface BehaviorEvidence {
  readonly diff: string;
  readonly output: string;
  readonly toolTrace: string;
}

export interface BehaviorHardAssertion {
  readonly expected: string;
  readonly id: string;
  readonly kind: BehaviorHardAssertionKind;
}

export type BehaviorHardAssertionKind =
  | 'diff-contains'
  | 'diff-omits'
  | 'output-contains'
  | 'output-omits'
  | 'trace-contains'
  | 'trace-omits';

export type BehaviorRubricAxis = (typeof behaviorRubricAxes)[number];

export interface BehaviorScore {
  readonly axisResults: readonly BehaviorAxisResult[];
  readonly caseId: string;
  readonly hardAssertions: readonly HardAssertionResult[];
  readonly matrixFingerprint: string;
  readonly sourceFingerprint: string;
}

export interface BehaviorScoreBinding {
  readonly matrixFingerprint: string;
  readonly sourceFingerprint: string;
}

export type BehaviorSplit = 'train' | 'validation' | 'challenge';

export type CaseVisibility = 'candidate' | 'challenge';

export interface ContractEvaluationCase extends LegacyContractCase {
  readonly kind: 'contract';
}

export type EvaluationCase = ContractEvaluationCase | BehaviorEvaluationCase;

export interface EvaluationRubric {
  readonly acceptanceRule: 'all-hard-assertions-and-axes-pass';
  readonly aggregateScore: 'none';
  readonly axes: Readonly<Record<BehaviorRubricAxis, AxisRubricRule>>;
  readonly graderDisagreement: 'block';
  readonly minimumPassRate: 1;
  readonly requiredCaseFields: {
    readonly behavior: readonly string[];
    readonly contract: readonly string[];
  };
  readonly requiredSplits: readonly BehaviorSplit[];
  readonly requiredVisibility: readonly CaseVisibility[];
  readonly schemaVersion: 2;
  readonly verifierIds: readonly MatrixVerifierId[];
}

export interface HardAssertionResult {
  readonly assertionId: string;
  readonly evidence: string;
  readonly status: 'failed' | 'passed';
}

export interface LegacyContractCase {
  readonly assertions: readonly MatrixAssertion[];
  readonly failureMode: string;
  readonly id: string;
  readonly independentVerifier: MatrixVerifierId;
  readonly repairBoundary: string;
  readonly scenario: string;
  readonly visibility: CaseVisibility;
}

export interface MatrixAssertion {
  readonly expected: string;
  readonly kind: MatrixAssertionKind;
}

export type MatrixAssertionKind =
  | 'delegated-gate'
  | 'forbidden-text'
  | 'frontmatter'
  | 'owned-file'
  | 'required-text';

export type MatrixVerifierId = 'matrix-shape' | 'source-structure';

const assertionKinds = new Set<MatrixAssertionKind>([
  'delegated-gate',
  'forbidden-text',
  'frontmatter',
  'owned-file',
  'required-text',
]);

const verifierIds = new Set<MatrixVerifierId>(['matrix-shape', 'source-structure']);

const behaviorAssertionKinds = new Set<BehaviorHardAssertionKind>([
  'diff-contains',
  'diff-omits',
  'output-contains',
  'output-omits',
  'trace-contains',
  'trace-omits',
]);

const axisRubricRulesFor = (value: unknown): Record<BehaviorRubricAxis, AxisRubricRule> => {
  if (!record(value) || !hasExactKeys(value, behaviorRubricAxes)) {
    throw new Error('Evaluation rubric must define exactly the four fixed axes.');
  }
  const result = {} as Record<BehaviorRubricAxis, AxisRubricRule>;
  for (const axis of behaviorRubricAxes) {
    const rule = value[axis];
    if (!record(rule) || !hasExactKeys(rule, ['evidence', 'fail', 'pass'])) {
      throw new Error(`Evaluation rubric axis has missing or unsupported fields: ${axis}`);
    }
    if (
      typeof rule.evidence !== 'string'
      || isBlank(rule.evidence)
      || typeof rule.pass !== 'string'
      || isBlank(rule.pass)
      || typeof rule.fail !== 'string'
      || isBlank(rule.fail)
    ) {
      throw new Error(`Evaluation rubric axis has no observable pass/fail evidence: ${axis}`);
    }
    result[axis] = {
      evidence: rule.evidence,
      fail: rule.fail,
      pass: rule.pass,
    };
  }
  return result;
};

const caseFieldsFor = (value: unknown): EvaluationRubric['requiredCaseFields'] => {
  if (!record(value) || !hasExactKeys(value, ['behavior', 'contract'])) {
    throw new Error('Evaluation rubric must separate contract and behavior case fields.');
  }
  if (
    !stringListMatches(value.contract, contractCaseRequiredFields)
    || !stringListMatches(value.behavior, behaviorCaseRequiredFields)
  ) {
    throw new Error('Evaluation rubric required case fields do not match schema.');
  }
  return {
    behavior: [...behaviorCaseRequiredFields],
    contract: [...contractCaseRequiredFields],
  };
};

const behaviorSplits = new Set<BehaviorSplit>(['challenge', 'train', 'validation']);
const visibilities = new Set<CaseVisibility>(['candidate', 'challenge']);
const axisNames = new Set<string>(behaviorRubricAxes);
export const evaluateHardAssertions = (
  evaluationCase: BehaviorEvaluationCase,
  evidence: BehaviorEvidence,
): HardAssertionResult[] =>
  evaluationCase.hardAssertions.map(({ expected, id, kind }) => {
    const evidenceKind = kind.startsWith('output-')
      ? 'output'
      : kind.startsWith('trace-')
        ? 'toolTrace'
        : 'diff';
    const contains = evidence[evidenceKind].includes(expected);
    const shouldContain = kind.endsWith('contains');
    const passed = contains === shouldContain;
    return {
      assertionId: id,
      evidence: `${evidenceKind} ${contains ? 'contains' : 'omits'} expected literal: ${expected}`,
      status: passed ? 'passed' : 'failed',
    };
  });

const hardAssertionResultsMatch = (
  claimed: ReadonlyMap<string, HardAssertionResult>,
  computed: ReadonlyMap<string, HardAssertionResult>,
): boolean =>
  [...claimed].every(([id, result]) => {
    const expected = computed.get(id);
    return Boolean(
      expected && result.status === expected.status && result.evidence === expected.evidence,
    );
  });

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'));
  const expected = [...keys].sort((left, right) => left.localeCompare(right, 'en'));
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isBlank = (value: string): boolean => value.trim().length === 0;

const isSupportedRubricPolicy = (value: Record<string, unknown>): boolean =>
  value.schemaVersion === EVALUATION_CASE_SCHEMA_VERSION
  && value.acceptanceRule === 'all-hard-assertions-and-axes-pass'
  && value.aggregateScore === 'none'
  && value.graderDisagreement === 'block'
  && value.minimumPassRate === 1;

export const legacyContractRecordFor = (
  evaluationCase: ContractEvaluationCase,
): LegacyContractCase => ({
  assertions: evaluationCase.assertions.map(({ expected, kind }) => ({ expected, kind })),
  failureMode: evaluationCase.failureMode,
  id: evaluationCase.id,
  independentVerifier: evaluationCase.independentVerifier,
  repairBoundary: evaluationCase.repairBoundary,
  scenario: evaluationCase.scenario,
  visibility: evaluationCase.visibility,
});

const malformedBehaviorScore = (detail: string): never => {
  throw new Error(`Behavior score is malformed: ${detail}`);
};

const nonblankFingerprint = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const axisResultFor = (value: unknown): BehaviorAxisResult => {
  if (!record(value)) {
    return malformedBehaviorScore('rubric axis result is not an object');
  }
  if (!hasExactKeys(value, ['agreement', 'axis', 'evidence', 'status'])) {
    return malformedBehaviorScore('rubric axis result has missing or unsupported fields');
  }
  if (typeof value.axis !== 'string' || !axisNames.has(value.axis)) {
    return malformedBehaviorScore('rubric axis result is outside the fixed registry');
  }
  if (typeof value.evidence !== 'string' || isBlank(value.evidence)) {
    return malformedBehaviorScore('rubric axis result has no observable evidence');
  }
  if (value.status !== 'pass' && value.status !== 'fail') {
    return malformedBehaviorScore('rubric axis result has an invalid pass/fail status');
  }
  if (value.agreement !== 'agreed' && value.agreement !== 'disputed') {
    return malformedBehaviorScore('rubric axis result has an invalid agreement status');
  }
  return value as unknown as BehaviorAxisResult;
};

const axisResultsFor = (value: unknown): Map<BehaviorRubricAxis, BehaviorAxisResult> => {
  if (!Array.isArray(value) || value.length !== behaviorRubricAxes.length) {
    return malformedBehaviorScore('the four rubric axes are incomplete');
  }
  const results = new Map<BehaviorRubricAxis, BehaviorAxisResult>();
  for (const item of value) {
    const result = axisResultFor(item);
    if (results.has(result.axis)) {
      return malformedBehaviorScore('rubric axis result is duplicated');
    }
    results.set(result.axis, result);
  }
  return results;
};

const hardAssertionResultFor = (value: unknown): HardAssertionResult => {
  if (!record(value)) {
    return malformedBehaviorScore('hard assertion result is not an object');
  }
  if (!hasExactKeys(value, ['assertionId', 'evidence', 'status'])) {
    return malformedBehaviorScore('hard assertion result has missing or unsupported fields');
  }
  if (typeof value.assertionId !== 'string' || isBlank(value.assertionId)) {
    return malformedBehaviorScore('hard assertion result has no assertion id');
  }
  if (typeof value.evidence !== 'string' || isBlank(value.evidence)) {
    return malformedBehaviorScore('hard assertion result has no observable evidence');
  }
  if (value.status !== 'passed' && value.status !== 'failed') {
    return malformedBehaviorScore('hard assertion result has an invalid status');
  }
  return value as unknown as HardAssertionResult;
};

const hardAssertionResultsFor = (
  value: unknown,
  evaluationCase: BehaviorEvaluationCase,
): Map<string, HardAssertionResult> => {
  if (!Array.isArray(value) || value.length !== evaluationCase.hardAssertions.length) {
    return malformedBehaviorScore('hard assertion results are incomplete');
  }
  const results = new Map<string, HardAssertionResult>();
  for (const item of value) {
    const result = hardAssertionResultFor(item);
    if (results.has(result.assertionId)) {
      return malformedBehaviorScore('hard assertion result is duplicated');
    }
    results.set(result.assertionId, result);
  }
  if (evaluationCase.hardAssertions.some(({ id }) => !results.has(id))) {
    return malformedBehaviorScore('hard assertion result does not match the frozen case');
  }
  return results;
};

const scoreForExpectedBinding = (
  score: unknown,
  evaluationCase: BehaviorEvaluationCase,
  expectedBinding: BehaviorScoreBinding,
): Record<string, unknown> => {
  if (!record(score)) {
    return malformedBehaviorScore('score is not an object');
  }
  if (
    !hasExactKeys(score, [
      'axisResults',
      'caseId',
      'hardAssertions',
      'matrixFingerprint',
      'sourceFingerprint',
    ])
  ) {
    return malformedBehaviorScore('required fields are missing or unsupported');
  }
  if (score.caseId !== evaluationCase.id) {
    return malformedBehaviorScore('case id does not match the evaluated case');
  }
  if (
    !nonblankFingerprint(score.matrixFingerprint)
    || !nonblankFingerprint(score.sourceFingerprint)
    || !nonblankFingerprint(expectedBinding.matrixFingerprint)
    || !nonblankFingerprint(expectedBinding.sourceFingerprint)
  ) {
    return malformedBehaviorScore('fingerprints must be lowercase SHA-256 values');
  }
  if (
    score.matrixFingerprint !== expectedBinding.matrixFingerprint
    || score.sourceFingerprint !== expectedBinding.sourceFingerprint
  ) {
    return malformedBehaviorScore('fingerprints do not match the expected candidate and matrix');
  }
  return score;
};

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value)
  && value.length > 0
  && value.every((item) => typeof item === 'string' && !isBlank(item));

const stringListMatches = (value: unknown, expected: readonly string[]): boolean =>
  Array.isArray(value)
  && value.length === expected.length
  && value.every((item) => typeof item === 'string')
  && new Set(value).size === expected.length
  && expected.every((item) => value.includes(item));

const validateBehaviorCase = (value: Record<string, unknown>): BehaviorEvaluationCase => {
  if (
    !hasExactKeys(value, behaviorCaseRequiredFields)
    || value.kind !== 'behavior'
    || typeof value.id !== 'string'
    || isBlank(value.id)
    || typeof value.taskFamily !== 'string'
    || isBlank(value.taskFamily)
    || typeof value.task !== 'string'
    || isBlank(value.task)
    || typeof value.fixture !== 'string'
    || isBlank(value.fixture)
    || typeof value.failureMode !== 'string'
    || isBlank(value.failureMode)
    || typeof value.repairBoundary !== 'string'
    || isBlank(value.repairBoundary)
    || typeof value.split !== 'string'
    || !behaviorSplits.has(value.split as BehaviorSplit)
    || !stringArray(value.expectedOutcomes)
    || !stringArray(value.forbiddenOutcomes)
    || !Array.isArray(value.hardAssertions)
    || value.hardAssertions.length === 0
    || !record(value.rubricAxes)
    || !hasExactKeys(value.rubricAxes, behaviorRubricAxes)
  ) {
    throw new Error(
      `Behavior case is incomplete or contains unsupported fields: ${String(value.id)}`,
    );
  }

  const expected = new Set(value.expectedOutcomes.map((outcome) => outcome.trim()));
  if (value.forbiddenOutcomes.some((outcome) => expected.has(outcome.trim()))) {
    throw new Error(`Behavior case has contradictory expected and forbidden outcomes: ${value.id}`);
  }

  const rubricAxes = {} as Record<BehaviorRubricAxis, string>;
  for (const axis of behaviorRubricAxes) {
    const criterion = value.rubricAxes[axis];
    if (typeof criterion !== 'string' || isBlank(criterion)) {
      throw new Error(`Behavior case has no observable evidence rule for ${axis}: ${value.id}`);
    }
    rubricAxes[axis] = criterion;
  }

  const assertionIds = new Set<string>();
  const hardAssertions = value.hardAssertions.map((assertion): BehaviorHardAssertion => {
    if (
      !record(assertion)
      || !hasExactKeys(assertion, ['expected', 'id', 'kind'])
      || typeof assertion.id !== 'string'
      || isBlank(assertion.id)
      || assertionIds.has(assertion.id)
      || typeof assertion.expected !== 'string'
      || isBlank(assertion.expected)
      || typeof assertion.kind !== 'string'
      || !behaviorAssertionKinds.has(assertion.kind as BehaviorHardAssertionKind)
    ) {
      throw new Error(`Behavior case has an invalid or duplicate hard assertion: ${value.id}`);
    }
    assertionIds.add(assertion.id);
    return {
      expected: assertion.expected,
      id: assertion.id,
      kind: assertion.kind as BehaviorHardAssertionKind,
    };
  });

  return {
    expectedOutcomes: value.expectedOutcomes,
    failureMode: value.failureMode,
    fixture: value.fixture,
    forbiddenOutcomes: value.forbiddenOutcomes,
    hardAssertions,
    id: value.id,
    kind: 'behavior',
    repairBoundary: value.repairBoundary,
    rubricAxes,
    split: value.split as BehaviorSplit,
    task: value.task,
    taskFamily: value.taskFamily,
  };
};

export const validateBehaviorScore = (
  evaluationCase: BehaviorEvaluationCase,
  score: unknown,
  expectedBinding: BehaviorScoreBinding,
  evidence: BehaviorEvidence,
): boolean => {
  const boundScore = scoreForExpectedBinding(score, evaluationCase, expectedBinding);
  const hardResults = hardAssertionResultsFor(boundScore.hardAssertions, evaluationCase);
  const computedHardResults = new Map(
    evaluateHardAssertions(evaluationCase, evidence).map((result) => [result.assertionId, result]),
  );
  if (!hardAssertionResultsMatch(hardResults, computedHardResults)) {
    return malformedBehaviorScore('hard assertion results do not match captured evidence');
  }
  const axes = axisResultsFor(boundScore.axisResults);
  return (
    [...hardResults.values()].every(({ status }) => status === 'passed')
    && [...axes.values()].every(
      ({ agreement, status }) => agreement === 'agreed' && status === 'pass',
    )
  );
};

const validateContractCase = (value: Record<string, unknown>): ContractEvaluationCase => {
  if (
    !hasExactKeys(value, contractCaseRequiredFields)
    || value.kind !== 'contract'
    || typeof value.id !== 'string'
    || isBlank(value.id)
    || typeof value.scenario !== 'string'
    || isBlank(value.scenario)
    || typeof value.failureMode !== 'string'
    || isBlank(value.failureMode)
    || typeof value.repairBoundary !== 'string'
    || isBlank(value.repairBoundary)
    || typeof value.visibility !== 'string'
    || !visibilities.has(value.visibility as CaseVisibility)
    || typeof value.independentVerifier !== 'string'
    || !verifierIds.has(value.independentVerifier as MatrixVerifierId)
    || !Array.isArray(value.assertions)
    || value.assertions.length === 0
  ) {
    throw new Error(
      `Contract case is incomplete or contains unsupported fields: ${String(value.id)}`,
    );
  }

  const assertions = value.assertions.map((assertion): MatrixAssertion => {
    if (
      !record(assertion)
      || !hasExactKeys(assertion, ['expected', 'kind'])
      || typeof assertion.expected !== 'string'
      || isBlank(assertion.expected)
      || typeof assertion.kind !== 'string'
      || !assertionKinds.has(assertion.kind as MatrixAssertionKind)
    ) {
      throw new Error(`Contract case has an invalid assertion: ${value.id}`);
    }
    return {
      expected: assertion.expected,
      kind: assertion.kind as MatrixAssertionKind,
    };
  });

  return {
    assertions,
    failureMode: value.failureMode,
    id: value.id,
    independentVerifier: value.independentVerifier as MatrixVerifierId,
    kind: 'contract',
    repairBoundary: value.repairBoundary,
    scenario: value.scenario,
    visibility: value.visibility as CaseVisibility,
  };
};

const validateEvaluationCase = (value: unknown): EvaluationCase => {
  if (!record(value)) {
    throw new Error('Evaluation case must be a JSON object.');
  }
  if (value.kind === 'contract') {
    return validateContractCase(value);
  }
  if (value.kind === 'behavior') {
    return validateBehaviorCase(value);
  }
  throw new Error('Evaluation case kind must be contract or behavior.');
};

export const parseEvaluationCasesJsonl = (content: string): EvaluationCase[] => {
  const lines = content.split(/\r?\n/u).filter((line) => line.trim());
  if (lines.length === 0) {
    throw new Error('At least one evaluation case is required.');
  }

  const ids = new Set<string>();
  return lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Evaluation case line ${index + 1} is not valid JSON.`);
    }
    const evaluationCase = validateEvaluationCase(value);
    if (ids.has(evaluationCase.id)) {
      throw new Error(`Evaluation case ID must be unique: ${evaluationCase.id}`);
    }
    ids.add(evaluationCase.id);
    return evaluationCase;
  });
};

const verifierIdsFor = (value: unknown): MatrixVerifierId[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Evaluation rubric must declare at least one fixed verifier id.');
  }
  const ids = value.filter((item): item is string => typeof item === 'string');
  if (
    ids.length !== value.length
    || ids.some((id) => !verifierIds.has(id as MatrixVerifierId))
    || new Set(ids).size !== ids.length
  ) {
    throw new Error('Evaluation rubric contains an unknown or duplicate verifier id.');
  }
  return ids as MatrixVerifierId[];
};

export const validateEvaluationRubric = (value: unknown): EvaluationRubric => {
  if (!record(value)) {
    throw new Error('Evaluation rubric must be an object.');
  }
  if (
    !hasExactKeys(value, [
      'acceptanceRule',
      'aggregateScore',
      'axes',
      'graderDisagreement',
      'minimumPassRate',
      'requiredCaseFields',
      'requiredSplits',
      'requiredVisibility',
      'schemaVersion',
      'verifierIds',
    ])
  ) {
    throw new Error('Evaluation rubric is missing or contains unsupported fields.');
  }
  if (!isSupportedRubricPolicy(value)) {
    throw new Error('Evaluation rubric does not follow the schema fail-closed score policy.');
  }
  const requiredCaseFields = caseFieldsFor(value.requiredCaseFields);
  if (!stringListMatches(value.requiredVisibility, ['candidate', 'challenge'])) {
    throw new Error('Evaluation rubric visibility must preserve candidate and challenge lanes.');
  }
  if (!stringListMatches(value.requiredSplits, ['train', 'validation', 'challenge'])) {
    throw new Error('Evaluation rubric splits must include train, validation, and challenge.');
  }
  const verifierIds = verifierIdsFor(value.verifierIds);
  const axes = axisRubricRulesFor(value.axes);
  return {
    acceptanceRule: 'all-hard-assertions-and-axes-pass',
    aggregateScore: 'none',
    axes,
    graderDisagreement: 'block',
    minimumPassRate: 1,
    requiredCaseFields,
    requiredSplits: ['train', 'validation', 'challenge'],
    requiredVisibility: ['candidate', 'challenge'],
    schemaVersion: EVALUATION_CASE_SCHEMA_VERSION,
    verifierIds,
  };
};
