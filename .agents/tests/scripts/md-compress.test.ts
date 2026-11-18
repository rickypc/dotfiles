import { expect, mock, test } from 'bun:test';
import {
  assertCompressiblePath,
  backupPathFor,
  claimCompressionLock,
  clockFor,
  command,
  createCommand,
  defaultDependencies,
  digestFor,
  finalizeCompression,
  guardCompression,
  lockPathFor,
  resumeCompressionGuard,
  validateCompression,
} from '../../scripts/md-compress.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const dependencies = (source = 'Original `token`.') => {
  const writes = new Map<string, string>();
  const removed: string[] = [];
  const fileSystem = {
    exists: async () => false,
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

const run = async (
  args: readonly string[],
  write: (message: string) => void = () => undefined,
  injected?: Parameters<typeof createCommand>[0],
): Promise<number> => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  const code = await runCommand(createCommand(injected), args, context);
  const envelope = JSON.parse(out[0] ?? '{}');
  if (code !== 0) {
    throw new Error(envelope.diagnostics[0]);
  }
  write(JSON.stringify(envelope.data));
  return code;
};

test('begins a temporary guarded transaction and returns its finalize action', async () => {
  const { dependencies: injected, writes } = dependencies();
  const write = mock();
  await run(['begin', '/docs/plan.md'], write, injected);
  expect(writes.get('/tmp/md-compress/hash/plan.md.original')).toBe('Original `token`.');
  expect(writes.get('/tmp/md-compress/hash/plan.md.original.lock')).toBe('100');
  expect(write).toHaveBeenCalledWith(expect.stringContaining('edit-markdown-then-finalize'));
});

test('finalizes a guarded candidate only after token validation', async () => {
  const { dependencies: injected, removed, writes } = dependencies('Candidate `token`.');
  writes.set('/tmp/md-compress/hash/plan.md.original', 'Original `token`.');
  const write = mock();
  await run(['finalize', '/docs/plan.md'], write, injected);
  expect(removed).toEqual([
    '/tmp/md-compress/hash/plan.md.original',
    '/tmp/md-compress/hash/plan.md.original.lock',
  ]);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('compressed'));
});

test('guards a source in one shot for no-edit validation passes', async () => {
  const { dependencies: injected, removed } = dependencies();
  const write = mock();
  await run(['guard', '/docs/plan.md'], write, injected);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('guarded'));
  expect(removed).toEqual([
    '/tmp/md-compress/hash/plan.md.original',
    '/tmp/md-compress/hash/plan.md.original.lock',
  ]);
});

test('builds default dependencies from injected external boundaries', async () => {
  const { dependencies: injected, writes } = dependencies();
  const hash = {
    digest: mock((_encoding: 'hex') => 'hash'),
    update: mock((_value: string) => hash),
  };
  const digest = digestFor(mock((_algorithm: 'sha256') => hash));
  const clock = clockFor(mock(() => 100));
  const defaults = defaultDependencies('/tmp', injected.fileSystem, digest, clock);
  await run(['begin', '/docs/plan.md'], mock(), defaults);
  expect(writes.get('/tmp/md-compress/hash/plan.md.original')).toBe('Original `token`.');
  expect(clock.now()).toBe(100);
});

test('rejects invalid command shapes and lost protected tokens', async () => {
  await expect(run([])).rejects.toThrow('Expected one of: begin, finalize, guard');
  await expect(run(['begin'])).rejects.toThrow('<markdown-path>');
  const { dependencies: injected, writes } = dependencies('Candidate text.');
  writes.set('/tmp/md-compress/hash/plan.md.original', 'Original `token`.');
  await expect(run(['finalize', '/docs/plan.md'], mock(), injected)).rejects.toThrow(
    'Compression lost protected Markdown tokens',
  );
});

test('allows explicitly authorized protected-token removal', async () => {
  const { dependencies: injected, writes, removed } = dependencies('Candidate text.');
  writes.set('/tmp/md-compress/hash/plan.md.original', 'Original `token`.');
  writes.set(
    '/docs/removals.json',
    JSON.stringify({
      removals: [
        {
          basis: 'superseded-contract',
          justification: 'The token is obsolete and the replacement contract no longer uses it.',
          token: '`token`',
        },
      ],
      sourcePath: '/docs/plan.md',
    }),
  );
  await run(['finalize', '/docs/plan.md', '/docs/removals.json'], mock(), injected);
  expect(removed).toHaveLength(2);
});

test('rejects an authorization manifest that does not account for every removal', async () => {
  const { dependencies: injected, writes } = dependencies('Candidate text.');
  writes.set('/tmp/md-compress/hash/plan.md.original', 'Original `token`.');
  writes.set(
    '/docs/removals.json',
    JSON.stringify({
      removals: [
        {
          basis: 'user-request',
          justification: 'The token was deliberately removed by an explicit request.',
          token: '`token`',
        },
      ],
      sourcePath: '/docs/other.md',
    }),
  );
  await expect(
    run(['finalize', '/docs/plan.md', '/docs/removals.json'], mock(), injected),
  ).rejects.toThrow('source path');
});

test('validates authorization when no protected token is removed', () => {
  expect(() =>
    validateCompression('Original `token`.', 'Original `token`.', '/docs/plan.md', {
      removals: [],
      sourcePath: '/docs/plan.md',
    }),
  ).not.toThrow();
});

test('rejects mismatched and malformed removal authorizations', () => {
  expect(() =>
    validateCompression('Original `token`.', 'Candidate text.', '/docs/plan.md', {
      removals: [],
      sourcePath: '/docs/other.md',
    }),
  ).toThrow('source mismatch');
  expect(() =>
    validateCompression('Original `token`.', 'Candidate text.', '/docs/plan.md', {
      removals: [
        {
          basis: 'invalid' as 'user-request',
          justification: 'This declaration uses an unsupported basis.',
          token: '`token`',
        },
      ],
      sourcePath: '/docs/plan.md',
    }),
  ).toThrow('Invalid removal authorization');
  expect(() =>
    validateCompression('Original `token`.', 'Candidate text.', '/docs/plan.md', {
      removals: [],
      sourcePath: '/docs/plan.md',
    }),
  ).toThrow('undeclared');
});

test('rejects invalid removal authorization JSON', async () => {
  const { dependencies: injected, writes } = dependencies();
  writes.set('/tmp/md-compress/hash/plan.md.original', 'Original `token`.');
  writes.set('/docs/removals.json', '{invalid');
  await expect(
    run(['finalize', '/docs/plan.md', '/docs/removals.json'], mock(), injected),
  ).rejects.toThrow('valid JSON');
});

test('rejects a non-object removal authorization', async () => {
  const { dependencies: injected, writes } = dependencies();
  writes.set('/tmp/md-compress/hash/plan.md.original', 'Original `token`.');
  writes.set('/docs/removals.json', 'null');
  await expect(
    run(['finalize', '/docs/plan.md', '/docs/removals.json'], mock(), injected),
  ).rejects.toThrow('JSON object');
});

test('answers --help with every subcommand', async () => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  expect(await runCommand(command, ['--help'], context)).toBe(0);
  expect(out[0]).toContain('md-compress.ts finalize');
});

test('renders the receipt as one JSON line with --format text', async () => {
  const { dependencies: injected } = dependencies();
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  expect(
    await runCommand(
      createCommand(injected),
      ['begin', '/docs/plan.md', '--format', 'text'],
      context,
    ),
  ).toBe(0);
  expect(JSON.parse(out[0] ?? '').next.action).toBe('edit-markdown-then-finalize');
});

const digest = { sha256: mock(() => 'hash') };

test('derives a deterministic backup path', () => {
  expect(backupPathFor('/backup', '/docs/plan.md', digest)).toBe('/backup/hash/plan.md.original');
  expect(lockPathFor('/backup/hash/plan.md.original')).toBe('/backup/hash/plan.md.original.lock');
});

test.each(['/docs/secret.md', '/docs/plan.txt'])(
  'rejects unsupported compression paths',
  (path) => {
    expect(() => assertCompressiblePath(path)).toThrow();
  },
);

test('guards and finalizes a valid compression transaction', async () => {
  const readFile = mock(async () => 'See `code` at https://example.test.\n```ts\nvalue\n```');
  const writeFile = mock(async () => undefined);
  const rm = mock(async () => undefined);
  const fileSystem = {
    exists: async () => false,
    mkdir: mock(async () => undefined),
    readFile,
    rm,
    writeFile,
  };
  const guard = await guardCompression(fileSystem, '/backup', '/docs/plan.md', digest);
  await finalizeCompression(fileSystem, '/docs/plan.md', guard);
  expect(writeFile).toHaveBeenCalled();
  expect(rm).toHaveBeenCalledWith('/backup/hash/plan.md.original', {
    force: true,
  });
  expect(rm).toHaveBeenCalledWith('/backup/hash/plan.md.original.lock', {
    force: true,
  });
});

test('resumes a guarded transaction from the original backup', async () => {
  const fileSystem = {
    exists: async () => false,
    mkdir: mock(async () => undefined),
    readFile: mock(async () => 'Original `token`.'),
    rm: mock(async () => undefined),
    writeFile: mock(async () => undefined),
  };
  await expect(
    resumeCompressionGuard(fileSystem, '/backup', '/docs/plan.md', digest),
  ).resolves.toEqual({
    backupPath: '/backup/hash/plan.md.original',
    lockPath: '/backup/hash/plan.md.original.lock',
    original: 'Original `token`.',
  });
});

test('rejects a candidate that loses a protected token', () => {
  expect(() => validateCompression('See https://example.test.', 'See nothing.')).toThrow(
    'Compression lost',
  );
});

test('claims a new or stale compression lock and rejects an active one', async () => {
  const guard = {
    backupPath: '/backup.md.original',
    lockPath: '/backup.md.original.lock',
    original: 'original',
  };
  const writes: string[] = [];
  const fileSystem = {
    exists: async () => false,
    mkdir: async () => undefined,
    readFile: async () => {
      throw new Error('missing');
    },
    rm: async () => undefined,
    writeFile: async (_path: string, content: string) => {
      writes.push(content);
    },
  };
  await claimCompressionLock(fileSystem, guard, { now: () => 100 }, 10);
  expect(writes).toEqual(['100']);
  const active = { ...fileSystem, readFile: async () => '95' };
  await expect(claimCompressionLock(active, guard, { now: () => 100 }, 10)).rejects.toThrow(
    'already',
  );
  const stale = { ...fileSystem, readFile: async () => '50' };
  await expect(claimCompressionLock(stale, guard, { now: () => 100 }, 10)).resolves.toBeUndefined();
  await expect(claimCompressionLock(stale, guard, { now: () => 100 }, 0)).rejects.toThrow(
    'positive',
  );
});
