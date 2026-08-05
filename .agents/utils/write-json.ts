import type { FileSystem } from './filesystem.js';

export interface JsonPathApi {
  readonly isAbsolute: (path: string) => boolean;
  readonly relative: (from: string, to: string) => string;
  readonly resolve: (...paths: readonly string[]) => string;
}

export interface WriteJsonDependencies {
  readonly fileSystem: FileSystem;
  readonly pathApi: JsonPathApi;
  readonly temporaryRoot: string;
  readonly writeText: (
    fileSystem: FileSystem,
    path: string,
    content: string,
  ) => Promise<void>;
}

const isWithinRoot = (
  pathApi: JsonPathApi,
  root: string,
  candidate: string,
): boolean => {
  const relative = pathApi.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !pathApi.isAbsolute(relative))
  );
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
    throw new Error(
      'JSON output path must be inside the operating-system temporary directory.',
    );
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
