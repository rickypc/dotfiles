import { expect, mock, test } from 'bun:test';

import {
  clockFor,
  defaultDependencies,
  digestFor,
  run,
  runWhenMain,
  usage,
} from '../../scripts/md-compress.js';

const dependencies = (source = 'Original `token`.') => {
  const writes = new Map<string, string>();
  const removed: string[] = [];
  const fileSystem = {
    mkdir: mock(async () => undefined),
    readFile: mock(async (path: string) => {
      if (path === '/docs/plan.md') {
        return source;
      }
      const value = writes.get(path);
      if (value === undefined) {
        throw new Error('missing');
      }
      return value;
    }),
    rm: mock(async (path: string) => {
      removed.push(path);
    }),
    writeFile: mock(async (path: string, content: string) => {
      writes.set(path, content);
    }),
  };
  return {
    dependencies: {
      clock: { now: () => 100 },
      digest: { sha256: () => 'hash' },
      fileSystem,
      temporaryRoot: '/tmp',
    },
    removed,
    writes,
  };
};

test('begins a temporary guarded transaction and returns its finalize action', async () => {
  const { dependencies: injected, writes } = dependencies();
  const write = mock();
  await run(['begin', '/docs/plan.md'], write, injected);
  expect(writes.get('/tmp/aidlc-md-compress/hash/plan.md.original')).toBe(
    'Original `token`.',
  );
  expect(writes.get('/tmp/aidlc-md-compress/hash/plan.md.original.lock')).toBe(
    '100',
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('edit-markdown-then-finalize'),
  );
});

test('finalizes a guarded candidate only after token validation', async () => {
  const {
    dependencies: injected,
    removed,
    writes,
  } = dependencies('Candidate `token`.');
  writes.set(
    '/tmp/aidlc-md-compress/hash/plan.md.original',
    'Original `token`.',
  );
  const write = mock();
  await run(['finalize', '/docs/plan.md'], write, injected);
  expect(removed).toEqual([
    '/tmp/aidlc-md-compress/hash/plan.md.original',
    '/tmp/aidlc-md-compress/hash/plan.md.original.lock',
  ]);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('compressed'));
});

test('builds default dependencies from injected external boundaries', async () => {
  const { dependencies: injected, writes } = dependencies();
  const hash = {
    digest: mock((_encoding: 'hex') => 'hash'),
    update: mock((_value: string) => hash),
  };
  const digest = digestFor(mock((_algorithm: 'sha256') => hash));
  const clock = clockFor(mock(() => 100));
  const defaults = defaultDependencies(
    '/tmp',
    injected.fileSystem,
    digest,
    clock,
  );
  await run(['begin', '/docs/plan.md'], mock(), defaults);
  expect(writes.get('/tmp/aidlc-md-compress/hash/plan.md.original')).toBe(
    'Original `token`.',
  );
  expect(clock.now()).toBe(100);
});

test('rejects invalid command shapes and lost protected tokens', async () => {
  await expect(run([])).rejects.toThrow(usage());
  const { dependencies: injected, writes } = dependencies('Candidate text.');
  writes.set(
    '/tmp/aidlc-md-compress/hash/plan.md.original',
    'Original `token`.',
  );
  await expect(
    run(['finalize', '/docs/plan.md'], mock(), injected),
  ).rejects.toThrow('Compression lost protected Markdown tokens');
});

test.each([
  [false, 0],
  [true, 1],
])('runs CLI work only when the script is main', (isMain, calls) => {
  const runner = mock(async () => undefined);
  runWhenMain(isMain, ['begin', '/docs/plan.md'], runner);
  expect(runner).toHaveBeenCalledTimes(calls);
});
