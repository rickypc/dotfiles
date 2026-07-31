import type { CommandSpec } from './contracts.js';
import type { CommandExecutor } from './process.js';
import {
  commandText,
  type SearchAttempt,
  type SearchFallbackReceipt,
  skippedRgAttempts,
  stagedRgSearch,
} from './search-fallback.js';

export interface CbmReadRequest {
  readonly allowedRoots: readonly string[];
  readonly read: (project: string) => CommandSpec;
  readonly root: CbmRoot;
}

export interface CbmReadResult {
  readonly indexed: boolean;
  readonly output: string;
  readonly project: string;
}

export interface CbmRoot {
  readonly index: string;
  readonly root: string;
}

export interface CbmSearchFallbackReceipt extends SearchFallbackReceipt {
  readonly source: 'cbm' | 'none' | 'rg';
}

export interface CbmSearchFallbackRequest {
  readonly allowedRoots: readonly string[];
  readonly query: string;
  readonly root: CbmRoot;
}

export const cbmCommand = (
  operation: string,
  args: readonly string[] = [],
): CommandSpec => ({
  args: ['cli', operation, ...args],
  command: 'codebase-memory-mcp',
  environment: { CBM_LOG_LEVEL: 'error' },
});

export const cbmCommands = {
  getArchitecture: (project: string): CommandSpec =>
    cbmCommand('get_architecture', [
      '--project',
      project,
      '--aspects',
      'overview',
    ]),
  getCodeSnippet: (project: string, qualifiedName: string): CommandSpec =>
    cbmCommand('get_code_snippet', [
      '--project',
      project,
      '--qualified-name',
      qualifiedName,
    ]),
  getGraphSchema: (project: string): CommandSpec =>
    cbmCommand('get_graph_schema', ['--project', project]),
  indexRepository: (root: string, project: string): CommandSpec =>
    cbmCommand('index_repository', [
      '--repo-path',
      root,
      '--name',
      project,
      '--mode',
      'full',
    ]),
  indexStatus: (project: string): CommandSpec =>
    cbmCommand('index_status', ['--project', project]),
  listProjects: (): CommandSpec => cbmCommand('list_projects'),
  queryGraph: (project: string, query: string, limit: number): CommandSpec =>
    cbmCommand('query_graph', [
      '--project',
      project,
      '--query',
      query,
      '--max-rows',
      String(limit),
    ]),
  searchCode: (project: string, pattern: string, limit: number): CommandSpec =>
    cbmCommand('search_code', [
      '--project',
      project,
      '--pattern',
      pattern,
      '--mode',
      'compact',
      '--limit',
      String(limit),
    ]),
  searchGraph: (project: string, query: string, limit: number): CommandSpec =>
    cbmCommand('search_graph', [
      '--project',
      project,
      '--query',
      query,
      '--limit',
      String(limit),
    ]),
  searchGraphByName: (
    project: string,
    namePattern: string,
    label: string,
    limit: number,
  ): CommandSpec =>
    cbmCommand('search_graph', [
      '--project',
      project,
      '--name-pattern',
      namePattern,
      '--label',
      label,
      '--limit',
      String(limit),
    ]),
  tracePath: (
    project: string,
    qualifiedName: string,
    direction: 'inbound' | 'outbound',
    depth: number,
  ): CommandSpec =>
    cbmCommand('trace_path', [
      '--project',
      project,
      '--function-name',
      qualifiedName,
      '--direction',
      direction,
      '--depth',
      String(depth),
      '--mode',
      'calls',
    ]),
};

const canonicalPath = (path: string): string => path.replace(/\/$/u, '');

export const assertAllowedCbmRoot = (
  requestedRoot: string,
  allowedRoots: readonly string[],
): void => {
  if (!allowedRoots.map(canonicalPath).includes(canonicalPath(requestedRoot))) {
    throw new Error(`CBM root is not allowed: ${requestedRoot}`);
  }
};

const cbmAttempt = (
  request: CbmSearchFallbackRequest,
  status: SearchAttempt['status'],
  detail: string,
): SearchAttempt => ({
  command: commandText(
    cbmCommands.searchGraph(request.root.index, request.query, 20),
  ),
  detail,
  status,
  strategy: 'cbm-search-graph',
});

export const cbmOutputHasMatches = (
  output: string,
  query?: string,
): boolean => {
  const json = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{') && line.endsWith('}'));
  if (!json) return false;
  try {
    const value = JSON.parse(json) as {
      readonly results?: unknown;
      readonly total?: unknown;
      readonly total_results?: unknown;
    };
    if (query?.trim()) {
      const expected = query.trim().toLocaleLowerCase();
      return (
        Array.isArray(value.results) &&
        value.results.some((result) =>
          JSON.stringify(result).toLocaleLowerCase().includes(expected),
        )
      );
    }
    return (
      (Array.isArray(value.results) && value.results.length > 0) ||
      (typeof value.total === 'number' && value.total > 0) ||
      (typeof value.total_results === 'number' && value.total_results > 0)
    );
  } catch {
    return false;
  }
};

export const indexIsReady = (output: string): boolean =>
  /\b(ready|complete|indexed)\b/iu.test(output) &&
  !/\b(not.ready|failed|error)\b/iu.test(output);

const outputFor = (stdout: string, stderr: string): string =>
  [stdout, stderr].filter(Boolean).join('\n');

export const readWithReadyIndex = async (
  executor: CommandExecutor,
  request: CbmReadRequest,
): Promise<CbmReadResult> => {
  assertAllowedCbmRoot(request.root.root, request.allowedRoots);
  const status = await executor(cbmCommands.indexStatus(request.root.index));
  let indexed = false;
  if (!indexIsReady(outputFor(status.stdout, status.stderr))) {
    const indexing = await executor(
      cbmCommands.indexRepository(request.root.root, request.root.index),
    );
    if (indexing.code !== 0) {
      throw new Error(
        `CBM indexing failed: ${outputFor(indexing.stdout, indexing.stderr)}`,
      );
    }
    indexed = true;
    const retriedStatus = await executor(
      cbmCommands.indexStatus(request.root.index),
    );
    if (!indexIsReady(outputFor(retriedStatus.stdout, retriedStatus.stderr))) {
      throw new Error(
        `CBM index is not ready: ${outputFor(retriedStatus.stdout, retriedStatus.stderr)}`,
      );
    }
  }
  const read = await executor(request.read(request.root.index));
  if (read.code !== 0) {
    throw new Error(`CBM read failed: ${outputFor(read.stdout, read.stderr)}`);
  }
  return {
    indexed,
    output: outputFor(read.stdout, read.stderr),
    project: request.root.index,
  };
};

export const searchWithCbmFallback = async (
  executor: CommandExecutor,
  request: CbmSearchFallbackRequest,
): Promise<CbmSearchFallbackReceipt> => {
  assertAllowedCbmRoot(request.root.root, request.allowedRoots);
  if (!request.query.trim()) throw new Error('Search query is required.');
  try {
    const cbm = await readWithReadyIndex(executor, {
      allowedRoots: request.allowedRoots,
      read: (project) => cbmCommands.searchGraph(project, request.query, 20),
      root: request.root,
    });
    if (cbmOutputHasMatches(cbm.output, request.query)) {
      return {
        attempts: [
          cbmAttempt(request, 'found', cbm.output),
          ...skippedRgAttempts(
            request.root.root,
            request.query,
            'Skipped because CBM found a match.',
          ),
        ],
        found: true,
        output: cbm.output,
        source: 'cbm',
      };
    }
    const fallback = await stagedRgSearch(
      executor,
      request.root.root,
      request.query,
    );
    return {
      attempts: [
        cbmAttempt(
          request,
          'not-found',
          cbm.output || 'No CBM result containing the requested query.',
        ),
        ...fallback.attempts,
      ],
      found: fallback.found,
      output: fallback.output,
      source: fallback.found ? 'rg' : 'none',
    };
  } catch (error) {
    const fallback = await stagedRgSearch(
      executor,
      request.root.root,
      request.query,
    );
    return {
      attempts: [
        cbmAttempt(
          request,
          'error',
          error instanceof Error ? error.message : String(error),
        ),
        ...fallback.attempts,
      ],
      found: fallback.found,
      output: fallback.output,
      source: fallback.found ? 'rg' : 'none',
    };
  }
};
