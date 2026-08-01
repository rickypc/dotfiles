import { tmpdir } from 'node:os';
import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import {
  cbmCommands,
  inspectCbm,
  parseCbmInspectionJsonl,
  resolveCbmProjectForRoot,
  searchWithCbmFallback,
} from '../utils/codebase-memory.js';
import type { CommandSpec } from '../utils/contracts.js';
import { nodeFileSystem, readText } from '../utils/filesystem.js';
import { bunExecutor } from '../utils/process.js';
import { commandText } from '../utils/search-fallback.js';

const isTemporaryRequestPath = (
  requestPath: string,
  temporaryDirectory: string,
): boolean => {
  const base = temporaryDirectory.replace(/\/+$/u, '');
  return requestPath.startsWith(`${base}/`);
};

const listProjectsFor = (
  command: string,
  length: number,
): CommandSpec | undefined =>
  command === 'list-projects' && length === 1
    ? cbmCommands.listProjects()
    : undefined;

const commandForSimple = (
  command: string,
  project: string | undefined,
  value: string | undefined,
  length: number,
): CommandSpec | undefined => {
  const projects = listProjectsFor(command, length);
  if (projects) return projects;
  if (!project) return undefined;
  if (command === 'index-status' && length === 2)
    return cbmCommands.indexStatus(project);
  if (command === 'architecture' && length === 2)
    return cbmCommands.getArchitecture(project);
  if (command === 'schema' && length === 2)
    return cbmCommands.getGraphSchema(project);
  if (command === 'snippet' && value && length === 3)
    return cbmCommands.getCodeSnippet(project, value);
  return undefined;
};

const runInspect = async (
  args: readonly string[],
  write: (message: string) => void,
  read: (path: string) => Promise<string | Buffer>,
  resolve: typeof resolveCbmProjectForRoot,
  inspect: typeof inspectCbm,
  temporaryDirectory: string,
): Promise<boolean> => {
  const [command, root, requestPath] = args;
  if (command !== 'inspect' || !root || !requestPath || args.length !== 3) {
    return false;
  }
  if (
    !root.startsWith('/') ||
    !isTemporaryRequestPath(requestPath, temporaryDirectory)
  ) {
    throw new Error(
      'inspect requires an absolute <approved-root> and an absolute JSONL request path under the OS temporary directory.',
    );
  }
  const [project, request] = await Promise.all([
    resolve(root, bunExecutor),
    read(requestPath),
  ]);
  write(
    JSON.stringify(
      await inspect(
        bunExecutor,
        { index: project, root },
        parseCbmInspectionJsonl(String(request)),
      ),
      null,
      2,
    ),
  );
  return true;
};

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/codebase-memory.ts <architecture|discover|index-status|inspect|list-projects|query|schema|search-code|search-graph|snippet|trace> <arguments>';

const positiveLimit = (value: string): number => {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(usage());
  }
  return limit;
};

const commandForTrace = (
  command: string,
  project: string | undefined,
  value: string | undefined,
  direction: string | undefined,
  depth: string | undefined,
  length: number,
): CommandSpec | undefined => {
  if (
    command !== 'trace' ||
    !project ||
    !value ||
    !direction ||
    !depth ||
    length !== 5 ||
    (direction !== 'inbound' && direction !== 'outbound')
  )
    return undefined;
  return cbmCommands.tracePath(project, value, direction, positiveLimit(depth));
};

const limitedCommand = (
  command: string,
  project: string,
  value: string,
  limit: string,
): CommandSpec | undefined => {
  if (command === 'search-graph')
    return cbmCommands.searchGraph(project, value, positiveLimit(limit));
  if (command === 'search-code')
    return cbmCommands.searchCode(project, value, positiveLimit(limit));
  if (command === 'query')
    return cbmCommands.queryGraph(project, value, positiveLimit(limit));
  return undefined;
};

const commandForLimited = (
  command: string,
  project: string | undefined,
  value: string | undefined,
  limit: string | undefined,
  length: number,
): CommandSpec | undefined =>
  project && value && limit && length === 4
    ? limitedCommand(command, project, value, limit)
    : undefined;

export const commandFor = (args: readonly string[]): CommandSpec => {
  const [command, project, value, limitOrDirection, depthOrLimit] = args;
  const simple = commandForSimple(command, project, value, args.length);
  if (simple) return simple;
  const limited = commandForLimited(
    command,
    project,
    value,
    limitOrDirection,
    args.length,
  );
  if (limited) return limited;
  const trace = commandForTrace(
    command,
    project,
    value,
    limitOrDirection,
    depthOrLimit,
    args.length,
  );
  if (trace) return trace;
  throw new Error(usage());
};

export const run = async (
  args: readonly string[],
  write: (message: string) => void = console.log,
  search = searchWithCbmFallback,
  read: (path: string) => Promise<string | Buffer> = readText.bind(
    undefined,
    nodeFileSystem,
  ),
  resolve = resolveCbmProjectForRoot,
  inspect = inspectCbm,
  temporaryDirectory = tmpdir(),
): Promise<void> => {
  if (await runInspect(args, write, read, resolve, inspect, temporaryDirectory))
    return;
  const [command, root, project, query] = args;
  if (command === 'discover' && root && project && query && args.length === 4) {
    write(
      JSON.stringify(
        await search(bunExecutor, {
          allowedRoots: [root],
          query,
          root: { index: project, root },
        }),
        null,
        2,
      ),
    );
    return;
  }
  const spec = commandFor(args);
  write(commandText(spec));
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
