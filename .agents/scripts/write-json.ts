import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CommandDeclaration } from '../utils/cli/declaration.js';
import { runMain } from '../utils/cli/index.js';
import type { FileSystem } from '../utils/filesystem.js';
import { nodeFileSystem, writeText } from '../utils/filesystem.js';

export interface JsonPathApi {
  readonly isAbsolute: (path: string) => boolean;
  readonly relative: (from: string, to: string) => string;
  readonly resolve: (...paths: readonly string[]) => string;
}

export interface WriteJsonDependencies {
  readonly fileSystem: FileSystem;
  readonly pathApi: JsonPathApi;
  readonly temporaryRoot: string;
  readonly writeText: (fileSystem: FileSystem, path: string, content: string) => Promise<void>;
}

const isWithinRoot = (pathApi: JsonPathApi, root: string, candidate: string): boolean => {
  const relative = pathApi.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative));
};

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

const defaultDependencies: WriteJsonDependencies = {
  fileSystem: nodeFileSystem,
  pathApi: path,
  temporaryRoot: tmpdir(),
  writeText,
};

export const createCommand = (
  dependencies: WriteJsonDependencies = defaultDependencies,
): CommandDeclaration<{ readonly path: string }> => ({
  arity: [1, 1],
  positionals: '<absolute-json-output-path>',
  renderText: (data) => data.path,
  run: async (input, context) => {
    const outputPath = input.positionals[0] ?? '';
    await writeJson(outputPath, await context.readStdin(), dependencies);
    return { path: dependencies.pathApi.resolve(outputPath) };
  },
  script: 'scripts/write-json.ts',
  summary:
    'Validate JSON read from stdin and write it pretty-printed inside the operating-system temporary directory.',
});

export const command = createCommand();

void runMain(command, import.meta.main);
