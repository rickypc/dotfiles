import { expect, test } from 'bun:test';

import {
  type BehaviorAxisResult,
  type BehaviorEvaluationCase,
  type BehaviorEvidence,
  type BehaviorRubricAxis,
  type BehaviorScore,
  type BehaviorScoreBinding,
  behaviorCaseRequiredFields,
  behaviorRubricAxes,
  type ContractEvaluationCase,
  contractCaseRequiredFields,
  type EvaluationRubric,
  evaluateHardAssertions,
  type LegacyContractCase,
  legacyContractRecordFor,
  parseEvaluationCasesJsonl,
  validateBehaviorScore,
  validateEvaluationRubric,
} from '../../../utils/quality-engine/evaluation-cases.js';

const contractRecord: ContractEvaluationCase = {
  assertions: [
    { expected: 'Keep the source path', kind: 'required-text' },
    { expected: 'use an unpinned command', kind: 'forbidden-text' },
  ],
  failureMode: 'the source path is missing',
  id: 'contract-source-path',
  independentVerifier: 'source-structure',
  kind: 'contract',
  repairBoundary: 'one instruction file',
  scenario: 'a required path rule is present',
  visibility: 'candidate',
};

const axisCriteria: Readonly<Record<BehaviorRubricAxis, string>> = {
  'negative-constraint-adherence': 'Tool trace contains no prohibited action.',
  'schema-diff-integrity': 'The diff follows the required file schema.',
  'scope-discipline': 'The final diff touches only the allowed fixture.',
  'step-sequence-compliance': 'The tool trace follows the required order.',
};

const behaviorCase: BehaviorEvaluationCase = {
  expectedOutcomes: ['save the requested file'],
  failureMode: 'the agent writes outside the fixture',
  fixture: 'fixtures/notes-workspace.json',
  forbiddenOutcomes: ['write outside the fixture'],
  hardAssertions: [
    { expected: 'Saved', id: 'output-saved', kind: 'output-contains' },
    { expected: 'shell', id: 'no-shell-tool', kind: 'trace-omits' },
  ],
  id: 'behavior-save-file',
  kind: 'behavior',
  repairBoundary: 'the instruction under test',
  rubricAxes: axisCriteria,
  split: 'train',
  task: 'Save the supplied note in the named workspace file.',
  taskFamily: 'bounded-file-edit',
};

const rubric: EvaluationRubric = {
  acceptanceRule: 'all-hard-assertions-and-axes-pass',
  aggregateScore: 'none',
  axes: {
    'negative-constraint-adherence': {
      evidence: 'Inspect output and tool trace for prohibited actions.',
      fail: 'Any prohibited action or missing evidence.',
      pass: 'No prohibited action appears in output or trace.',
    },
    'schema-diff-integrity': {
      evidence: 'Inspect the exact final diff and expected output shape.',
      fail: 'The diff or output violates the case schema.',
      pass: 'The output and diff match the case schema.',
    },
    'scope-discipline': {
      evidence: 'Inspect paths in the diff and tool trace.',
      fail: 'Any write escapes the allowed fixture.',
      pass: 'All writes remain within the allowed fixture.',
    },
    'step-sequence-compliance': {
      evidence: 'Inspect ordered tool events and final output.',
      fail: 'Required actions occur out of order or are skipped.',
      pass: 'Required actions occur in the specified order.',
    },
  },
  graderDisagreement: 'block',
  minimumPassRate: 1,
  requiredCaseFields: {
    behavior: behaviorCaseRequiredFields,
    contract: contractCaseRequiredFields,
  },
  requiredSplits: ['train', 'validation', 'challenge'],
  requiredVisibility: ['candidate', 'challenge'],
  schemaVersion: 2,
  verifierIds: ['source-structure', 'matrix-shape'],
};

const jsonl = (value: unknown): string => JSON.stringify(value);

const omittedField = (value: object, field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));

test('parses contract cases and preserves their exact legacy projection', () => {
  const parsed = parseEvaluationCasesJsonl(jsonl(contractRecord));
  expect(parsed).toEqual([contractRecord]);
  const item = parsed[0];
  if (item?.kind !== 'contract') {
    throw new Error('The parsed fixture must remain a contract case.');
  }
  const legacy: LegacyContractCase = {
    assertions: [
      { expected: 'Keep the source path', kind: 'required-text' },
      { expected: 'use an unpinned command', kind: 'forbidden-text' },
    ],
    failureMode: 'the source path is missing',
    id: 'contract-source-path',
    independentVerifier: 'source-structure',
    repairBoundary: 'one instruction file',
    scenario: 'a required path rule is present',
    visibility: 'candidate',
  };
  expect(legacyContractRecordFor(item)).toEqual(legacy);
});

test('parses behavior cases with all four evidence rules and task family', () => {
  const parsed = parseEvaluationCasesJsonl(jsonl(behaviorCase));
  expect(parsed).toEqual([behaviorCase]);
  const item = parsed[0];
  expect(item?.kind).toBe('behavior');
  if (item?.kind !== 'behavior') {
    throw new Error('The parsed fixture must remain a behavior case.');
  }
  expect(Object.keys(item.rubricAxes).sort()).toEqual([...behaviorRubricAxes].sort());
  expect(item.taskFamily).toBe('bounded-file-edit');
});

test('validates the schema rubric and its non-aggregated blocking rule', () => {
  expect(validateEvaluationRubric(rubric)).toEqual(rubric);
});

test('declares the case schema version in the canonical schema document', async () => {
  const [schema, manifest] = (await Promise.all([
    Bun.file(new URL('../../../evals/schema.json', import.meta.url)).json(),
    Bun.file(new URL('../../../evals/manifest.json', import.meta.url)).json(),
  ])) as [Record<string, unknown>, Record<string, unknown>];

  expect(schema).toMatchObject({ schemaVersion: 2 });
  expect(manifest.caseSchema).toBe('evals/schema.json');
  expect(manifest.schemaVersion).toBe(schema.schemaVersion);
});

const invalidRubrics = [
  { label: 'non-object', message: 'must be an object', value: null },
  {
    label: 'unknown schema version',
    message: 'schema fail-closed',
    value: { ...rubric, schemaVersion: 1 },
  },
  {
    label: 'aggregate score policy',
    message: 'schema fail-closed',
    value: { ...rubric, aggregateScore: 'mean' },
  },
  {
    label: 'disagreement policy',
    message: 'schema fail-closed',
    value: { ...rubric, graderDisagreement: 'majority' },
  },
  {
    label: 'pass rate',
    message: 'schema fail-closed',
    value: { ...rubric, minimumPassRate: 0.75 },
  },
  {
    label: 'missing case field',
    message: 'required case fields do not match schema',
    value: {
      ...rubric,
      requiredCaseFields: {
        ...rubric.requiredCaseFields,
        contract: contractCaseRequiredFields.slice(1),
      },
    },
  },
  {
    label: 'malformed case-field record',
    message: 'separate contract and behavior case fields',
    value: { ...rubric, requiredCaseFields: null },
  },
  {
    label: 'missing split',
    message: 'include train, validation, and challenge',
    value: { ...rubric, requiredSplits: ['train', 'validation'] },
  },
  {
    label: 'missing visibility',
    message: 'preserve candidate and challenge',
    value: { ...rubric, requiredVisibility: ['candidate'] },
  },
  {
    label: 'unknown verifier',
    message: 'unknown or duplicate verifier id',
    value: { ...rubric, verifierIds: ['source-structure', 'unknown'] },
  },
  {
    label: 'duplicate verifier',
    message: 'unknown or duplicate verifier id',
    value: { ...rubric, verifierIds: ['source-structure', 'source-structure'] },
  },
  {
    label: 'empty verifier list',
    message: 'at least one fixed verifier id',
    value: { ...rubric, verifierIds: [] },
  },
  {
    label: 'missing axis',
    message: 'exactly the four fixed axes',
    value: { ...rubric, axes: omittedField(rubric.axes, 'scope-discipline') },
  },
  {
    label: 'missing axis evidence',
    message: 'no observable pass/fail evidence',
    value: {
      ...rubric,
      axes: {
        ...rubric.axes,
        'schema-diff-integrity': { ...rubric.axes['schema-diff-integrity'], evidence: ' ' },
      },
    },
  },
  {
    label: 'unsupported axis field',
    message: 'missing or unsupported fields',
    value: {
      ...rubric,
      axes: {
        ...rubric.axes,
        'schema-diff-integrity': { ...rubric.axes['schema-diff-integrity'], score: '0-1' },
      },
    },
  },
  {
    label: 'unsupported rubric field',
    message: 'missing or contains unsupported fields',
    value: { ...rubric, owner: 'caller' },
  },
];

test.each(invalidRubrics)('rejects an invalid rubric contract: $label', ({ value, message }) => {
  expect(() => validateEvaluationRubric(value)).toThrow(message);
});

const invalidKinds = [
  { label: 'missing kind', value: omittedField(contractRecord, 'kind') },
  { label: 'unsupported kind', value: { ...contractRecord, kind: 'unknown' } },
];

test.each(invalidKinds)('rejects an unsupported case kind: $label', ({ value }) => {
  expect(() => parseEvaluationCasesJsonl(jsonl(value))).toThrow(
    'kind must be contract or behavior',
  );
});

const incompleteBehaviorCases = [
  { label: 'task family', value: omittedField(behaviorCase, 'taskFamily') },
  { label: 'task', value: omittedField(behaviorCase, 'task') },
  { label: 'fixture', value: { ...behaviorCase, fixture: ' ' } },
  { label: 'expected outcomes', value: { ...behaviorCase, expectedOutcomes: [] } },
  { label: 'forbidden outcomes', value: { ...behaviorCase, forbiddenOutcomes: [] } },
  { label: 'hard assertions', value: { ...behaviorCase, hardAssertions: [] } },
  {
    label: 'rubric axis',
    value: { ...behaviorCase, rubricAxes: omittedField(axisCriteria, 'scope-discipline') },
  },
  {
    label: 'rubric evidence',
    value: {
      ...behaviorCase,
      rubricAxes: { ...axisCriteria, 'step-sequence-compliance': ' ' },
    },
  },
  { label: 'failure mode', value: { ...behaviorCase, failureMode: ' ' } },
  { label: 'repair boundary', value: omittedField(behaviorCase, 'repairBoundary') },
];

test.each(incompleteBehaviorCases)(
  'rejects missing or empty behavior data: $label',
  ({ value }) => {
    expect(() => parseEvaluationCasesJsonl(jsonl(value))).toThrow('Behavior case');
  },
);

test('rejects duplicate ids across contract and behavior cases', () => {
  const sameId = { ...behaviorCase, id: contractRecord.id };
  expect(() =>
    parseEvaluationCasesJsonl([jsonl(contractRecord), jsonl(sameId)].join('\n')),
  ).toThrow('ID must be unique');
});

const invalidRegistryCases = [
  { label: 'unknown verifier', value: { ...contractRecord, independentVerifier: 'guess' } },
  {
    label: 'unknown contract assertion',
    value: { ...contractRecord, assertions: [{ expected: 'x', kind: 'guess' }] },
  },
  { label: 'unknown split', value: { ...behaviorCase, split: 'holdout' } },
  {
    label: 'unknown rubric axis',
    value: {
      ...behaviorCase,
      rubricAxes: { ...axisCriteria, 'invented-axis': 'Not registered.' },
    },
  },
  {
    label: 'unknown behavior hard assertion',
    value: {
      ...behaviorCase,
      hardAssertions: [{ expected: 'x', id: 'unknown', kind: 'unknown' }],
    },
  },
  {
    label: 'duplicate behavior hard assertion id',
    value: {
      ...behaviorCase,
      hardAssertions: [...behaviorCase.hardAssertions, behaviorCase.hardAssertions[0]],
    },
  },
];

test.each(invalidRegistryCases)(
  'rejects a value outside the fixed registry: $label',
  ({ value }) => {
    expect(() => parseEvaluationCasesJsonl(jsonl(value))).toThrow();
  },
);

test('rejects empty JSONL, malformed JSON, contradictory outcomes, and extra fields', () => {
  expect(() => parseEvaluationCasesJsonl('\n  \n')).toThrow('At least one evaluation case');
  expect(() => parseEvaluationCasesJsonl(jsonl(null))).toThrow('JSON object');
  expect(() => parseEvaluationCasesJsonl(`${jsonl(contractRecord)}\n{`)).toThrow('line 2');
  expect(() =>
    parseEvaluationCasesJsonl(
      jsonl({ ...behaviorCase, forbiddenOutcomes: behaviorCase.expectedOutcomes }),
    ),
  ).toThrow('contradictory');
  expect(() => parseEvaluationCasesJsonl(jsonl({ ...contractRecord, owner: 'extra' }))).toThrow(
    'unsupported fields',
  );
});

test('evaluates output, trace, and diff hard assertions against captured evidence', () => {
  const caseWithAllAssertionKinds: BehaviorEvaluationCase = {
    ...behaviorCase,
    hardAssertions: [
      { expected: 'Saved', id: 'output-includes', kind: 'output-contains' },
      { expected: 'secret', id: 'output-omits', kind: 'output-omits' },
      { expected: 'read', id: 'trace-includes', kind: 'trace-contains' },
      { expected: 'shell', id: 'trace-omits', kind: 'trace-omits' },
      { expected: 'notes.md', id: 'diff-includes', kind: 'diff-contains' },
      { expected: 'outside.md', id: 'diff-omits', kind: 'diff-omits' },
    ],
  };
  const result = evaluateHardAssertions(caseWithAllAssertionKinds, {
    diff: '+++ notes.md',
    output: 'Saved notes.md',
    toolTrace: 'read notes.md',
  });
  expect(result.map(({ status }) => status)).toEqual([
    'passed',
    'passed',
    'passed',
    'passed',
    'passed',
    'passed',
  ]);
  expect(result.map(({ assertionId }) => assertionId)).toEqual([
    'output-includes',
    'output-omits',
    'trace-includes',
    'trace-omits',
    'diff-includes',
    'diff-omits',
  ]);
});

const binding: BehaviorScoreBinding = {
  matrixFingerprint: 'a'.repeat(64),
  sourceFingerprint: 'b'.repeat(64),
};

const passingEvidence: BehaviorEvidence = {
  diff: '+++ notes.md',
  output: 'Saved notes.md',
  toolTrace: 'read notes.md',
};

const axisResults: BehaviorAxisResult[] = behaviorRubricAxes.map((axis) => ({
  agreement: 'agreed',
  axis,
  evidence: `Observed evidence for ${axis}.`,
  status: 'pass',
}));

const passingScore = (): BehaviorScore => ({
  axisResults,
  caseId: behaviorCase.id,
  hardAssertions: evaluateHardAssertions(behaviorCase, passingEvidence),
  matrixFingerprint: binding.matrixFingerprint,
  sourceFingerprint: binding.sourceFingerprint,
});

test('requires all hard assertions and all four evidenced axis passes for acceptance', () => {
  const pass = passingScore();
  expect(validateBehaviorScore(behaviorCase, pass, binding, passingEvidence)).toBe(true);

  const failingEvidence: BehaviorEvidence = {
    diff: '+++ notes.md',
    output: 'No confirmation',
    toolTrace: 'read notes.md',
  };
  const failedHardAssertion = {
    ...pass,
    hardAssertions: evaluateHardAssertions(behaviorCase, failingEvidence),
  };
  expect(validateBehaviorScore(behaviorCase, failedHardAssertion, binding, failingEvidence)).toBe(
    false,
  );
  expect(() => validateBehaviorScore(behaviorCase, pass, binding, failingEvidence)).toThrow(
    'do not match captured evidence',
  );

  const failedAxis = {
    ...pass,
    axisResults: pass.axisResults.map((result, index) =>
      index === 0 ? { ...result, status: 'fail' as const } : result,
    ),
  };
  expect(validateBehaviorScore(behaviorCase, failedAxis, binding, passingEvidence)).toBe(false);

  const disputedAxis = {
    ...pass,
    axisResults: pass.axisResults.map((result, index) =>
      index === 0 ? { ...result, agreement: 'disputed' as const } : result,
    ),
  };
  expect(validateBehaviorScore(behaviorCase, disputedAxis, binding, passingEvidence)).toBe(false);
});

test('blocks incomplete, duplicate, unknown, or stale behavior score evidence', () => {
  const pass = passingScore();
  expect(() =>
    validateBehaviorScore(
      behaviorCase,
      { ...pass, axisResults: pass.axisResults.slice(1) },
      binding,
      passingEvidence,
    ),
  ).toThrow('four rubric axes are incomplete');

  const duplicatedAxis = {
    ...pass,
    axisResults: [pass.axisResults[0], pass.axisResults[0], ...pass.axisResults.slice(2)],
  };
  expect(() =>
    validateBehaviorScore(behaviorCase, duplicatedAxis, binding, passingEvidence),
  ).toThrow('rubric axis result is duplicated');

  const unknownAxis = {
    ...pass,
    axisResults: pass.axisResults.map((result, index) =>
      index === 0 ? { ...result, axis: 'unknown' } : result,
    ),
  };
  expect(() => validateBehaviorScore(behaviorCase, unknownAxis, binding, passingEvidence)).toThrow(
    'outside the fixed registry',
  );

  expect(() =>
    validateBehaviorScore(
      behaviorCase,
      { ...pass, matrixFingerprint: 'c'.repeat(64) },
      binding,
      passingEvidence,
    ),
  ).toThrow('fingerprints do not match');
  expect(() =>
    validateBehaviorScore(
      behaviorCase,
      { ...pass, caseId: 'another-case' },
      binding,
      passingEvidence,
    ),
  ).toThrow('case id does not match');

  expect(() => validateBehaviorScore(behaviorCase, null, binding, passingEvidence)).toThrow(
    'score is not an object',
  );
  expect(() =>
    validateBehaviorScore(behaviorCase, { ...pass, unrecognized: true }, binding, passingEvidence),
  ).toThrow('required fields are missing or unsupported');
  expect(() =>
    validateBehaviorScore(
      behaviorCase,
      { ...pass, matrixFingerprint: 'invalid' },
      binding,
      passingEvidence,
    ),
  ).toThrow('lowercase SHA-256');
  expect(() =>
    validateBehaviorScore(
      behaviorCase,
      pass,
      { ...binding, matrixFingerprint: 'invalid' },
      passingEvidence,
    ),
  ).toThrow('lowercase SHA-256');
});

const malformedAxisResults = [
  { label: 'non-object', result: null },
  { label: 'extra field', result: { ...axisResults[0], extra: true } },
  { label: 'missing evidence', result: { ...axisResults[0], evidence: ' ' } },
  { label: 'invalid status', result: { ...axisResults[0], status: 'unknown' } },
  { label: 'invalid agreement', result: { ...axisResults[0], agreement: 'unknown' } },
];

test.each(malformedAxisResults)('rejects malformed axis evidence: $label', ({ result }) => {
  const pass = passingScore();
  expect(() =>
    validateBehaviorScore(
      behaviorCase,
      { ...pass, axisResults: [result, ...pass.axisResults.slice(1)] },
      binding,
      passingEvidence,
    ),
  ).toThrow('Behavior score is malformed');
});

const malformedHardResults = [
  { label: 'non-object', result: null },
  { label: 'extra field', result: { ...passingScore().hardAssertions[0], extra: true } },
  {
    label: 'missing assertion id',
    result: { ...passingScore().hardAssertions[0], assertionId: '' },
  },
  { label: 'missing evidence', result: { ...passingScore().hardAssertions[0], evidence: ' ' } },
  { label: 'invalid status', result: { ...passingScore().hardAssertions[0], status: 'unknown' } },
];

test.each(malformedHardResults)(
  'rejects malformed hard assertion evidence: $label',
  ({ result }) => {
    const pass = passingScore();
    expect(() =>
      validateBehaviorScore(
        behaviorCase,
        { ...pass, hardAssertions: [result, pass.hardAssertions[1]] },
        binding,
        passingEvidence,
      ),
    ).toThrow('Behavior score is malformed');
  },
);

test('rejects incomplete, duplicated, or out-of-case hard assertion results', () => {
  const pass = passingScore();
  expect(() =>
    validateBehaviorScore(
      behaviorCase,
      { ...pass, hardAssertions: pass.hardAssertions.slice(1) },
      binding,
      passingEvidence,
    ),
  ).toThrow('hard assertion results are incomplete');

  const duplicatedResults = {
    ...pass,
    hardAssertions: [pass.hardAssertions[0], pass.hardAssertions[0]],
  };
  expect(() =>
    validateBehaviorScore(behaviorCase, duplicatedResults, binding, passingEvidence),
  ).toThrow('hard assertion result is duplicated');

  const unknownAssertion = {
    ...pass,
    hardAssertions: [{ ...pass.hardAssertions[0], assertionId: 'unknown' }, pass.hardAssertions[1]],
  };
  expect(() =>
    validateBehaviorScore(behaviorCase, unknownAssertion, binding, passingEvidence),
  ).toThrow('does not match the frozen case');
});
