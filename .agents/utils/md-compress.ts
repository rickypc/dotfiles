import type { FileSystem } from './filesystem.js';
import { readText, removeFile, writeText } from './filesystem.js';

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
