import type { CheckResult } from '../contracts.js';
import type { MatrixCase, MatrixEvidence, MatrixVerifierId } from './matrix.js';

type MatrixVerifier = (matrixCase: MatrixCase, evidence: MatrixEvidence) => CheckResult;

const MAX_DESCRIPTION_LENGTH = 1024;

const MAX_BODY_LINES = 500;

const lineCountFor = (text: string): number =>
  text.length === 0 ? 0 : text.split('\n').length - Number(text.endsWith('\n'));

const matrixShapeVerifier: MatrixVerifier = (matrixCase) => {
  const valid =
    matrixCase.assertions.length > 0
    && matrixCase.scenario.trim().length > 0
    && matrixCase.failureMode.trim().length > 0
    && matrixCase.repairBoundary.trim().length > 0;
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
    /^name:\s*\S/mu.test(frontmatter)
    && /^description:\s*\S/mu.test(frontmatter)
    && content.trim().length > 0;
  const descriptionLength = /^description:[ \t]*(.*)$/mu.exec(frontmatter)?.[1]?.length ?? 0;
  const body = match ? content : evidence.text;
  const withinBudget =
    lineCountFor(body) <= MAX_BODY_LINES && descriptionLength <= MAX_DESCRIPTION_LENGTH;
  const valid =
    evidence.text.trim().length > 0
    && (!evidence.text.trimStart().startsWith('---') || hasValidFrontmatter)
    && withinBudget;
  return {
    detail: valid
      ? 'Source has valid frontmatter, nonblank instructions, and stays within its size budget.'
      : `Source must have valid name/description frontmatter, instructions, at most ${MAX_BODY_LINES} body lines, and a description of at most ${MAX_DESCRIPTION_LENGTH} characters.`,
    name: `${matrixCase.id}:independent-verifier`,
    status: valid ? 'passed' : 'failed',
  };
};

const registry: Readonly<Record<MatrixVerifierId, MatrixVerifier>> = {
  'matrix-shape': matrixShapeVerifier,
  'source-structure': sourceStructureVerifier,
};

export const matrixVerifierIds = Object.freeze(Object.keys(registry) as MatrixVerifierId[]);

export const isMatrixVerifierId = (value: string): value is MatrixVerifierId =>
  Object.hasOwn(registry, value);

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
