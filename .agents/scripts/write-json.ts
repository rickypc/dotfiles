import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FileSystem } from '../utils/filesystem.js';
import { nodeFileSystem, writeText } from '../utils/filesystem.js';

export interface JsonPathApi {
  readonly isAbsolute: (path: string) => boolean;
  readonly relative: (from: string, to: string) => string;
  readonly resolve: (...paths: readonly string[]) => string;
}

export interface WriteJsonCliDependencies extends WriteJsonDependencies {
  readonly readInput: () => Promise<string>;
}

export interface WriteJsonDependencies {
  readonly fileSystem: FileSystem;
  readonly pathApi: JsonPathApi;
  readonly temporaryRoot: string;
  readonly writeText: (fileSystem: FileSystem, path: string, content: string) => Promise<void>;
}

type WriteJsonRunner = typeof run;

const isWithinRoot = (pathApi: JsonPathApi, root: string, candidate: string): boolean => {
  const relative = pathApi.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative));
};

export const readStdin = async (input: BodyInit = Bun.stdin): Promise<string> =>
  new Response(input).text();

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/write-json.ts <absolute-json-output-path>';

export const writeJson = async (
  outputPath: string,
  input: string,
  dependencies: WriteJsonDependencies,
): Promise<void> => {
  const { pathApi, temporaryRoot } = dependencies;
  if (!pathApi.isAbsolute(outputPath)) {
    throw new Error('JSON output path must be absolute.');
  }

  const resolvedRoot = pathApi.resolve(temporaryRoot);
  const resolvedOutput = pathApi.resolve(outputPath);
  if (!isWithinRoot(pathApi, resolvedRoot, resolvedOutput)) {
    throw new Error('JSON output path must be inside the operating-system temporary directory.');
  }

  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error('JSON input is invalid; no file was written.');
  }

  await dependencies.writeText(
    dependencies.fileSystem,
    resolvedOutput,
    `${JSON.stringify(value, null, 2)}\n`,
  );
};

const defaultDependencies: WriteJsonCliDependencies = {
  fileSystem: nodeFileSystem,
  pathApi: path,
  readInput: () => readStdin(),
  temporaryRoot: tmpdir(),
  writeText,
};

export const run = async (
  args: readonly string[],
  dependencies: WriteJsonCliDependencies = defaultDependencies,
): Promise<void> => {
  if (args.length !== 1) {
    throw new Error(usage());
  }
  await writeJson(args[0], await dependencies.readInput(), dependencies);
};

const defaultWriteJsonRunner: WriteJsonRunner = run;

export const processExit = {
  setExitCode: (code: number, target: { exitCode?: number | string | null } = process): void => {
    target.exitCode = code;
  },
};

export const runCli = async (
  args: readonly string[],
  runner: WriteJsonRunner = defaultWriteJsonRunner,
  setExitCode: (code: number) => void = (code) => processExit.setExitCode(code),
): Promise<void> => {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage());
    return;
  }
  await runner(args).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    setExitCode(1);
  });
};

void (import.meta.main ? runCli(Bun.argv.slice(2)) : undefined);
