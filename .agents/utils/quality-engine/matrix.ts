import type { CheckResult } from '../contracts.js';
import { fingerprint } from './packet.js';
import { isMatrixVerifierId } from './verifier.js';

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
  readonly independentVerifier: MatrixVerifierId;
  readonly repairBoundary: string;
  readonly scenario: string;
  readonly visibility: CaseVisibility;
}

export interface MatrixEvidence {
  readonly delegatedChecks: Readonly<Record<string, CheckResult | undefined>>;
  readonly ownedFiles: ReadonlySet<string>;
  readonly text: string;
}

export type MatrixVerifierId = 'source-structure' | 'matrix-shape';

const assertionKinds = new Set<AssertionKind>([
  'required-text',
  'forbidden-text',
  'owned-file',
  'frontmatter',
  'delegated-gate',
]);

const canonicalCaseFor = (matrixCase: MatrixCase) => ({
  assertions: matrixCase.assertions.map(({ expected, kind }) => ({
    expected,
    kind,
  })),
  failureMode: matrixCase.failureMode,
  id: matrixCase.id,
  independentVerifier: matrixCase.independentVerifier,
  repairBoundary: matrixCase.repairBoundary,
  scenario: matrixCase.scenario,
  visibility: matrixCase.visibility,
});

export const casesFor = (cases: readonly MatrixCase[], visibility: CaseVisibility): MatrixCase[] =>
  cases.filter((matrixCase) => matrixCase.visibility === visibility);

const isBlank = (value: string): boolean => value.trim().length === 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const matrixFingerprintFor = (cases: readonly MatrixCase[]): string =>
  fingerprint(
    cases.map(canonicalCaseFor).sort((left, right) => left.id.localeCompare(right.id, 'en')),
  );

const normalized = (value: string): string => value.replaceAll(/\s+/gu, ' ').trim();

const ownedFileResultFor = (
  matrixCase: MatrixCase,
  assertion: MatrixAssertion,
  evidence: MatrixEvidence,
  assertionIndex: number,
): CheckResult => {
  const name = `${matrixCase.id}:${assertion.kind}:${assertionIndex + 1}`;
  return evidence.ownedFiles.has(assertion.expected)
    ? { detail: assertion.expected, name, status: 'passed' }
    : { detail: `Missing ${assertion.expected}`, name, status: 'failed' };
};

const textResultFor = (
  matrixCase: MatrixCase,
  assertion: MatrixAssertion,
  text: string,
  expected: string,
  assertionIndex: number,
): CheckResult => {
  const name = `${matrixCase.id}:${assertion.kind}:${assertionIndex + 1}`;
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
  assertionIndex: number,
): CheckResult => {
  const text = normalized(evidence.text);
  const expected = normalized(assertion.expected);
  const name = `${matrixCase.id}:${assertion.kind}:${assertionIndex + 1}`;
  if (assertion.kind === 'required-text' || assertion.kind === 'forbidden-text') {
    return textResultFor(matrixCase, assertion, text, expected, assertionIndex);
  }
  if (assertion.kind === 'owned-file') {
    return ownedFileResultFor(matrixCase, assertion, evidence, assertionIndex);
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
    matrixCase.assertions.map((assertion, assertionIndex) =>
      resultFor(matrixCase, assertion, evidence, assertionIndex),
    ),
  );

const validateMatrixCase = (matrixCase: MatrixCase, ids: Set<string>): void => {
  if (
    !isRecord(matrixCase)
    || typeof matrixCase.id !== 'string'
    || isBlank(matrixCase.id)
    || ids.has(matrixCase.id)
  ) {
    throw new Error(
      `Matrix case ID must be unique: ${isRecord(matrixCase) ? String(matrixCase.id) : String(matrixCase)}`,
    );
  }
  ids.add(matrixCase.id);
  if (
    typeof matrixCase.scenario !== 'string'
    || typeof matrixCase.failureMode !== 'string'
    || typeof matrixCase.repairBoundary !== 'string'
    || !Array.isArray(matrixCase.assertions)
    || isBlank(matrixCase.scenario)
    || isBlank(matrixCase.failureMode)
    || isBlank(matrixCase.repairBoundary)
    || matrixCase.assertions.length === 0
    || !isMatrixVerifierId(matrixCase.independentVerifier)
  ) {
    throw new Error(
      `Matrix case is incomplete or missing an independent verifier: ${matrixCase.id}`,
    );
  }
  for (const assertion of matrixCase.assertions) {
    if (
      !isRecord(assertion)
      || typeof assertion.kind !== 'string'
      || typeof assertion.expected !== 'string'
      || !assertionKinds.has(assertion.kind as AssertionKind)
      || isBlank(assertion.expected)
    ) {
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
