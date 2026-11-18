import type { BehaviorRunAssertion } from './run.js';
import { canonicalJson, isBehaviorRunId } from './run.js';

export interface SealCapture {
  readonly diff: string;
  readonly echoedRunId: string;
  readonly output: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly toolTrace: string;
}

export interface SealLine {
  readonly assertions: readonly { readonly id: string; readonly status: 'failed' | 'passed' }[];
  readonly caseId: string;
  readonly documentSha256: string;
  readonly passed: boolean;
  readonly runId: string;
  readonly schema: 1;
  readonly sessionId: string;
  readonly transcriptSha256: string;
}

const evidenceOf = (capture: SealCapture, kind: BehaviorRunAssertion['kind']): string => {
  if (kind.startsWith('output-')) {
    return capture.output;
  }
  return kind.startsWith('trace-') ? capture.toolTrace : capture.diff;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === 'string';

export const parseCapture = (value: unknown): SealCapture => {
  if (
    !isRecord(value)
    || !isText(value.runId)
    || !isText(value.echoedRunId)
    || !isText(value.sessionId)
    || !isText(value.output)
    || !isText(value.toolTrace)
    || !isText(value.diff)
  ) {
    throw new Error(
      'The capture envelope needs runId, echoedRunId, sessionId, output, toolTrace, and diff.',
    );
  }
  if (!isBehaviorRunId(value.runId) || value.echoedRunId !== value.runId) {
    throw new Error('The capture does not echo the caller-generated runId.');
  }
  if (value.sessionId.trim() === '') {
    throw new Error('The capture envelope has no target session id.');
  }
  return {
    diff: value.diff,
    echoedRunId: value.echoedRunId,
    output: value.output,
    runId: value.runId,
    sessionId: value.sessionId,
    toolTrace: value.toolTrace,
  };
};

export const parseSealLines = (text: string): readonly SealLine[] =>
  text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value) || value.schema !== 1 || !isText(value.caseId)) {
        throw new Error('A behavior seal line is malformed.');
      }
      return value as unknown as SealLine;
    });

export const renderSealLine = (line: SealLine): string => `${JSON.stringify(line)}\n`;

// The hard assertions are literal checks over the captured output, trace, and diff. No model grades
// them, so the verdict depends only on the target's captured evidence.
export const sealCase = (input: {
  readonly capture: SealCapture;
  readonly caseId: string;
  readonly documentSha256: string;
  readonly hardAssertions: readonly BehaviorRunAssertion[];
  readonly sha256: (text: string) => string;
}): SealLine => {
  if (input.hardAssertions.length === 0) {
    throw new Error(`Behavior case ${input.caseId} has no hard assertions to seal.`);
  }
  const assertions = input.hardAssertions.map((assertion) => {
    const contains = evidenceOf(input.capture, assertion.kind).includes(assertion.expected);
    const status: 'failed' | 'passed' =
      contains === assertion.kind.endsWith('contains') ? 'passed' : 'failed';
    return { id: assertion.id, status };
  });
  const { diff, output, toolTrace } = input.capture;
  return {
    assertions,
    caseId: input.caseId,
    documentSha256: input.documentSha256,
    passed: assertions.every(({ status }) => status === 'passed'),
    runId: input.capture.runId,
    schema: 1,
    sessionId: input.capture.sessionId,
    transcriptSha256: input.sha256(canonicalJson({ diff, output, toolTrace })),
  };
};

// Cases with no passing seal bound to this exact document text. The latest seal per case wins.
export const unsealedCases = (
  lines: readonly SealLine[],
  caseIds: readonly string[],
  documentSha256: string,
): readonly string[] =>
  caseIds.filter((caseId) => {
    const latest = [...lines]
      .reverse()
      .find((line) => line.caseId === caseId && line.documentSha256 === documentSha256);
    return latest?.passed !== true;
  });
