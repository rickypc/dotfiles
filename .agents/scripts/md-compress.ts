import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { type FileSystem, nodeFileSystem } from '../utils/filesystem.js';
import {
  type Clock,
  claimCompressionLock,
  type Digest,
  finalizeCompression,
  guardCompression,
  resumeCompressionGuard,
} from '../utils/md-compress.js';

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

export const clockFor = (now: () => number): Clock => ({ now });

export const digestFor = (hash: HashFactory): Digest => ({
  sha256: (value) => hash('sha256').update(value).digest('hex'),
});

const temporaryBackupRootFor = (temporaryRoot: string): string =>
  join(temporaryRoot, 'aidlc-md-compress');

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
    'begin writes a guarded backup and lock under tmpdir()/aidlc-md-compress, then returns the exact finalize action.',
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
