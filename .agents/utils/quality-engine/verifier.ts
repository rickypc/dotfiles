import type { CheckResult } from '../contracts.js';
import type { MatrixCase, MatrixEvidence, MatrixVerifierId } from './matrix.js';

type MatrixVerifier = (
  matrixCase: MatrixCase,
  evidence: MatrixEvidence,
) => CheckResult;

const matrixShapeVerifier: MatrixVerifier = (matrixCase) => {
  const valid =
    matrixCase.assertions.length > 0 &&
    matrixCase.scenario.trim().length > 0 &&
    matrixCase.failureMode.trim().length > 0 &&
    matrixCase.repairBoundary.trim().length > 0;
  return {
    detail: valid
      ? 'Matrix case has executable shape.'
      : 'Matrix case is missing executable shape fields.',
    name: `${matrixCase.id}:independent-verifier`,
    status: valid ? 'passed' : 'failed',
  };
};

const sourceStructureVerifier: MatrixVerifier = (matrixCase, evidence) => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(evidence.text);
  const frontmatter = match?.[1] ?? '';
  const content = match?.[2] ?? '';
  const hasValidFrontmatter =
    /^name:\s*\S/mu.test(frontmatter) &&
    /^description:\s*\S/mu.test(frontmatter) &&
    content.trim().length > 0;
  const valid =
    evidence.text.trim().length > 0 &&
    (!evidence.text.trimStart().startsWith('---') || hasValidFrontmatter);
  return {
    detail: valid
      ? 'Source has valid frontmatter and nonblank instructions.'
      : 'Source must have valid name/description frontmatter and instructions.',
    name: `${matrixCase.id}:independent-verifier`,
    status: valid ? 'passed' : 'failed',
  };
};

const registry: Readonly<Record<MatrixVerifierId, MatrixVerifier>> = {
  'matrix-shape': matrixShapeVerifier,
  'source-structure': sourceStructureVerifier,
};

export const matrixVerifierIds = Object.freeze(
  Object.keys(registry) as MatrixVerifierId[],
);

export const isMatrixVerifierId = (value: string): value is MatrixVerifierId =>
  value in registry;

export const runIndependentVerifier = (
  matrixCase: MatrixCase,
  evidence: MatrixEvidence,
): CheckResult => {
  const verifier = registry[matrixCase.independentVerifier];
  if (!verifier) {
    return {
      detail: `Unknown independent verifier: ${matrixCase.independentVerifier}`,
      name: `${matrixCase.id}:independent-verifier`,
      status: 'blocked',
    };
  }
  return verifier(matrixCase, evidence);
};
