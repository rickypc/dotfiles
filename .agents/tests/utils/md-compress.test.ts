import { expect, mock, test } from 'bun:test';

import {
  assertCompressiblePath,
  backupPathFor,
  claimCompressionLock,
  finalizeCompression,
  guardCompression,
  lockPathFor,
  resumeCompressionGuard,
  validateCompression,
} from '../../utils/md-compress.js';

const digest = { sha256: mock(() => 'hash') };

test('derives a deterministic backup path', () => {
  expect(backupPathFor('/backup', '/docs/plan.md', digest)).toBe(
    '/backup/hash/plan.md.original',
  );
  expect(lockPathFor('/backup/hash/plan.md.original')).toBe(
    '/backup/hash/plan.md.original.lock',
  );
});

test.each(['/docs/secret.md', '/docs/plan.txt'])(
  'rejects unsupported compression paths',
  (path) => {
    expect(() => assertCompressiblePath(path)).toThrow();
  },
);

test('guards and finalizes a valid compression transaction', async () => {
  const readFile = mock(
    async () => 'See `code` at https://example.test.\n```ts\nvalue\n```',
  );
  const writeFile = mock(async () => undefined);
  const rm = mock(async () => undefined);
  const fileSystem = {
    mkdir: mock(async () => undefined),
    readFile,
    rm,
    writeFile,
  };
  const guard = await guardCompression(
    fileSystem,
    '/backup',
    '/docs/plan.md',
    digest,
  );
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
  expect(() =>
    validateCompression('See https://example.test.', 'See nothing.'),
  ).toThrow('Compression lost');
});

test('claims a new or stale compression lock and rejects an active one', async () => {
  const guard = {
    backupPath: '/backup.md.original',
    lockPath: '/backup.md.original.lock',
    original: 'original',
  };
  const writes: string[] = [];
  const fileSystem = {
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
  await expect(
    claimCompressionLock(active, guard, { now: () => 100 }, 10),
  ).rejects.toThrow('already');
  const stale = { ...fileSystem, readFile: async () => '50' };
  await expect(
    claimCompressionLock(stale, guard, { now: () => 100 }, 10),
  ).resolves.toBeUndefined();
  await expect(
    claimCompressionLock(stale, guard, { now: () => 100 }, 0),
  ).rejects.toThrow('positive');
});
