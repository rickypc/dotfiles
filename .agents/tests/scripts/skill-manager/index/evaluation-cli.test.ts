import { expect, mock, test } from 'bun:test';

import { run, usage } from '../../../../scripts/skill-manager/index.js';

test('evaluates a matrix in one deterministic script phase', async () => {
  const matrix = [
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'f',
      id: 'a',
      independentVerifier: 'source-structure',
      repairBoundary: '/skill',
      scenario: 's',
      visibility: 'candidate',
    }),
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'f',
      id: 'b',
      independentVerifier: 'source-structure',
      repairBoundary: '/skill',
      scenario: 's',
      visibility: 'challenge',
    }),
  ].join('\n');
  const read = mock(async (path: string) => (path === '/matrix' ? matrix : 'required'));
  const write = mock();
  await run(['evaluate', 'candidate', '/matrix', '/target'], read, write);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('passed'));
  await run(['evaluate', 'baseline', '/matrix', '/target'], read, write);
  await run(['evaluate', 'challenge', '/matrix', '/target'], read, write);
  await expect(run(['evaluate', 'candidate', '/matrix'])).rejects.toThrow(usage());
  await expect(run(['evaluate', 'invalid', '/matrix', '/target'], read)).rejects.toThrow(usage());
});

test('batches independent matrix and skill-file pairs into one receipt', async () => {
  const matrix = JSON.stringify({
    assertions: [{ expected: 'required', kind: 'required-text' }],
    failureMode: 'f',
    id: 'a',
    independentVerifier: 'source-structure',
    repairBoundary: '/skill',
    scenario: 's',
    visibility: 'candidate',
  });
  const read = mock(async (path: string) => (path.endsWith('.jsonl') ? matrix : 'required'));
  const write = mock();
  await run(
    [
      'batch',
      'intent',
      'candidate',
      '/matrix-a.jsonl',
      '/skills/a/SKILL.md',
      '/matrix-b.jsonl',
      '/skills/b/SKILL.md',
    ],
    read,
    write,
  );
  expect(read).toHaveBeenCalledTimes(4);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"phase": "candidate"'));
  await expect(
    run(['batch', 'intent', 'baseline', '/matrix.jsonl', '/skills/a'], read),
  ).rejects.toThrow('ending in /SKILL.md');
  await expect(run(['batch', 'intent', 'baseline'], read)).rejects.toThrow(usage());
});

test('dispatches the public ratchet command with its read and output adapters', async () => {
  const matrix = [
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'f',
      id: 'candidate',
      independentVerifier: 'source-structure',
      repairBoundary: '/skill',
      scenario: 'candidate stays enforced',
      visibility: 'candidate',
    }),
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'f',
      id: 'challenge',
      independentVerifier: 'source-structure',
      repairBoundary: '/skill',
      scenario: 'challenge stays enforced',
      visibility: 'challenge',
    }),
  ].join('\n');
  const read = mock(async () => matrix);
  const write = mock();

  await run(['ratchet', '/previous.jsonl', '/next.jsonl'], read, write);

  expect(read).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"status": "ratchet-ok"'));
});
