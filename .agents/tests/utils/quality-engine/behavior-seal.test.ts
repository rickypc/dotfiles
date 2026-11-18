import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realRun from '../../../utils/quality-engine/behavior-run.js';

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:crypto', () => realCrypto);
mock.module('./behavior-run.js', () => realRun);

const { parseCapture, parseSealLines, renderSealLine, sealCase, unsealedCases } = await import(
  '../../../utils/quality-engine/behavior-seal.js'
);

const RUN_ID = '3f2b8c1e-5d4a-4b6c-8e7f-9a0b1c2d3e4f';
const sha = (text: string): string => realCrypto.createHash('sha256').update(text).digest('hex');
const DOC = 'a'.repeat(64);

const envelope = (overrides: Record<string, unknown> = {}) => ({
  diff: '',
  echoedRunId: RUN_ID,
  output: '1. `a.ts:12` - [Bug] wrong.',
  runId: RUN_ID,
  sessionId: 'session-1',
  toolTrace: 'read a.ts',
  ...overrides,
});

const ASSERTIONS = [
  { expected: '1. `a.ts:12` - [Bug]', id: 'detail', kind: 'output-contains' as const },
  { expected: 'diff --git', id: 'no-edit', kind: 'diff-omits' as const },
  { expected: 'bun test', id: 'no-tests', kind: 'trace-omits' as const },
];

test('the capture envelope needs every field, the echoed runId, and a session id', () => {
  expect(parseCapture(envelope()).sessionId).toBe('session-1');
  expect(() => parseCapture(null)).toThrow('capture envelope needs');
  expect(() => parseCapture(envelope({ diff: 4 }))).toThrow('capture envelope needs');
  expect(() => parseCapture(envelope({ echoedRunId: 'other' }))).toThrow('echo');
  expect(() => parseCapture(envelope({ echoedRunId: 'not-a-uuid', runId: 'not-a-uuid' }))).toThrow(
    'echo',
  );
  expect(() => parseCapture(envelope({ sessionId: '  ' }))).toThrow('no target session id');
});

test('sealing evaluates literal assertions over output, trace, and diff', () => {
  const pass = sealCase({
    capture: parseCapture(envelope()),
    caseId: 'case-1',
    documentSha256: DOC,
    hardAssertions: ASSERTIONS,
    sha256: sha,
  });
  expect(pass.passed).toBe(true);
  expect(pass.assertions.map(({ status }) => status)).toEqual(['passed', 'passed', 'passed']);
  const fail = sealCase({
    capture: parseCapture(envelope({ diff: 'diff --git a b', toolTrace: 'bun test x' })),
    caseId: 'case-1',
    documentSha256: DOC,
    hardAssertions: ASSERTIONS,
    sha256: sha,
  });
  expect(fail.passed).toBe(false);
  expect(fail.assertions.map(({ status }) => status)).toEqual(['passed', 'failed', 'failed']);
  expect(fail.transcriptSha256).not.toBe(pass.transcriptSha256);
});

test('sealing refuses a case with no hard assertions', () => {
  expect(() =>
    sealCase({
      capture: parseCapture(envelope()),
      caseId: 'case-1',
      documentSha256: DOC,
      hardAssertions: [],
      sha256: sha,
    }),
  ).toThrow('no hard assertions');
});

test('seal lines round trip and the latest bound seal decides a case', () => {
  const line = (caseId: string, passed: boolean, documentSha256 = DOC) => ({
    assertions: [],
    caseId,
    documentSha256,
    passed,
    runId: RUN_ID,
    schema: 1 as const,
    sessionId: 's',
    transcriptSha256: 't',
  });
  const text = [line('a', true), line('a', false), line('b', true), line('c', true, 'z')]
    .map(renderSealLine)
    .join('');
  const lines = parseSealLines(`${text}\n`);
  expect(lines).toHaveLength(4);
  expect(unsealedCases(lines, ['a', 'b', 'c', 'd'], DOC)).toEqual(['a', 'c', 'd']);
  expect(() => parseSealLines('{"schema":2}')).toThrow('malformed');
  expect(() => parseSealLines('[]')).toThrow('malformed');
});
