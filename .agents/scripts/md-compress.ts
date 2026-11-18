import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandBody, CommandDeclaration } from '../utils/cli/declaration.js';
import { runMain } from '../utils/cli/index.js';
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

export interface CompressionReceipt {
  readonly backupPath?: string;
  readonly lockPath?: string;
  readonly next: {
    readonly action: string;
    readonly args?: readonly string[];
    readonly status?: string;
  };
  readonly sourcePath: string;
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

export interface RemovalAuthorization {
  readonly removals: readonly RemovalDeclaration[];
  readonly sourcePath: string;
}

export interface RemovalDeclaration {
  readonly basis: 'duplicate' | 'false-positive' | 'superseded-contract' | 'user-request';
  readonly justification: string;
  readonly token: string;
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

export const backupPathFor = (backupRoot: string, sourcePath: string, digest: Digest): string =>
  `${backupRoot}/${digest.sha256(sourcePath)}/${sourcePath.split('/').at(-1)}.original`;

export const clockFor = (now: () => number): Clock => ({ now });

export const digestFor = (hash: HashFactory): Digest => ({
  sha256: (value) => hash('sha256').update(value).digest('hex'),
});

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

const protectedTokens = (content: string): string[] => content.match(markdownTokens) ?? [];

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

const temporaryBackupRootFor = (temporaryRoot: string): string =>
  join(temporaryRoot, 'md-compress');

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
    if (error instanceof Error && error.message.startsWith('Compression is already')) {
      throw error;
    }
  }
  await writeText(fileSystem, guard.lockPath, String(clock.now()));
};

const validateRemovalAuthorization = (
  original: string,
  candidate: string,
  sourcePath: string,
  authorization: RemovalAuthorization,
): Set<string> => {
  if (authorization.sourcePath !== sourcePath) {
    throw new Error(`Removal authorization source mismatch: ${authorization.sourcePath}`);
  }
  const originalTokens = new Set(protectedTokens(original));
  const authorized = new Set<string>();
  const allowedBases = new Set<RemovalDeclaration['basis']>([
    'duplicate',
    'false-positive',
    'superseded-contract',
    'user-request',
  ]);
  for (const removal of authorization.removals) {
    if (
      typeof removal.token !== 'string'
      || typeof removal.basis !== 'string'
      || !allowedBases.has(removal.basis as RemovalDeclaration['basis'])
      || typeof removal.justification !== 'string'
      || !removal.token
      || !originalTokens.has(removal.token)
      || candidate.includes(removal.token)
      || authorized.has(removal.token)
      || removal.justification.trim().length < 20
    ) {
      throw new Error(
        `Invalid removal authorization for protected Markdown token: ${removal.token}`,
      );
    }
    authorized.add(removal.token);
  }
  return authorized;
};

export const validateCompression = (
  original: string,
  candidate: string,
  sourcePath?: string,
  authorization?: RemovalAuthorization,
): void => {
  const lost = [
    ...new Set(protectedTokens(original).filter((token) => !candidate.includes(token))),
  ];
  if (lost.length === 0) {
    if (authorization && sourcePath) {
      validateRemovalAuthorization(original, candidate, sourcePath, authorization);
    }
    return;
  }
  if (!authorization || !sourcePath) {
    throw new Error(
      `Compression lost protected Markdown tokens: ${lost.join(', ')}. Provide an explicit removal authorization manifest.`,
    );
  }
  const authorized = validateRemovalAuthorization(original, candidate, sourcePath, authorization);
  const undeclared = lost.filter((token) => !authorized.has(token));
  if (undeclared.length > 0 || authorized.size !== lost.length) {
    throw new Error(
      `Compression lost undeclared or mismatched protected Markdown tokens: ${undeclared.join(', ')}`,
    );
  }
};

export const finalizeCompression = async (
  fileSystem: FileSystem,
  sourcePath: string,
  guard: CompressionGuard,
  authorization?: RemovalAuthorization,
): Promise<void> => {
  const candidate = await readText(fileSystem, sourcePath);
  validateCompression(guard.original, candidate, sourcePath, authorization);
  await removeFile(fileSystem, guard.backupPath);
  await removeFile(fileSystem, guard.lockPath);
};

const sha256Digest = digestFor(createHash);
const systemClock = clockFor(Date.now);

const beginCompression = async (
  sourcePath: string,
  dependencies: MdCompressDependencies,
): Promise<CompressionReceipt> => {
  const backupRoot = temporaryBackupRootFor(dependencies.temporaryRoot);
  const guard = await guardCompression(
    dependencies.fileSystem,
    backupRoot,
    sourcePath,
    dependencies.digest,
  );
  await claimCompressionLock(dependencies.fileSystem, guard, dependencies.clock, 60_000);
  return {
    backupPath: guard.backupPath,
    lockPath: guard.lockPath,
    next: { action: 'edit-markdown-then-finalize', args: ['finalize', sourcePath] },
    sourcePath,
  };
};

export const defaultDependencies = (
  temporaryRoot: string = tmpdir(),
  fileSystem: FileSystem = nodeFileSystem,
  digest: Digest = sha256Digest,
  clock: Clock = systemClock,
): MdCompressDependencies => ({ clock, digest, fileSystem, temporaryRoot });

const guardOnly = async (
  sourcePath: string,
  dependencies: MdCompressDependencies,
): Promise<CompressionReceipt> => {
  const backupRoot = temporaryBackupRootFor(dependencies.temporaryRoot);
  const guard = await guardCompression(
    dependencies.fileSystem,
    backupRoot,
    sourcePath,
    dependencies.digest,
  );
  await finalizeCompression(dependencies.fileSystem, sourcePath, guard);
  return { next: { action: 'done', status: 'guarded' }, sourcePath };
};

const receiptBody = (
  summary: string,
  positionals: string,
  arity: readonly [number, number],
  run: (paths: readonly string[]) => Promise<CompressionReceipt>,
): CommandBody<CompressionReceipt> => ({
  arity,
  positionals,
  renderText: (receipt) => JSON.stringify(receipt),
  run: (input) => run(input.positionals),
  summary,
});

const removalAuthorizationFor = async (
  fileSystem: FileSystem,
  authorizationPath: string | undefined,
  sourcePath: string,
): Promise<RemovalAuthorization | undefined> => {
  if (authorizationPath === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readText(fileSystem, authorizationPath));
  } catch {
    throw new Error(`Removal authorization must be valid JSON: ${authorizationPath}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Removal authorization must be a JSON object.');
  }
  const authorization = parsed as Partial<RemovalAuthorization>;
  if (
    typeof authorization.sourcePath !== 'string'
    || authorization.sourcePath !== sourcePath
    || !Array.isArray(authorization.removals)
    || authorization.removals.length === 0
  ) {
    throw new Error('Removal authorization must name the source path and one or more removals.');
  }
  return authorization as RemovalAuthorization;
};

const finalizeOnly = async (
  sourcePath: string,
  authorizationPath: string | undefined,
  dependencies: MdCompressDependencies,
): Promise<CompressionReceipt> => {
  const backupRoot = temporaryBackupRootFor(dependencies.temporaryRoot);
  const guard = await resumeCompressionGuard(
    dependencies.fileSystem,
    backupRoot,
    sourcePath,
    dependencies.digest,
  );
  const authorization = await removalAuthorizationFor(
    dependencies.fileSystem,
    authorizationPath,
    sourcePath,
  );
  await finalizeCompression(dependencies.fileSystem, sourcePath, guard, authorization);
  return {
    backupPath: guard.backupPath,
    lockPath: guard.lockPath,
    next: { action: 'done', status: 'compressed' },
    sourcePath,
  };
};

export const createCommand = (
  injected?: MdCompressDependencies,
): CommandDeclaration<CompressionReceipt> => {
  const dependencies = injected ?? defaultDependencies();
  return {
    commands: {
      begin: receiptBody(
        'Write a guarded backup and lock under tmpdir()/md-compress, then return the exact finalize action.',
        '<markdown-path>',
        [1, 1],
        ([path = '']) => beginCompression(path, dependencies),
      ),
      finalize: receiptBody(
        'Validate protected Markdown tokens after editing, then remove the temporary backup and lock; intentional token removal needs a JSON authorization manifest.',
        '<markdown-path> [removal-authorization-json]',
        [1, 2],
        ([path = '', authorizationPath]) => finalizeOnly(path, authorizationPath, dependencies),
      ),
      guard: receiptBody(
        'Run begin then finalize in one shot for no-edit validation passes.',
        '<markdown-path>',
        [1, 1],
        ([path = '']) => guardOnly(path, dependencies),
      ),
    },
    script: 'scripts/md-compress.ts',
    summary: 'Lossless Markdown compression with a verified temporary backup.',
  };
};

export const command = createCommand();

void runMain(command, import.meta.main);
