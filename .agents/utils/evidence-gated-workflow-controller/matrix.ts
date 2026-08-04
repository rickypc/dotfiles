import type { CheckResult } from '../contracts.js';

export type AssertionKind =
  | 'required-text'
  | 'forbidden-text'
  | 'owned-file'
  | 'frontmatter'
  | 'delegated-gate';

export type CaseVisibility = 'candidate' | 'challenge';

export interface MatrixAssertion {
  readonly expected: string;
  readonly kind: AssertionKind;
}

export interface MatrixCase {
  readonly assertions: readonly MatrixAssertion[];
  readonly failureMode: string;
  readonly id: string;
  readonly repairBoundary: string;
  readonly scenario: string;
  readonly visibility: CaseVisibility;
}

export interface MatrixEvidence {
  readonly delegatedChecks: Readonly<Record<string, CheckResult | undefined>>;
  readonly ownedFiles: ReadonlySet<string>;
  readonly text: string;
}

const assertionKinds = new Set<AssertionKind>([
  'required-text',
  'forbidden-text',
  'owned-file',
  'frontmatter',
  'delegated-gate',
]);

export const casesFor = (
  cases: readonly MatrixCase[],
  visibility: CaseVisibility,
): MatrixCase[] =>
  cases.filter((matrixCase) => matrixCase.visibility === visibility);

const isBlank = (value: string): boolean => value.trim().length === 0;

const normalized = (value: string): string =>
  value.replaceAll(/\s+/gu, ' ').trim();

const ownedFileResultFor = (
  matrixCase: MatrixCase,
  assertion: MatrixAssertion,
  evidence: MatrixEvidence,
): CheckResult => {
  const name = `${matrixCase.id}:${assertion.kind}`;
  return evidence.ownedFiles.has(assertion.expected)
    ? { detail: assertion.expected, name, status: 'passed' }
    : { detail: `Missing ${assertion.expected}`, name, status: 'failed' };
};

const textResultFor = (
  matrixCase: MatrixCase,
  assertion: MatrixAssertion,
  text: string,
  expected: string,
): CheckResult => {
  const name = `${matrixCase.id}:${assertion.kind}`;
  if (assertion.kind === 'required-text') {
    return text.includes(expected)
      ? { detail: expected, name, status: 'passed' }
      : { detail: `Missing ${expected}`, name, status: 'failed' };
  }
  return text.includes(expected)
    ? { detail: `Found forbidden ${expected}`, name, status: 'failed' }
    : { detail: expected, name, status: 'passed' };
};

const resultFor = (
  matrixCase: MatrixCase,
  assertion: MatrixAssertion,
  evidence: MatrixEvidence,
): CheckResult => {
  const text = normalized(evidence.text);
  const expected = normalized(assertion.expected);
  const name = `${matrixCase.id}:${assertion.kind}`;
  if (
    assertion.kind === 'required-text' ||
    assertion.kind === 'forbidden-text'
  ) {
    return textResultFor(matrixCase, assertion, text, expected);
  }
  if (assertion.kind === 'owned-file') {
    return ownedFileResultFor(matrixCase, assertion, evidence);
  }
  if (assertion.kind === 'frontmatter') {
    const hasFrontmatter = evidence.text.startsWith('---\n');
    return hasFrontmatter && evidence.text.includes(assertion.expected)
      ? { detail: assertion.expected, name, status: 'passed' }
      : {
          detail: `Missing frontmatter ${assertion.expected}`,
          name,
          status: 'failed',
        };
  }
  return (
    evidence.delegatedChecks[assertion.expected] ?? {
      detail: `Missing delegated check ${assertion.expected}`,
      name,
      status: 'blocked',
    }
  );
};

export const evaluateMatrix = (
  cases: readonly MatrixCase[],
  evidence: MatrixEvidence,
): CheckResult[] =>
  cases.flatMap((matrixCase) =>
    matrixCase.assertions.map((assertion) =>
      resultFor(matrixCase, assertion, evidence),
    ),
  );

const validateMatrixCase = (matrixCase: MatrixCase, ids: Set<string>): void => {
  if (isBlank(matrixCase.id) || ids.has(matrixCase.id)) {
    throw new Error(`Matrix case ID must be unique: ${matrixCase.id}`);
  }
  ids.add(matrixCase.id);
  if (
    isBlank(matrixCase.scenario) ||
    isBlank(matrixCase.failureMode) ||
    isBlank(matrixCase.repairBoundary) ||
    matrixCase.assertions.length === 0
  ) {
    throw new Error(`Matrix case is incomplete: ${matrixCase.id}`);
  }
  for (const assertion of matrixCase.assertions) {
    if (!assertionKinds.has(assertion.kind) || isBlank(assertion.expected)) {
      throw new Error(`Matrix assertion is invalid: ${matrixCase.id}`);
    }
  }
};

export const validateMatrix = (cases: readonly MatrixCase[]): void => {
  if (cases.length === 0) {
    throw new Error('At least one matrix case is required.');
  }
  const ids = new Set<string>();
  for (const matrixCase of cases) {
    validateMatrixCase(matrixCase, ids);
  }
};
