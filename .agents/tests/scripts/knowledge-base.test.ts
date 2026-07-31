import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/knowledge-base.js';

const concept = [
  '---',
  'type: "note"',
  'title: "Title"',
  'description: "Description"',
  'tags: ["one"]',
  '---',
  '',
  'Body',
].join('\n');

test('renders KB index paths, validates OKF, and renders parent indexes', async () => {
  const write = mock();
  await run(['concept-index', 'shared/team/decision.md'], write);
  await run(['validate', concept], write);
  await run(['render-index', 'Team', 'decision.md'], write);
  expect(write.mock.calls).toEqual([
    ['shared/team/index.md'],
    ['okf: passed'],
    [expect.stringContaining('[decision](decision.md)')],
  ]);
});

test('captures through an injected KB writer', async () => {
  const write = mock();
  const capture = mock(async () => ({
    conceptPath: '/kb/shared/team/a.md',
    rootIndexPath: '/kb/index.md',
    scopeIndexPath: '/kb/shared/index.md',
    subjectIndexPath: '/kb/shared/team/index.md',
  }));
  await run(
    [
      'capture',
      '/kb',
      'shared/team/a.md',
      '{"type":"note","title":"T","description":"D","tags":["t"]}',
      'Body',
      'Evidence',
    ],
    write,
    capture,
  );
  expect(capture).toHaveBeenCalled();
  expect(write).toHaveBeenCalledWith(expect.stringContaining('conceptPath'));
});

test('searches a KB through an injected search boundary', async () => {
  const write = mock();
  await run(
    ['search', '/kb', 'fixture'],
    write,
    undefined,
    mock(async () => [
      {
        description: 'd',
        path: 'shared/practice/fixture.md',
        title: 'Fixture',
        type: 'practice',
      },
    ]),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('shared/practice/fixture.md'),
  );
});

test('uses CBM and shared fallback for a three-argument KB discovery search', async () => {
  const write = mock();
  const discover = mock(
    async () =>
      ({
        concepts: [],
        discovery: { attempts: [], found: false, output: '', source: 'none' },
      }) as const,
  );
  await run(
    ['search', '/kb', 'kb-index', 'fixture'],
    write,
    undefined,
    undefined,
    discover,
  );
  expect(discover).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    '/kb',
    'kb-index',
    'fixture',
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('discovery'));
});

test('rejects invalid KB input and guards the main boundary', async () => {
  await expect(run(['concept-index', '../secret.md'])).rejects.toThrow(usage());
  await expect(run([])).rejects.toThrow(usage());
  await expect(
    run(['capture', '/kb', 'shared/team/a.md', '{', 'Body', 'Evidence']),
  ).rejects.toThrow('metadata');
  const runner = mock();
  runWhenMain(true, ['render-index', 'Team'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
