import type { CommandSpec } from './contracts.js';
import type { CommandExecutor } from './process.js';
import {
  commandText,
  type SearchAttempt,
  type SearchFallbackReceipt,
  skippedRgAttempts,
  stagedRgSearch,
} from './search-fallback.js';

export interface CbmInspectionEntry {
  readonly code: number;
  readonly command: string;
  readonly operation: CbmInspectionOperation['operation'] | 'index-status';
  readonly output: string;
}

export type CbmInspectionOperation =
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

export interface CbmInspectionReceipt {
  readonly entries: readonly CbmInspectionEntry[];
  readonly project: string;
  readonly ready: boolean;
  readonly root: string;
}

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

type CbmSearchStrategy = 'cbm-search-code' | 'cbm-search-graph';

type InspectionOperationReader = (
  record: Record<string, unknown>,
) => CbmInspectionOperation;

interface ListedCbmProject {
  readonly name: string;
  readonly roots: readonly string[];
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
  getArchitecture: (project: string, path = ''): CommandSpec =>
    cbmCommand('get_architecture', ['--project', project, '--path', path]),
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

const architectureInspection = (
  record: Record<string, unknown>,
): CbmInspectionOperation => {
  if (typeof record.path !== 'string') {
    throw new Error('CBM inspection architecture path must be a string.');
  }
  return { operation: 'architecture', path: record.path };
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const nonEmptyString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`CBM inspection ${name} must be a non-empty string.`);
  }
  return value;
};

const operationRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Each CBM inspection JSONL line must be an object.');
  }
  return value as Record<string, unknown>;
};

const positiveInspectionValue = (value: unknown, name: string): number => {
  if (!isPositiveInteger(value)) {
    throw new Error(`CBM inspection ${name} must be a positive integer.`);
  }
  return value;
};

const searchGraphInspection = (
  record: Record<string, unknown>,
): CbmInspectionOperation => ({
  label: nonEmptyString(record.label, 'search-graph label'),
  limit: positiveInspectionValue(record.limit, 'search-graph limit'),
  namePattern: nonEmptyString(record.namePattern, 'search-graph namePattern'),
  operation: 'search-graph',
});

const snippetInspection = (
  record: Record<string, unknown>,
): CbmInspectionOperation => ({
  operation: 'snippet',
  qualifiedName: nonEmptyString(record.qualifiedName, 'snippet qualifiedName'),
});

const traceInspection = (
  record: Record<string, unknown>,
): CbmInspectionOperation => {
  const direction = record.direction;
  if (direction !== 'inbound' && direction !== 'outbound') {
    throw new Error(
      'CBM inspection trace direction must be inbound or outbound.',
    );
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
  strategy: CbmSearchStrategy,
  status: SearchAttempt['status'],
  detail: string,
): SearchAttempt => ({
  command: commandText(
    strategy === 'cbm-search-code'
      ? cbmCommands.searchCode(request.root.index, request.query, 20)
      : cbmCommands.searchGraph(request.root.index, request.query, 20),
  ),
  detail,
  status,
  strategy,
});

export const cbmInspectionCommand = (
  project: string,
  operation: CbmInspectionOperation,
): CommandSpec => {
  if (operation.operation === 'architecture') {
    return cbmCommands.getArchitecture(project, operation.path);
  }
  if (operation.operation === 'schema') {
    return cbmCommands.getGraphSchema(project);
  }
  if (operation.operation === 'search-graph') {
    return cbmCommands.searchGraphByName(
      project,
      operation.namePattern,
      operation.label,
      operation.limit,
    );
  }
  if (operation.operation === 'snippet') {
    return cbmCommands.getCodeSnippet(project, operation.qualifiedName);
  }
  if (operation.operation === 'trace') {
    return cbmCommands.tracePath(
      project,
      operation.qualifiedName,
      operation.direction,
      operation.depth,
    );
  }
  return cbmCommands.searchCode(project, operation.pattern, operation.limit);
};

export const cbmOutputHasMatches = (
  output: string,
  query?: string,
): boolean => {
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

export const cbmProjectNames = (output: string): readonly string[] =>
  [...output.matchAll(/"name"\s*:\s*"([^"\\]+)"/gu)].map(
    (match) => match[1] ?? '',
  );

const inspectionEntry = async (
  executor: CommandExecutor,
  operation: CbmInspectionEntry['operation'],
  command: CommandSpec,
): Promise<CbmInspectionEntry> => {
  const result = await executor(command);
  return {
    code: result.code,
    command: commandText(command),
    operation,
    output: outputFor(result.stdout, result.stderr),
  };
};

/**
 * Performs one deterministic readiness check, then concurrently executes only
 * the caller-declared independent CBM reads. It never indexes or retries.
 */
export const inspectCbm = async (
  executor: CommandExecutor,
  root: CbmRoot,
  operations: readonly CbmInspectionOperation[],
): Promise<CbmInspectionReceipt> => {
  const status = await inspectionEntry(
    executor,
    'index-status',
    cbmCommands.indexStatus(root.index),
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
        cbmInspectionCommand(root.index, operation),
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

const inspectionOperationFor = (value: unknown): CbmInspectionOperation => {
  const record = operationRecord(value);
  const operation = nonEmptyString(record.operation, 'operation');
  const read = inspectionReaders[operation];
  if (!read) {
    throw new Error(`Unsupported CBM inspection operation: ${operation}`);
  }
  return read(record);
};

/** Parses only script-local JSONL. CBM itself is always called with flags. */
export const parseCbmInspectionJsonl = (
  source: string,
): readonly CbmInspectionOperation[] => {
  const lines = source.split(/\r?\n/u).filter((line) => line.trim());
  if (lines.length === 0) {
    throw new Error(
      'CBM inspection request must contain at least one JSONL line.',
    );
  }
  return lines.map((line, index) => {
    try {
      return inspectionOperationFor(JSON.parse(line));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`CBM inspection request line ${index + 1}: ${detail}`);
    }
  });
};

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

export const assertKnownCbmProject = (
  project: string,
  listProjectsOutput: string,
): void => {
  if (!cbmProjectNames(listProjectsOutput).includes(project)) {
    throw new Error(`CBM index is not a listed project: ${project}`);
  }
};

const containsPath = (parent: string, child: string): boolean =>
  child === parent || child.startsWith(`${parent}/`);

export const indexIsReady = (output: string): boolean =>
  /\b(ready|complete|indexed)\b/iu.test(output) &&
  !/\b(not.ready|failed|error)\b/iu.test(output);

const listedProjectEntries = (output: string): readonly ListedCbmProject[] => {
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
            rootPropertyNames.has(key) &&
            typeof value === 'string' &&
            value.startsWith('/')
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

/**
 * Resolves only an explicit CBM root mapping. A shared home directory is not
 * evidence that a child repository belongs to the home index.
 */
export const cbmProjectForRoot = (
  projectRoot: string,
  projectsOutput: string,
): string => {
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
      `No CBM project has an explicit indexed root for ${requestedRoot}. Index the intended project first; do not guess from parent directories or project names.`,
    );
  }
  if (
    candidates.some(
      (candidate) =>
        candidate.root.length === best.root.length &&
        candidate.name !== best.name,
    )
  ) {
    throw new Error(
      `Multiple CBM projects match ${requestedRoot} at the same root depth. Resolve the duplicate index mapping before starting AIDLC.`,
    );
  }
  return best.name;
};

const outputFor = (stdout: string, stderr: string): string =>
  [stdout, stderr].filter(Boolean).join('\n');

const assertExistingReadyCbmIndex = async (
  executor: CommandExecutor,
  request: CbmSearchFallbackRequest,
): Promise<void> => {
  const status = await executor(cbmCommands.indexStatus(request.root.index));
  const output = outputFor(status.stdout, status.stderr);
  if (status.code !== 0 || !indexIsReady(output)) {
    throw new Error(
      `CBM index is not ready; ask the user to create or refresh it: ${output}`,
    );
  }
};

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

export const resolveCbmProjectForRoot = async (
  projectRoot: string,
  execute: CommandExecutor,
): Promise<string> => {
  const projects = await execute(cbmCommands.listProjects());
  if (projects.code !== 0) {
    throw new Error('CBM project list is unavailable.');
  }
  return cbmProjectForRoot(projectRoot, projects.stdout);
};

const runCbmSearch = async (
  executor: CommandExecutor,
  request: CbmSearchFallbackRequest,
  strategy: CbmSearchStrategy,
): Promise<{
  readonly attempt: SearchAttempt;
  readonly matched: boolean;
  readonly output: string;
}> => {
  const command =
    strategy === 'cbm-search-code'
      ? cbmCommands.searchCode(request.root.index, request.query, 20)
      : cbmCommands.searchGraph(request.root.index, request.query, 20);
  try {
    const result = await executor(command);
    const output = outputFor(result.stdout, result.stderr);
    const matched =
      result.code === 0 &&
      cbmOutputHasMatches(
        output,
        strategy === 'cbm-search-code' ? undefined : request.query,
      );
    return {
      attempt: cbmAttempt(
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
      attempt: cbmAttempt(request, strategy, 'error', detail),
      matched: false,
      output: '',
    };
  }
};

const skippedCbmCodeAttempt = (
  request: CbmSearchFallbackRequest,
  detail: string,
): SearchAttempt => cbmAttempt(request, 'cbm-search-code', 'skipped', detail);

export const searchWithCbmFallback = async (
  executor: CommandExecutor,
  request: CbmSearchFallbackRequest,
): Promise<CbmSearchFallbackReceipt> => {
  assertAllowedCbmRoot(request.root.root, request.allowedRoots);
  if (!request.query.trim()) {
    throw new Error('Search query is required.');
  }
  try {
    await assertExistingReadyCbmIndex(executor, request);
    const graph = await runCbmSearch(executor, request, 'cbm-search-graph');
    if (graph.matched) {
      return {
        attempts: [
          graph.attempt,
          skippedCbmCodeAttempt(
            request,
            'Skipped because CBM graph search found a match.',
          ),
          ...skippedRgAttempts(
            request.root.root,
            request.query,
            'Skipped because CBM found a match.',
          ),
        ],
        found: true,
        output: graph.output,
        source: 'cbm',
      };
    }
    const code = await runCbmSearch(executor, request, 'cbm-search-code');
    if (code.matched) {
      return {
        attempts: [
          graph.attempt,
          code.attempt,
          ...skippedRgAttempts(
            request.root.root,
            request.query,
            'Skipped because CBM code search found a match.',
          ),
        ],
        found: true,
        output: code.output,
        source: 'cbm',
      };
    }
    const fallback = await stagedRgSearch(
      executor,
      request.root.root,
      request.query,
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
      request.root.root,
      request.query,
    );
    return {
      attempts: [
        cbmAttempt(
          request,
          'cbm-search-graph',
          'error',
          error instanceof Error ? error.message : String(error),
        ),
        skippedCbmCodeAttempt(
          request,
          'Skipped because CBM index readiness failed.',
        ),
        ...fallback.attempts,
      ],
      found: fallback.found,
      output: fallback.output,
      source: fallback.found ? 'rg' : 'none',
    };
  }
};
