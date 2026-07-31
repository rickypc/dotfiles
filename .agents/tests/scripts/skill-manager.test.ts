import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/skill-manager.js';

test('renders a deterministic action packet without executing it', async () => {
  const write = mock();
  await run(
    ['packet', 'improve-skill', 'draft', '/skill.md'],
    undefined,
    write,
  );
  expect(write.mock.calls[0]?.[0]).toContain('"nextPhase": "baseline"');
});

test('rejects invalid script input and covers the main boundary', async () => {
  await expect(run([])).rejects.toThrow(usage());
  const runner = mock(async () => undefined);
  runWhenMain(true, ['packet', 'improve-skill', 'draft', '/skill.md'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});

test('evaluates a matrix in one deterministic script phase', async () => {
  const matrix = [
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'f',
      id: 'a',
      repairBoundary: '/skill',
      scenario: 's',
      visibility: 'candidate',
    }),
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'f',
      id: 'b',
      repairBoundary: '/skill',
      scenario: 's',
      visibility: 'challenge',
    }),
  ].join('\n');
  const read = mock(async (path: string) =>
    path === '/matrix' ? matrix : 'required',
  );
  const write = mock();
  await run(['evaluate', 'candidate', '/matrix', '/target'], read, write);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('passed'));
  await run(['evaluate', 'baseline', '/matrix', '/target'], read, write);
  await run(['evaluate', 'challenge', '/matrix', '/target'], read, write);
  await expect(run(['evaluate', 'candidate', '/matrix'])).rejects.toThrow(
    usage(),
  );
  await expect(
    run(['evaluate', 'invalid', '/matrix', '/target'], read),
  ).rejects.toThrow(usage());
});
