import type { CommandSpec } from './contracts.js';
import type { CommandExecutor } from './process.js';
import {
  commandText,
  type SearchAttempt,
  type SearchFallbackReceipt,
  skippedRgAttempts,
  stagedRgSearch,
} from './search-fallback.js';

type InspectionOperationReader = (record: Record<string, unknown>) => RepoSearchInspectionOperation;

interface ListedRepoSearchProject {
  readonly name: string;
  readonly roots: readonly string[];
}

export interface RepoSearchInspectionEntry {
  readonly code: number;
  readonly command: string;
  readonly operation: RepoSearchInspectionOperation['operation'] | 'index-status';
  readonly output: string;
}

export type RepoSearchInspectionOperation =
  | { readonly operation: 'architecture'; readonly path: string }
  | { readonly operation: 'schema' }
  | {
      readonly label: string;
      readonly limit: number;
      readonly namePattern: string;
      readonly operation: 'search-graph';
    }
  | { readonly operation: 'snippet'; readonly qualifiedName: string }
  | {
      readonly depth: number;
      readonly direction: 'inbound' | 'outbound';
      readonly operation: 'trace';
      readonly qualifiedName: string;
    }
  | {
      readonly limit: number;
      readonly operation: 'search-code';
      readonly pattern: string;
    };

export interface RepoSearchInspectionReceipt {
  readonly entries: readonly RepoSearchInspectionEntry[];
  readonly project: string;
  readonly ready: boolean;
  readonly root: string;
}

export interface RepoSearchReadRequest {
  readonly allowedRoots: readonly string[];
  readonly read: (project: string) => CommandSpec;
  readonly root: RepoSearchRoot;
}

export interface RepoSearchReadResult {
  readonly indexed: boolean;
  readonly output: string;
  readonly project: string;
}

export interface RepoSearchRoot {
  readonly index: string;
  readonly root: string;
}

export interface RepoSearchSearchFallbackReceipt extends SearchFallbackReceipt {
  readonly source: 'repo-search' | 'none' | 'rg';
}

export interface RepoSearchSearchFallbackRequest {
  readonly allowedRoots: readonly string[];
  readonly query: string;
  readonly root: RepoSearchRoot;
}

type RepoSearchSearchStrategy = 'repo-search-code' | 'repo-search-graph';

/** The repo-search graph fields whose values identify a returned node or source path. */
export const repoSearchGraphIdentityFields = [
  'name',
  'qualified_name',
  'file_path',
  'path',
] as const;

export const repoSearchCommand = (
  operation: string,
  args: readonly string[] = [],
): CommandSpec => ({
  args: ['cli', operation, ...args],
  command: 'codebase-memory-mcp',
  environment: { REPO_SEARCH_LOG_LEVEL: 'error' },
});

export const repoSearchCommands = {
  getArchitecture: (project: string, path = ''): CommandSpec =>
    repoSearchCommand('get_architecture', ['--project', project, '--path', path]),
  getCodeSnippet: (project: string, qualifiedName: string): CommandSpec =>
    repoSearchCommand('get_code_snippet', [
      '--project',
      project,
      '--qualified-name',
      qualifiedName,
    ]),
  getGraphSchema: (project: string): CommandSpec =>
    repoSearchCommand('get_graph_schema', ['--project', project]),
  indexRepository: (root: string, project: string): CommandSpec =>
    repoSearchCommand('index_repository', [
      '--repo-path',
      root,
      '--name',
      project,
      '--mode',
      'full',
    ]),
  indexStatus: (project: string): CommandSpec =>
    repoSearchCommand('index_status', ['--project', project]),
  listProjects: (): CommandSpec => repoSearchCommand('list_projects'),
  queryGraph: (project: string, query: string, limit: number): CommandSpec =>
    repoSearchCommand('query_graph', [
      '--project',
      project,
      '--query',
      query,
      '--max-rows',
      String(limit),
    ]),
  searchCode: (project: string, pattern: string, limit: number): CommandSpec =>
    repoSearchCommand('search_code', [
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
    repoSearchCommand('search_graph', [
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
    repoSearchCommand('search_graph', [
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
    repoSearchCommand('trace_path', [
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

const architectureInspection = (record: Record<string, unknown>): RepoSearchInspectionOperation => {
  if (typeof record.path !== 'string') {
    throw new Error('repo-search inspection architecture path must be a string.');
  }
  return { operation: 'architecture', path: record.path };
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const nonEmptyString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`repo-search inspection ${name} must be a non-empty string.`);
  }
  return value;
};

const operationRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Each repo-search inspection JSONL line must be an object.');
  }
  return value as Record<string, unknown>;
};

const positiveInspectionValue = (value: unknown, name: string): number => {
  if (!isPositiveInteger(value)) {
    throw new Error(`repo-search inspection ${name} must be a positive integer.`);
  }
  return value;
};

const searchGraphInspection = (record: Record<string, unknown>): RepoSearchInspectionOperation => ({
  label: nonEmptyString(record.label, 'search-graph label'),
  limit: positiveInspectionValue(record.limit, 'search-graph limit'),
  namePattern: nonEmptyString(record.namePattern, 'search-graph namePattern'),
  operation: 'search-graph',
});

const snippetInspection = (record: Record<string, unknown>): RepoSearchInspectionOperation => ({
  operation: 'snippet',
  qualifiedName: nonEmptyString(record.qualifiedName, 'snippet qualifiedName'),
});

const traceInspection = (record: Record<string, unknown>): RepoSearchInspectionOperation => {
  const direction = record.direction;
  if (direction !== 'inbound' && direction !== 'outbound') {
    throw new Error('repo-search inspection trace direction must be inbound or outbound.');
  }
  return {
    depth: positiveInspectionValue(record.depth, 'trace depth'),
    direction,
    operation: 'trace',
    qualifiedName: nonEmptyString(record.qualifiedName, 'trace qualifiedName'),
  };
};

const inspectionReaders: Readonly<Record<string, InspectionOperationReader>> = {
  architecture: architectureInspection,
  schema: () => ({ operation: 'schema' }),
  'search-code': (record) => ({
    limit: positiveInspectionValue(record.limit, 'search-code limit'),
    operation: 'search-code',
    pattern: nonEmptyString(record.pattern, 'search-code pattern'),
  }),
  'search-graph': searchGraphInspection,
  snippet: snippetInspection,
  trace: traceInspection,
};

const canonicalPath = (path: string): string => path.replace(/\/$/u, '');

export const assertAllowedRepoSearchRoot = (
  requestedRoot: string,
  allowedRoots: readonly string[],
): void => {
  if (!allowedRoots.map(canonicalPath).includes(canonicalPath(requestedRoot))) {
    throw new Error(`repo-search root is not allowed: ${requestedRoot}`);
  }
};

const inspectionEntry = async (
  executor: CommandExecutor,
  operation: RepoSearchInspectionEntry['operation'],
  command: CommandSpec,
): Promise<RepoSearchInspectionEntry> => {
  const result = await executor(command);
  return {
    code: result.code,
    command: commandText(command),
    operation,
    output: outputFor(result.stdout, result.stderr),
  };
};

const inspectionOperationFor = (value: unknown): RepoSearchInspectionOperation => {
  const record = operationRecord(value);
  const operation = nonEmptyString(record.operation, 'operation');
  const read = inspectionReaders[operation];
  if (!read) {
    throw new Error(`Unsupported repo-search inspection operation: ${operation}`);
  }
  return read(record);
};

/** Parses only script-local JSONL. repo-search itself is always called with flags. */
export const parseRepoSearchInspectionJsonl = (
  source: string,
): readonly RepoSearchInspectionOperation[] => {
  const lines = source.split(/\r?\n/u).filter((line) => line.trim());
  if (lines.length === 0) {
    throw new Error('repo-search inspection request must contain at least one JSONL line.');
  }
  return lines.map((line, index) => {
    try {
      return inspectionOperationFor(JSON.parse(line));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`repo-search inspection request line ${index + 1}: ${detail}`);
    }
  });
};

const repoSearchAttempt = (
  request: RepoSearchSearchFallbackRequest,
  strategy: RepoSearchSearchStrategy,
  status: SearchAttempt['status'],
  detail: string,
): SearchAttempt => ({
  command: commandText(
    strategy === 'repo-search-code'
      ? repoSearchCommands.searchCode(request.root.index, request.query, 20)
      : repoSearchCommands.searchGraph(request.root.index, request.query, 20),
  ),
  detail,
  status,
  strategy,
});

export const repoSearchInspectionCommand = (
  project: string,
  operation: RepoSearchInspectionOperation,
): CommandSpec => {
  if (operation.operation === 'architecture') {
    return repoSearchCommands.getArchitecture(project, operation.path);
  }
  if (operation.operation === 'schema') {
    return repoSearchCommands.getGraphSchema(project);
  }
  if (operation.operation === 'search-graph') {
    return repoSearchCommands.searchGraphByName(
      project,
      operation.namePattern,
      operation.label,
      operation.limit,
    );
  }
  if (operation.operation === 'snippet') {
    return repoSearchCommands.getCodeSnippet(project, operation.qualifiedName);
  }
  if (operation.operation === 'trace') {
    return repoSearchCommands.tracePath(
      project,
      operation.qualifiedName,
      operation.direction,
      operation.depth,
    );
  }
  return repoSearchCommands.searchCode(project, operation.pattern, operation.limit);
};

/**
 * Performs one deterministic readiness check, then concurrently executes only
 * the caller-declared independent repo-search reads. It never indexes or retries.
 */
export const inspectRepoSearch = async (
  executor: CommandExecutor,
  root: RepoSearchRoot,
  operations: readonly RepoSearchInspectionOperation[],
): Promise<RepoSearchInspectionReceipt> => {
  const status = await inspectionEntry(
    executor,
    'index-status',
    repoSearchCommands.indexStatus(root.index),
  );
  const ready = status.code === 0 && indexIsReady(status.output);
  if (!ready) {
    return { entries: [status], project: root.index, ready, root: root.root };
  }
  const entries = await Promise.all(
    operations.map((operation) =>
      inspectionEntry(
        executor,
        operation.operation,
        repoSearchInspectionCommand(root.index, operation),
      ),
    ),
  );
  return {
    entries: [status, ...entries],
    project: root.index,
    ready,
    root: root.root,
  };
};

export const repoSearchOutputHasMatches = (output: string, query?: string): boolean => {
  const json = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{') && line.endsWith('}'));
  if (!json) {
    return false;
  }
  try {
    const value = JSON.parse(json) as {
      readonly results?: unknown;
      readonly total?: unknown;
      readonly total_results?: unknown;
    };
    if (query?.trim()) {
      const expected = query.trim().toLowerCase();
      return (
        Array.isArray(value.results)
        && value.results.some((result) => {
          if (!result || typeof result !== 'object' || Array.isArray(result)) {
            return false;
          }
          const record = result as Record<string, unknown>;
          return repoSearchGraphIdentityFields.some(
            (field) =>
              typeof record[field] === 'string' && record[field].toLowerCase().includes(expected),
          );
        })
      );
    }
    return (
      (Array.isArray(value.results) && value.results.length > 0)
      || (typeof value.total === 'number' && value.total > 0)
      || (typeof value.total_results === 'number' && value.total_results > 0)
    );
  } catch {
    return false;
  }
};

export const repoSearchProjectNames = (output: string): readonly string[] =>
  [...output.matchAll(/"name"\s*:\s*"([^"\\]+)"/gu)].map((match) => match[1] ?? '');

const rootPropertyNames = new Set([
  'path',
  'repo_path',
  'repoPath',
  'repository_path',
  'repositoryPath',
  'root',
  'root_path',
  'rootPath',
]);

export const assertKnownRepoSearchProject = (project: string, listProjectsOutput: string): void => {
  if (!repoSearchProjectNames(listProjectsOutput).includes(project)) {
    throw new Error(`repo-search index is not a listed project: ${project}`);
  }
};

const containsPath = (parent: string, child: string): boolean =>
  child === parent || child.startsWith(`${parent}/`);

export const indexIsReady = (output: string): boolean =>
  /\b(ready|complete|indexed)\b/iu.test(output) && !/\b(not.ready|failed|error)\b/iu.test(output);

const listedProjectEntries = (output: string): readonly ListedRepoSearchProject[] => {
  try {
    const parsed = JSON.parse(output) as { readonly projects?: unknown };
    if (!Array.isArray(parsed.projects)) {
      return [];
    }
    return parsed.projects.flatMap((project) => {
      if (!project || typeof project !== 'object') {
        return [];
      }
      const record = project as Record<string, unknown>;
      if (typeof record.name !== 'string' || !record.name.trim()) {
        return [];
      }
      return [
        {
          name: record.name,
          roots: Object.entries(record).flatMap(([key, value]) =>
            rootPropertyNames.has(key) && typeof value === 'string' && value.startsWith('/')
              ? [canonicalPath(value)]
              : [],
          ),
        },
      ];
    });
  } catch {
    return [];
  }
};

const outputFor = (stdout: string, stderr: string): string =>
  [stdout, stderr].filter(Boolean).join('\n');

const assertExistingReadyRepoSearchIndex = async (
  executor: CommandExecutor,
  request: RepoSearchSearchFallbackRequest,
): Promise<void> => {
  const status = await executor(repoSearchCommands.indexStatus(request.root.index));
  const output = outputFor(status.stdout, status.stderr);
  if (status.code !== 0 || !indexIsReady(output)) {
    throw new Error(
      `repo-search index is not ready; ask the user to create or refresh it: ${output}`,
    );
  }
};

export const readWithReadyIndex = async (
  executor: CommandExecutor,
  request: RepoSearchReadRequest,
): Promise<RepoSearchReadResult> => {
  assertAllowedRepoSearchRoot(request.root.root, request.allowedRoots);
  const status = await executor(repoSearchCommands.indexStatus(request.root.index));
  let indexed = false;
  if (!indexIsReady(outputFor(status.stdout, status.stderr))) {
    const indexing = await executor(
      repoSearchCommands.indexRepository(request.root.root, request.root.index),
    );
    if (indexing.code !== 0) {
      throw new Error(
        `repo-search indexing failed: ${outputFor(indexing.stdout, indexing.stderr)}`,
      );
    }
    indexed = true;
    const retriedStatus = await executor(repoSearchCommands.indexStatus(request.root.index));
    if (!indexIsReady(outputFor(retriedStatus.stdout, retriedStatus.stderr))) {
      throw new Error(
        `repo-search index is not ready: ${outputFor(retriedStatus.stdout, retriedStatus.stderr)}`,
      );
    }
  }
  const read = await executor(request.read(request.root.index));
  if (read.code !== 0) {
    throw new Error(`repo-search read failed: ${outputFor(read.stdout, read.stderr)}`);
  }
  return {
    indexed,
    output: outputFor(read.stdout, read.stderr),
    project: request.root.index,
  };
};

/**
 * Resolves only an explicit repo-search root mapping. A shared home directory is not
 * evidence that a child repository belongs to the home index.
 */
export const repoSearchProjectForRoot = (projectRoot: string, projectsOutput: string): string => {
  const requestedRoot = canonicalPath(projectRoot);
  const candidates = listedProjectEntries(projectsOutput)
    .flatMap((project) =>
      project.roots
        .filter((root) => containsPath(root, requestedRoot))
        .map((root) => ({ name: project.name, root })),
    )
    .sort((left, right) => right.root.length - left.root.length);
  const best = candidates[0];
  if (!best) {
    throw new Error(
      `No repo-search project has an explicit indexed root for ${requestedRoot}. Index the intended project first; do not guess from parent directories or project names.`,
    );
  }
  if (
    candidates.some(
      (candidate) => candidate.root.length === best.root.length && candidate.name !== best.name,
    )
  ) {
    throw new Error(
      `Multiple repo-search projects match ${requestedRoot} at the same root depth. Resolve the duplicate index mapping before starting active lifecycle.`,
    );
  }
  return best.name;
};

export const resolveRepoSearchProjectForRoot = async (
  projectRoot: string,
  execute: CommandExecutor,
): Promise<string> => {
  const projects = await execute(repoSearchCommands.listProjects());
  if (projects.code !== 0) {
    throw new Error('repo-search project list is unavailable.');
  }
  return repoSearchProjectForRoot(projectRoot, projects.stdout);
};

const runRepoSearchSearch = async (
  executor: CommandExecutor,
  request: RepoSearchSearchFallbackRequest,
  strategy: RepoSearchSearchStrategy,
): Promise<{
  readonly attempt: SearchAttempt;
  readonly matched: boolean;
  readonly output: string;
}> => {
  const command =
    strategy === 'repo-search-code'
      ? repoSearchCommands.searchCode(request.root.index, request.query, 20)
      : repoSearchCommands.searchGraph(request.root.index, request.query, 20);
  try {
    const result = await executor(command);
    const output = outputFor(result.stdout, result.stderr);
    const matched =
      result.code === 0
      && repoSearchOutputHasMatches(
        output,
        strategy === 'repo-search-code' ? undefined : request.query,
      );
    return {
      attempt: repoSearchAttempt(
        request,
        strategy,
        matched ? 'found' : result.code === 0 ? 'not-found' : 'error',
        output || `Exit code ${result.code}.`,
      ),
      matched,
      output,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      attempt: repoSearchAttempt(request, strategy, 'error', detail),
      matched: false,
      output: '',
    };
  }
};

const skippedRepoSearchCodeAttempt = (
  request: RepoSearchSearchFallbackRequest,
  detail: string,
): SearchAttempt => repoSearchAttempt(request, 'repo-search-code', 'skipped', detail);

export const searchWithRepoSearchFallback = async (
  executor: CommandExecutor,
  request: RepoSearchSearchFallbackRequest,
): Promise<RepoSearchSearchFallbackReceipt> => {
  assertAllowedRepoSearchRoot(request.root.root, request.allowedRoots);
  const query = request.query.trim();
  if (!query) {
    throw new Error('Search query is required.');
  }
  const normalizedRequest = query === request.query ? request : { ...request, query };
  try {
    await assertExistingReadyRepoSearchIndex(executor, normalizedRequest);
    const graph = await runRepoSearchSearch(executor, normalizedRequest, 'repo-search-graph');
    if (graph.matched) {
      return {
        attempts: [
          graph.attempt,
          skippedRepoSearchCodeAttempt(
            normalizedRequest,
            'Skipped because repo-search graph search found a match.',
          ),
          ...skippedRgAttempts(
            normalizedRequest.root.root,
            normalizedRequest.query,
            'Skipped because repo-search found a match.',
          ),
        ],
        found: true,
        output: graph.output,
        source: 'repo-search',
      };
    }
    const code = await runRepoSearchSearch(executor, normalizedRequest, 'repo-search-code');
    if (code.matched) {
      return {
        attempts: [
          graph.attempt,
          code.attempt,
          ...skippedRgAttempts(
            normalizedRequest.root.root,
            normalizedRequest.query,
            'Skipped because repo-search code search found a match.',
          ),
        ],
        found: true,
        output: code.output,
        source: 'repo-search',
      };
    }
    const fallback = await stagedRgSearch(
      executor,
      normalizedRequest.root.root,
      normalizedRequest.query,
    );
    return {
      attempts: [graph.attempt, code.attempt, ...fallback.attempts],
      found: fallback.found,
      output: fallback.output,
      source: fallback.found ? 'rg' : 'none',
    };
  } catch (error) {
    const fallback = await stagedRgSearch(
      executor,
      normalizedRequest.root.root,
      normalizedRequest.query,
    );
    return {
      attempts: [
        repoSearchAttempt(
          normalizedRequest,
          'repo-search-graph',
          'error',
          error instanceof Error ? error.message : String(error),
        ),
        skippedRepoSearchCodeAttempt(
          normalizedRequest,
          'Skipped because repo-search index readiness failed.',
        ),
        ...fallback.attempts,
      ],
      found: fallback.found,
      output: fallback.output,
      source: fallback.found ? 'rg' : 'none',
    };
  }
};
