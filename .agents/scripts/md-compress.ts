import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type FileSystem,
  nodeFileSystem,
  readText,
  removeFile,
  writeText,
} from '../utils/filesystem.js';

export interface Clock {
  readonly now: () => number;
}

export interface CompressionGuard {
  readonly backupPath: string;
  readonly lockPath: string;
  readonly original: string;
}

export interface Digest {
  readonly sha256: (value: string) => string;
}

interface Hash {
  digest: (encoding: 'hex') => string;
  update: (value: string) => Hash;
}

type HashFactory = (algorithm: 'sha256') => Hash;

interface MdCompressDependencies {
  readonly clock: Clock;
  readonly digest: Digest;
  readonly fileSystem: FileSystem;
  readonly temporaryRoot: string;
}

const sensitiveName = /(?:credential|secret|password|private[-_]?key|token)/i;
const markdownTokens = /```[\s\S]*?```|https?:\/\/[^\s)]+|`[^`]+`/g;

export const assertCompressiblePath = (sourcePath: string): void => {
  if (sensitiveName.test(sourcePath)) {
    throw new Error(`Refusing to compress a sensitive path: ${sourcePath}`);
  }
  if (!sourcePath.endsWith('.md')) {
    throw new Error(`Only Markdown files are supported: ${sourcePath}`);
  }
};

export const backupPathFor = (
  backupRoot: string,
  sourcePath: string,
  digest: Digest,
): string =>
  `${backupRoot}/${digest.sha256(sourcePath)}/${sourcePath.split('/').at(-1)}.original`;

export const lockPathFor = (backupPath: string): string => `${backupPath}.lock`;

export const guardCompression = async (
  fileSystem: FileSystem,
  backupRoot: string,
  sourcePath: string,
  digest: Digest,
): Promise<CompressionGuard> => {
  assertCompressiblePath(sourcePath);
  const original = await readText(fileSystem, sourcePath);
  const backupPath = backupPathFor(backupRoot, sourcePath, digest);
  await writeText(fileSystem, backupPath, original);
  return { backupPath, lockPath: lockPathFor(backupPath), original };
};

const protectedTokens = (content: string): string[] =>
  content.match(markdownTokens) ?? [];

export const resumeCompressionGuard = async (
  fileSystem: FileSystem,
  backupRoot: string,
  sourcePath: string,
  digest: Digest,
): Promise<CompressionGuard> => {
  assertCompressiblePath(sourcePath);
  const backupPath = backupPathFor(backupRoot, sourcePath, digest);
  return {
    backupPath,
    lockPath: lockPathFor(backupPath),
    original: await readText(fileSystem, backupPath),
  };
};

const timestampFrom = (content: string): number => Number(content.trim());

export const claimCompressionLock = async (
  fileSystem: FileSystem,
  guard: CompressionGuard,
  clock: Clock,
  staleAfterMs: number,
): Promise<void> => {
  if (staleAfterMs < 1) {
    throw new Error('Compression lock stale duration must be positive.');
  }
  try {
    const existing = timestampFrom(await readText(fileSystem, guard.lockPath));
    if (Number.isFinite(existing) && clock.now() - existing < staleAfterMs) {
      throw new Error(`Compression is already in progress: ${guard.lockPath}`);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Compression is already')
    ) {
      throw error;
    }
  }
  await writeText(fileSystem, guard.lockPath, String(clock.now()));
};

export const validateCompression = (
  original: string,
  candidate: string,
): void => {
  const lost = protectedTokens(original).filter(
    (token) => !candidate.includes(token),
  );
  if (lost.length > 0) {
    throw new Error(
      `Compression lost protected Markdown tokens: ${lost.join(', ')}`,
    );
  }
};

export const finalizeCompression = async (
  fileSystem: FileSystem,
  sourcePath: string,
  guard: CompressionGuard,
): Promise<void> => {
  const candidate = await readText(fileSystem, sourcePath);
  validateCompression(guard.original, candidate);
  await removeFile(fileSystem, guard.backupPath);
  await removeFile(fileSystem, guard.lockPath);
};

import { runWhenMain as runCliWhenMain } from '../utils/cli.js';

export const clockFor = (now: () => number): Clock => ({ now });

export const digestFor = (hash: HashFactory): Digest => ({
  sha256: (value) => hash('sha256').update(value).digest('hex'),
});

const temporaryBackupRootFor = (temporaryRoot: string): string =>
  join(temporaryRoot, 'md-compress');

const sha256Digest = digestFor(createHash);
const systemClock = clockFor(Date.now);

export const defaultDependencies = (
  temporaryRoot: string = tmpdir(),
  fileSystem: FileSystem = nodeFileSystem,
  digest: Digest = sha256Digest,
  clock: Clock = systemClock,
): MdCompressDependencies => ({ clock, digest, fileSystem, temporaryRoot });

const sourcePathFor = (args: readonly string[]): string | undefined => {
  const [command, sourcePath] = args;
  if ((command !== 'begin' && command !== 'finalize') || !sourcePath) {
    return undefined;
  }
  return args.length === 2 ? sourcePath : undefined;
};

export const usage = (): string =>
  [
    'Usage: bun <agents-root>/scripts/md-compress.ts begin <markdown-path> | finalize <markdown-path>',
    'begin writes a guarded backup and lock under tmpdir()/md-compress, then returns the exact finalize action.',
    'After the current agent compresses the Markdown, finalize validates protected Markdown tokens and removes the temporary backup and lock.',
  ].join('\n');

export async function run(
  args: readonly string[],
  write: (message: string) => void = console.log,
  dependencies?: MdCompressDependencies,
): Promise<void> {
  const sourcePath = sourcePathFor(args);
  if (!sourcePath) {
    throw new Error(usage());
  }
  const resolvedDependencies = dependencies ?? defaultDependencies();
  const backupRoot = temporaryBackupRootFor(resolvedDependencies.temporaryRoot);
  if (args[0] === 'begin') {
    const guard = await guardCompression(
      resolvedDependencies.fileSystem,
      backupRoot,
      sourcePath,
      resolvedDependencies.digest,
    );
    await claimCompressionLock(
      resolvedDependencies.fileSystem,
      guard,
      resolvedDependencies.clock,
      60_000,
    );
    write(
      JSON.stringify({
        backupPath: guard.backupPath,
        lockPath: guard.lockPath,
        next: {
          action: 'edit-markdown-then-finalize',
          args: ['finalize', sourcePath],
        },
        sourcePath,
      }),
    );
    return;
  }
  const guard = await resumeCompressionGuard(
    resolvedDependencies.fileSystem,
    backupRoot,
    sourcePath,
    resolvedDependencies.digest,
  );
  await finalizeCompression(resolvedDependencies.fileSystem, sourcePath, guard);
  write(
    JSON.stringify({
      backupPath: guard.backupPath,
      lockPath: guard.lockPath,
      next: { action: 'done', status: 'compressed' },
      sourcePath,
    }),
  );
}

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
