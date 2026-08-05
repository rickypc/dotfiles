import { tmpdir } from 'node:os';
import path from 'node:path';
import { nodeFileSystem, writeText } from '../utils/filesystem.js';
import { type WriteJsonDependencies, writeJson } from '../utils/write-json.js';

export interface WriteJsonCliDependencies extends WriteJsonDependencies {
  readonly readInput: () => Promise<string>;
}

const readStdin = async (): Promise<string> => new Response(Bun.stdin).text();

const defaultDependencies: WriteJsonCliDependencies = {
  fileSystem: nodeFileSystem,
  pathApi: path,
  readInput: readStdin,
  temporaryRoot: tmpdir(),
  writeText,
};

export const run = async (
  args: readonly string[],
  dependencies: WriteJsonCliDependencies = defaultDependencies,
): Promise<void> => {
  if (args.length !== 1) {
    throw new Error(
      'Usage: bun <agents-root>/scripts/write-json.ts <absolute-json-output-path>',
    );
  }
  await writeJson(args[0], await dependencies.readInput(), dependencies);
};

if (import.meta.main) {
  run(Bun.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
