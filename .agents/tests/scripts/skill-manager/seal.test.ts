import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realFs from 'node:fs/promises';
import * as realOs from 'node:os';
import * as realPath from 'node:path';
import * as realRun from '../../../utils/quality-engine/behavior/run.js';
import * as realSeal from '../../../utils/quality-engine/behavior/seal.js';

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:crypto', () => realCrypto);
mock.module('node:fs/promises', () => realFs);
mock.module('node:path', () => realPath);
mock.module('../utils/quality-engine/behavior-run.js', () => realRun);
mock.module('../utils/quality-engine/behavior-seal.js', () => realSeal);

const sut = await import('../../../scripts/skill-manager/seal.js');

const RUN_ID = '3f2b8c1e-5d4a-4b6c-8e7f-9a0b1c2d3e4f';
const DOC = 'b'.repeat(64);
const sha = (text: string): string => realCrypto.createHash('sha256').update(text).digest('hex');

const CASES = [
  '{"kind":"contract","id":"c0"}',
  '',
  JSON.stringify({
    hardAssertions: [{ expected: 'ok', id: 'says-ok', kind: 'output-contains' }],
    id: 'case-1',
    kind: 'behavior',
  }),
  JSON.stringify({ id: 'no-assertions', kind: 'behavior' }),
  '[]',
].join('\n');

const capture = JSON.stringify({
  diff: '',
  echoedRunId: RUN_ID,
  output: 'all ok',
  runId: RUN_ID,
  sessionId: 's1',
  toolTrace: '',
});

const args = (owner = 'skill:demo', caseId = 'case-1') => [
  'seal',
  '/r',
  owner,
  caseId,
  '/cap.json',
  DOC,
];

const harness = () => {
  const files = new Map<string, string>([
    ['/r/evals/skills/demo/cases.jsonl', CASES],
    ['/r/evals/cases.jsonl', CASES],
    ['/cap.json', capture],
  ]);
  const deps = {
    appendText: async (file: string, content: string) => {
      files.set(file, `${files.get(file) ?? ''}${content}`);
    },
    readText: async (file: string) => files.get(file),
    sha256: sha,
  };
  return { deps, files };
};

test('seals a passing run and appends one line to the owner seal file', async () => {
  const { deps, files } = harness();
  const out: string[] = [];
  await sut.runSeal(args(), (message) => out.push(message), deps);
  const line = JSON.parse(out[0] as string);
  expect(line.passed).toBe(true);
  expect(line.documentSha256).toBe(DOC);
  expect(files.get('/r/evals/skills/demo/behavior-seals.jsonl')).toBe(`${JSON.stringify(line)}\n`);
  await sut.runSeal(args('root'), () => undefined, deps);
  expect(files.has('/r/evals/behavior-seals.jsonl')).toBe(true);
});

test('rejects bad arguments, unknown owners, and missing inputs', async () => {
  const { deps, files } = harness();
  const run = (list: string[]) => sut.runSeal(list, () => undefined, deps);
  await expect(run(['seal'])).rejects.toThrow('Usage');
  await expect(run([...args(), 'extra'])).rejects.toThrow('Usage');
  await expect(run(['seal', '/r', 'skill:demo', 'case-1', '/cap.json', 'short'])).rejects.toThrow(
    'Usage',
  );
  await expect(run(args('weird'))).rejects.toThrow('Unknown owner');
  await expect(run(args('skill:demo', 'no-assertions'))).rejects.toThrow('no behavior case');
  await expect(run(args('skill:demo', 'missing'))).rejects.toThrow('no behavior case');
  files.delete('/cap.json');
  await expect(run(args())).rejects.toThrow('must both exist');
  expect(sut.sealUsage()).toContain('seal <absolute-agents-root>');
});

test('the default dependencies append, read, and hash on the real filesystem', async () => {
  const deps = sut.defaultSealDeps();
  const dir = await realFs.mkdtemp(realPath.join(realOs.tmpdir(), 'seal-'));
  const file = realPath.join(dir, 'deep', 'seals.jsonl');
  await deps.appendText(file, 'a\n');
  await deps.appendText(file, 'b\n');
  expect(await deps.readText(file)).toBe('a\nb\n');
  expect(await deps.readText(realPath.join(dir, 'none'))).toBeUndefined();
  expect(deps.sha256('x')).toBe(sha('x'));
});
