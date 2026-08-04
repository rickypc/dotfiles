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

test('batches independent matrix and skill-file pairs into one receipt', async () => {
  const matrix = JSON.stringify({
    assertions: [{ expected: 'required', kind: 'required-text' }],
    failureMode: 'f',
    id: 'a',
    repairBoundary: '/skill',
    scenario: 's',
    visibility: 'candidate',
  });
  const read = mock(async (path: string) =>
    path.endsWith('.jsonl') ? matrix : 'required',
  );
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
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"phase": "candidate"'),
  );
  await expect(
    run(['batch', 'intent', 'baseline', '/matrix.jsonl', '/skills/a'], read),
  ).rejects.toThrow('ending in /SKILL.md');
  await expect(run(['batch', 'intent', 'baseline'], read)).rejects.toThrow(
    usage(),
  );
});

test('reviews absolute static roots through the Skill Manager integrity receipt', async () => {
  const write = mock();
  const fileSystem = {
    readdir: mock(async (path: string) => {
      if (path === '/tmp/.agents/skills/demo') {
        return [{ isDirectory: () => false, name: 'SKILL.md' }];
      }
      throw new Error(`Missing ${path}`);
    }),
    readFile: mock(async (path: string) => {
      if (path === '/tmp/.agents/.gitignore') {
        return '';
      }
      if (path === '/tmp/.agents/skills/demo/SKILL.md') {
        return '# Demo';
      }
      throw new Error(`Missing ${path}`);
    }),
  };
  await run(
    ['review', '/tmp/.agents/skills/demo'],
    undefined,
    write,
    fileSystem,
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"prosePaths"'));
  await expect(run(['review', 'relative-root'])).rejects.toThrow(usage());
});
