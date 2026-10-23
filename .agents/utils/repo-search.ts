import {
  type BinaryHeadReader,
  defaultBinaryHeadReader,
  isBinaryContent,
  runBinaryGate,
  runExplicitBinaryTarget,
} from './binary-router.js';
import type { CommandExecutor } from './process.js';
import {
  type RepoSearchBackendCall,
  type RepoSearchBackendResult,
  type RepoSearchTransport,
  redactBackendStorePaths,
} from './repo-search-transport.js';
import { type SearchAttempt, skippedRgAttempts, stagedRgSearch } from './search-fallback.js';

interface ParsedIndexStatus {
  readonly indexedAt: string | null;
  readonly ready: boolean;
  readonly rootPath: string | null;
}

interface ParsedRow {
  readonly file: string;
  readonly lines: string;
  readonly qn: string;
}

interface ParsedSearchCode {
  readonly directories: readonly { readonly dir: string; readonly hits: string }[];
  readonly hasMore: boolean;
  readonly rows: readonly ParsedRow[];
}

interface ParsedSearchGraph {
  readonly hasMore: boolean;
  readonly rows: readonly ParsedRow[];
}

export interface RepoSearchDiscoverRequest {
  readonly allowedRoots: readonly string[];
  readonly discoveryMode?: 'indexed-project' | 'private-kb-local';
  readonly executor: CommandExecutor;
  readonly indexHint?: string;
  readonly probe?: SearchAttempt;
  readonly query: string;
  readonly root: string;
  readonly transport: RepoSearchTransport | null;
}

/** The one unified JSON response contract every route returns. */
export interface RepoSearchEnvelope {
  readonly attempts: readonly SearchAttempt[];
  readonly found: boolean;
  readonly next: readonly string[];
  readonly ok: boolean;
  readonly query: {
    readonly index: string | null;
    readonly input: readonly string[];
    readonly root: string;
  };
  readonly reliability: RepoSearchReliability;
  readonly results: readonly RepoSearchResult[];
  readonly source: 'binary' | 'code' | 'fallback' | 'file' | 'graph' | 'none' | 'symbol';
  readonly status: 'empty' | 'error' | 'found';
  readonly transport: 'cli' | 'mcp' | 'none';
  readonly verb: 'inspect' | 'read' | 'search';
}

export interface RepoSearchProject {
  readonly branch: string | null;
  readonly name: string;
  readonly rootPath: string | null;
}

export interface RepoSearchReadRequest {
  readonly allowedRoots: readonly string[];
  readonly executor: CommandExecutor;
  readonly headReader?: BinaryHeadReader;
  readonly probe?: SearchAttempt;
  readonly queries: readonly string[];
  readonly readFile: (path: string) => Promise<string | Buffer>;
  readonly root: string;
  readonly target: string;
  readonly transport: RepoSearchTransport | null;
}

export type RepoSearchReadTargetShape = 'file' | 'pid' | 'process' | 'symbol' | 'url';

export interface RepoSearchReliability {
  readonly backend: string | null;
  readonly caveats: readonly string[];
  readonly indexedAt: string | null;
  readonly note: string;
}

/** One located answer item inside the unified response contract. */
export interface RepoSearchResult {
  readonly detail: string | null;
  readonly kind: 'binary' | 'cluster' | 'connection' | 'file' | 'location' | 'symbol' | 'text';
  readonly location: string | null;
  readonly name: string | null;
}

/** The repo-search graph fields whose values identify a returned node or source path. */
export const repoSearchGraphIdentityFields = [
  'name',
  'qualified_name',
  'file_path',
  'path',
] as const;

const attemptDetailCap = 20_000;
const fileFragmentCapLines = 200;
const searchLimit = 20;

export const backendCall = (
  tool: string,
  args: Readonly<Record<string, string | number>>,
  timeoutMs?: number,
): RepoSearchBackendCall => ({
  args: Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])),
  ...(timeoutMs ? { timeoutMs } : {}),
  tool,
});

/** Candidate file paths for the binary content gate, from literal and filename output. */
const binaryGateCandidates = (output: string): readonly string[] => {
  const paths = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const literal = /^(.+?):\d+(?::|$)/u.exec(line);
      if (literal?.[1]?.startsWith('/')) {
        return [literal[1]];
      }
      return line.startsWith('/') && !line.includes(':') ? [line] : [];
    });
  return [...new Set(paths)].slice(0, 20);
};

const canonicalPath = (path: string): string => path.replace(/\/+$/u, '');

export const assertAllowedRepoSearchRoot = (
  requestedRoot: string,
  allowedRoots: readonly string[],
): void => {
  if (!allowedRoots.map(canonicalPath).includes(canonicalPath(requestedRoot))) {
    throw new Error(`repo-search root is not allowed: ${requestedRoot}`);
  }
};

export const capDetail = (text: string): string =>
  text.length > attemptDetailCap
    ? `${text.slice(0, attemptDetailCap)}\n...truncated ${text.length - attemptDetailCap} chars`
    : text;

const binaryEnvelopeParts = (
  target: string,
  routed: {
    readonly attempts: readonly SearchAttempt[];
    readonly found: boolean;
    readonly output: string;
  },
): Pick<RepoSearchEnvelope, 'attempts' | 'results' | 'source'> => ({
  attempts: routed.attempts,
  results: routed.found
    ? [{ detail: capDetail(routed.output), kind: 'binary', location: target, name: target }]
    : [],
  source: 'binary',
});

export const callAttempt = async (
  transport: RepoSearchTransport,
  call: RepoSearchBackendCall,
  strategy: string,
): Promise<{ readonly attempt: SearchAttempt; readonly result: RepoSearchBackendResult }> => {
  try {
    const result = await transport.call(call);
    return {
      attempt: {
        command: `${transport.kind}:${call.tool}`,
        detail: capDetail(
          result.isError
            ? (result.error ?? 'backend error')
            : capDetail(result.text) || 'backend answered',
        ),
        status: result.isError ? 'error' : 'found',
        strategy,
      },
      result,
    };
  } catch (error) {
    return {
      attempt: {
        command: `${transport.kind}:${call.tool}`,
        detail: error instanceof Error ? error.message : String(error),
        status: 'error',
        strategy,
      },
      result: { error: 'backend call failed', isError: true, text: '' },
    };
  }
};

const clusterResults = (code: ParsedSearchCode): readonly RepoSearchResult[] =>
  code.directories.slice(0, 5).map((directory) => ({
    detail: `${directory.hits} matches`,
    kind: 'cluster',
    location: directory.dir,
    name: directory.dir,
  }));

const connectStage = async (
  transport: RepoSearchTransport,
  project: string,
  query: string,
  rows: readonly ParsedRow[],
): Promise<{
  readonly attempts: readonly SearchAttempt[];
  readonly results: readonly RepoSearchResult[];
}> => {
  const tokens = query.split(/\s+/u).filter((token) => token.length >= 2);
  const qualifiedNames = [...new Set(rows.map((row) => row.qn))].slice(0, 2);
  if (tokens.length < 2 || qualifiedNames.length < 2) {
    return { attempts: [], results: [] };
  }
  const attempts: SearchAttempt[] = [];
  const details: string[] = [];
  for (const qualifiedName of qualifiedNames) {
    for (const direction of ['inbound', 'outbound'] as const) {
      const traced = await callAttempt(
        transport,
        backendCall('trace_path', {
          depth: 1,
          direction,
          function_name: qualifiedName,
          mode: 'calls',
          project,
        }),
        `connect:${direction}`,
      );
      attempts.push(traced.attempt);
      if (!traced.result.isError && traced.result.text.trim()) {
        details.push(`${qualifiedName} ${direction}:\n${traced.result.text.trim()}`);
      }
    }
  }
  if (details.length === 0) {
    return { attempts, results: [] };
  }
  return {
    attempts,
    results: [
      {
        detail: capDetail(details.join('\n\n')),
        kind: 'connection',
        location: null,
        name: qualifiedNames.join(' <-> '),
      },
    ],
  };
};

const containsPath = (parent: string, child: string): boolean =>
  child === parent || child.startsWith(`${parent}/`);

const filenameResults = (output: string): readonly RepoSearchResult[] =>
  output
    .split('\n')
    .filter((line) => line.startsWith('/') && !line.includes(':'))
    .slice(0, 20)
    .map((path) => ({ detail: null, kind: 'file' as const, location: path, name: path }));

const graphIdentityMatch = (row: ParsedRow, query: string): boolean => {
  const normalized = query.trim().toLowerCase();
  const tokens = normalized.split(/\s+/u).filter((token) => token.length >= 2);
  return [row.qn, row.file].some((field) => {
    const value = field.toLowerCase();
    return value.includes(normalized) || tokens.some((token) => value.includes(token));
  });
};

const indexRepositoryCall = (root: string, project: string): RepoSearchBackendCall =>
  backendCall('index_repository', { mode: 'full', name: project, repo_path: root }, 10 * 60_000);

const literalLineResults = (output: string): readonly RepoSearchResult[] =>
  output
    .split('\n')
    .flatMap((line) => {
      const match = /^(\/.+?):(\d+):(.*)$/u.exec(line);
      return match
        ? [
            {
              detail: match[3] ?? '',
              kind: 'location' as const,
              location: `${match[1]}:${match[2]}`,
              name: null,
            },
          ]
        : [];
    })
    .slice(0, 20);

const localFallback = async (
  executor: CommandExecutor,
  query: string,
  root: string,
  gateRunner: typeof runBinaryGate,
): Promise<{
  readonly attempts: readonly SearchAttempt[];
  readonly gateAttempts: readonly SearchAttempt[];
  readonly gateFound: boolean;
  readonly gateOutput: string;
  readonly results: readonly RepoSearchResult[];
}> => {
  const fallback = await stagedRgSearch(executor, root, query);
  const literal = literalLineResults(fallback.output);
  const results = literal.length > 0 ? literal : filenameResults(fallback.output);
  const gate = await gateRunner(executor, {
    candidates: binaryGateCandidates(fallback.output),
    query,
  });
  return {
    attempts: fallback.attempts,
    gateAttempts: gate.attempts,
    gateFound: gate.found,
    gateOutput: gate.output,
    results,
  };
};

const parsedRow = (tokens: readonly string[]): ParsedRow | undefined =>
  tokens.length >= 4
    ? { file: tokens[2] ?? '', lines: tokens[3] ?? '', qn: tokens[0] ?? '' }
    : undefined;

/** Parses the backend `index_status` key-value report. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the status parser keeps the indent, key, and value transitions explicit.
export const parseIndexStatus = (text: string): ParsedIndexStatus => {
  const values = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      const match = /^([a-z_]+):\s*(.*)$/u.exec(line.trim());
      if (match) {
        values.set(match[1] ?? '', match[2] ?? '');
      }
    }
  }
  return {
    indexedAt: values.get('indexed_at') ?? null,
    ready: values.get('status') === 'ready',
    rootPath: values.get('root_path') ?? null,
  };
};

/** The deterministic read-target classifier: url, pid, file, dotted symbol, process name. */
export const readTargetShape = (target: string): RepoSearchReadTargetShape => {
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return 'url';
  }
  if (/^\d+$/u.test(target)) {
    return 'pid';
  }
  if (target.startsWith('/')) {
    return 'file';
  }
  return target.includes('.') ? 'symbol' : 'process';
};

const redactAttempt = (attempt: SearchAttempt): SearchAttempt => ({
  ...attempt,
  command: redactBackendStorePaths(attempt.command),
  detail: redactBackendStorePaths(attempt.detail),
});

const redactResult = (result: RepoSearchResult): RepoSearchResult => ({
  ...result,
  detail: result.detail === null ? null : redactBackendStorePaths(result.detail),
  location: result.location === null ? null : redactBackendStorePaths(result.location),
  name: result.name === null ? null : redactBackendStorePaths(result.name),
});

/** Applies backend-store redaction to every text field of the unified response contract. */
export const redactEnvelope = (envelope: RepoSearchEnvelope): RepoSearchEnvelope => ({
  ...envelope,
  attempts: envelope.attempts.map(redactAttempt),
  reliability: {
    ...envelope.reliability,
    caveats: envelope.reliability.caveats.map(redactBackendStorePaths),
    note: redactBackendStorePaths(envelope.reliability.note),
  },
  results: envelope.results.map(redactResult),
});

/**
 * Resolves only an explicit repo-search root mapping. A shared parent directory is not
 * evidence that a child repository belongs to a parent index.
 */
export const repoSearchProjectForRoot = (
  projectRoot: string,
  projects: readonly RepoSearchProject[],
): string => {
  const requestedRoot = canonicalPath(projectRoot);
  const candidates = projects
    .flatMap((project) =>
      (project.rootPath ?? '')
        .split('\n')
        .filter((root) => root && containsPath(canonicalPath(root), requestedRoot))
        .map((root) => ({ name: project.name, root: canonicalPath(root) })),
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

const sectionRows = (
  text: string,
  section: 'directories' | 'projects' | 'results',
): readonly string[] => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim().startsWith(`${section}: `));
  if (start < 0) {
    return [];
  }
  const rows: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || /^[a-z_]+: /u.test(trimmed)) {
      break;
    }
    if (line.startsWith('  ')) {
      rows.push(trimmed);
    }
  }
  return rows;
};

export const skippedAttempt = (strategy: string, detail: string): SearchAttempt => ({
  command: strategy,
  detail,
  status: 'skipped',
  strategy,
});

const symbolResult = (row: ParsedRow): RepoSearchResult => ({
  detail: row.qn,
  kind: 'symbol',
  location: `${row.file}:${row.lines}`,
  name: row.qn,
});

const textFragmentResult = async (
  readFile: (path: string) => Promise<string | Buffer>,
  path: string,
  range?: RegExpExecArray | null,
): Promise<RepoSearchResult> => {
  const start = range ? Number(range[1]) : 1;
  const end = range?.[2] ? Number(range[2]) : start + fileFragmentCapLines - 1;
  const content = String(await readFile(path));
  const lines = content.split('\n');
  const from = Math.max(1, start);
  const to = Math.min(lines.length, Math.max(from, end));
  const fragment = lines
    .slice(from - 1, to)
    .map((line, offset) => `${from + offset}|${line}`)
    .join('\n');
  return {
    detail: capDetail(fragment),
    kind: 'text',
    location: `${path}:${from}-${to}`,
    name: path,
  };
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the tokenizer keeps the quote, space, and tail transitions explicit.
export const tokenizeBackendRow = (line: string): readonly string[] => {
  const tokens: string[] = [];
  let current = '';
  let quoted = false;
  for (const character of line.trim()) {
    if (character === '"') {
      quoted = !quoted;
    } else if (character === ' ' && !quoted) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += character;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
};

/** Parses the backend `list_projects` table. */
export const parseListProjects = (text: string): readonly RepoSearchProject[] =>
  sectionRows(text, 'projects')
    .map(tokenizeBackendRow)
    .flatMap((tokens) => {
      const name = tokens[0];
      if (!name) {
        return [];
      }
      return [{ branch: tokens[2] ?? null, name, rootPath: tokens[1] ?? null }];
    });

/** Parses the backend `search_code` result table and its directory cluster. */
export const parseSearchCode = (text: string): ParsedSearchCode => ({
  directories: sectionRows(text, 'directories')
    .map(tokenizeBackendRow)
    .flatMap((tokens) =>
      tokens.length >= 2 ? [{ dir: tokens[0] ?? '', hits: tokens[1] ?? '' }] : [],
    ),
  hasMore: /^has_more:\s*true$/mu.test(text),
  rows: sectionRows(text, 'results')
    .map(tokenizeBackendRow)
    .flatMap((tokens) => {
      const row = parsedRow(tokens);
      return row ? [row] : [];
    }),
});

/** Parses the backend `search_graph` result table. */
export const parseSearchGraph = (text: string): ParsedSearchGraph => ({
  hasMore: /^has_more:\s*true$/mu.test(text),
  rows: sectionRows(text, 'results')
    .map(tokenizeBackendRow)
    .flatMap((tokens) => {
      const row = parsedRow(tokens);
      return row ? [row] : [];
    }),
});

export const resolveRepoSearchIndex = async (
  transport: RepoSearchTransport,
  root: string,
): Promise<{ readonly attempt: SearchAttempt; readonly index: string | null }> => {
  const listed = await callAttempt(transport, backendCall('list_projects', {}), 'resolve-index');
  try {
    return {
      attempt: listed.attempt,
      index: repoSearchProjectForRoot(root, parseListProjects(listed.result.text)),
    };
  } catch (error) {
    return {
      attempt: {
        ...listed.attempt,
        detail: error instanceof Error ? error.message : String(error),
        status: 'error',
      },
      index: null,
    };
  }
};

export const transportKind = (
  transport: RepoSearchTransport | null,
): RepoSearchEnvelope['transport'] => transport?.kind ?? 'none';

/**
 * The deterministic search pipeline: resolve the index, run graph then code search,
 * connect traced symbols, and fall back to the staged local search plus the binary
 * content gate only when indexed discovery finds nothing.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: the pipeline receipt assembly is one deterministic stage list.
export const repoSearchDiscover = async (
  request: RepoSearchDiscoverRequest,
  gateRunner: typeof runBinaryGate = runBinaryGate,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the ordered pipeline keeps every indexed, connection, fallback, and gate transition explicit.
): Promise<RepoSearchEnvelope> => {
  assertAllowedRepoSearchRoot(request.root, request.allowedRoots);
  const query = request.query.trim();
  if (!query) {
    throw new Error('Search query is required.');
  }
  const privateKbLocal = request.discoveryMode === 'private-kb-local';
  const attempts: SearchAttempt[] = privateKbLocal || !request.probe ? [] : [request.probe];
  const caveats: string[] = [];
  let index: string | null = null;
  let indexedAt: string | null = null;
  let indexUsable = false;
  let results: RepoSearchResult[] = [];
  let source: RepoSearchEnvelope['source'] = 'none';
  if (privateKbLocal) {
    attempts.push(
      skippedAttempt(
        'resolve-index',
        'Skipped: private KB local-only mode searches the configured KB root directly.',
      ),
    );
  } else if (request.transport) {
    const listed = await callAttempt(
      request.transport,
      backendCall('list_projects', {}),
      'resolve-index',
    );
    attempts.push(listed.attempt);
    if (listed.attempt.status === 'error') {
      caveats.push('Backend project list unavailable; answered from the local staged fallback.');
    } else {
      try {
        index = repoSearchProjectForRoot(request.root, parseListProjects(listed.result.text));
      } catch (error) {
        caveats.push('No matching project index; answered from the local staged fallback.');
        attempts.push(
          skippedAttempt('resolve-index', error instanceof Error ? error.message : String(error)),
        );
      }
    }
    if (index) {
      const status = await callAttempt(
        request.transport,
        backendCall('index_status', { project: index }),
        'index-status',
      );
      attempts.push(status.attempt);
      const parsed = parseIndexStatus(status.result.text);
      if (status.attempt.status === 'error' || !parsed.ready) {
        caveats.push('Index not ready; answered from the local staged fallback.');
      } else {
        indexUsable = true;
        indexedAt = parsed.indexedAt;
      }
    }
  } else {
    caveats.push('No backend transport answered; answered from the local staged fallback.');
  }
  if (indexUsable && request.transport && index) {
    const graph = await callAttempt(
      request.transport,
      backendCall('search_graph', { limit: searchLimit, project: index, query }),
      'search-graph',
    );
    attempts.push(graph.attempt);
    const graphRows =
      graph.attempt.status === 'error'
        ? []
        : parseSearchGraph(graph.result.text).rows.filter((row) => graphIdentityMatch(row, query));
    if (graphRows.length > 0) {
      source = 'graph';
      results = graphRows.map(symbolResult);
      if (parseSearchGraph(graph.result.text).hasMore) {
        caveats.push('Graph results truncated by the search limit.');
      }
      caveats.push('The indexed snapshot may differ from the working tree.');
      attempts.push(skippedAttempt('search-code', 'Skipped because search-graph found a match.'));
      const connected = await connectStage(request.transport, index, query, graphRows);
      attempts.push(...connected.attempts);
      results.push(...connected.results);
    } else {
      const code = await callAttempt(
        request.transport,
        backendCall('search_code', {
          limit: searchLimit,
          mode: 'compact',
          pattern: query,
          project: index,
        }),
        'search-code',
      );
      attempts.push(code.attempt);
      const codeParsed =
        code.attempt.status === 'error' ? undefined : parseSearchCode(code.result.text);
      if (graph.attempt.status === 'error' && code.attempt.status === 'error') {
        caveats.push('Indexed discovery errored; answered from the local staged fallback.');
      }
      if (codeParsed && codeParsed.rows.length > 0) {
        source = 'code';
        results = codeParsed.rows.map(symbolResult);
        results.push(...clusterResults(codeParsed));
        if (codeParsed.hasMore) {
          caveats.push('Code results truncated by the search limit.');
        }
        caveats.push('The indexed snapshot may differ from the working tree.');
      }
    }
  }
  if (results.length > 0) {
    attempts.push(
      ...skippedRgAttempts(request.root, query, 'Skipped because indexed search found a match.'),
    );
  } else {
    const fallback = await localFallback(request.executor, query, request.root, gateRunner);
    attempts.push(...fallback.attempts, ...fallback.gateAttempts);
    if (fallback.gateFound) {
      source = 'binary';
      results = [
        { detail: capDetail(fallback.gateOutput), kind: 'binary', location: null, name: null },
        ...fallback.results,
      ];
    } else if (fallback.results.length > 0) {
      source = 'fallback';
      results = [...fallback.results];
    }
  }
  const found = results.length > 0;
  const next: string[] = results.some((result) => result.kind === 'symbol')
    ? ['read <approved-root> <qualified-name> for one snippet']
    : [];
  if (!found && !request.transport && !privateKbLocal) {
    next.push('Restore the backend transport for indexed discovery.');
  }
  return redactEnvelope({
    attempts,
    found,
    next,
    ok: true,
    query: { index, input: [query], root: request.root },
    reliability: {
      backend:
        request.transport && !privateKbLocal
          ? `codebase-memory-mcp via ${request.transport.kind}`
          : null,
      caveats,
      indexedAt,
      note: privateKbLocal
        ? 'Private KB local-only search.'
        : `${indexUsable ? `Index ${index} ready.` : 'No usable project index for this run.'}${
            request.indexHint ? ` (requested index: ${request.indexHint})` : ''
          }`,
    },
    results,
    source,
    status: found ? 'found' : 'empty',
    transport: privateKbLocal ? 'none' : transportKind(request.transport),
    verb: 'search',
  });
};

/**
 * The read pipeline: classifies the target deterministically, routes explicit URL, PID,
 * process, and binary file targets through the binary router, reads text file fragments
 * directly, and resolves dotted symbols through the ready-index discipline.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: the read keeps every classification and ready-index branch in one receipt.
export const repoSearchRead = async (
  request: RepoSearchReadRequest,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the target dispatch keeps every shape, index, and retry boundary explicit.
): Promise<RepoSearchEnvelope> => {
  assertAllowedRepoSearchRoot(request.root, request.allowedRoots);
  const headReader = request.headReader ?? defaultBinaryHeadReader;
  const target = request.target.trim();
  if (!target) {
    throw new Error('Read target is required.');
  }
  const shape = readTargetShape(target);
  const attempts: SearchAttempt[] = request.probe ? [request.probe] : [];
  if (shape === 'url' || shape === 'pid' || shape === 'process') {
    const routed = await runExplicitBinaryTarget(request.executor, {
      queries: request.queries,
      root: request.root,
      target,
    });
    const parts = binaryEnvelopeParts(target, routed);
    return redactEnvelope({
      attempts: [...attempts, ...parts.attempts],
      found: routed.found,
      next: [],
      ok: true,
      query: { index: null, input: [target, ...request.queries], root: request.root },
      reliability: {
        backend: 'binary router',
        caveats: [],
        indexedAt: null,
        note: `Explicit ${shape} target routed through the binary router.`,
      },
      results: parts.results,
      source: 'binary',
      status: routed.found ? 'found' : 'empty',
      transport: transportKind(request.transport),
      verb: 'read',
    });
  }
  if (shape === 'file') {
    const fileRoot = request.root.replace(/\/+$/u, '');
    if (!containsPath(fileRoot, target.replace(/\/+$/u, ''))) {
      throw new Error(`Read target is outside the approved root: ${target}`);
    }
    const range = /:(\d+)(?:-(\d+))?$/u.exec(target);
    const filePath = range ? target.slice(0, range.index) : target;
    const head = await headReader(filePath, 4096);
    if (head && !isBinaryContent(head)) {
      const result = await textFragmentResult(request.readFile, filePath, range);
      return redactEnvelope({
        attempts: [
          ...attempts,
          {
            command: `read ${result.location}`,
            detail: 'Bounded text fragment read from the working tree.',
            status: 'found',
            strategy: 'read:file',
          },
        ],
        found: true,
        next: [],
        ok: true,
        query: { index: null, input: [target], root: request.root },
        reliability: {
          backend: null,
          caveats: [],
          indexedAt: null,
          note: 'Direct bounded text read from the working tree.',
        },
        results: [result],
        source: 'file',
        status: 'found',
        transport: transportKind(request.transport),
        verb: 'read',
      });
    }
    const routed = await runExplicitBinaryTarget(request.executor, {
      headReader,
      queries: request.queries,
      root: request.root,
      target: filePath,
    });
    const parts = binaryEnvelopeParts(target, routed);
    return redactEnvelope({
      attempts: [...attempts, ...parts.attempts],
      found: routed.found,
      next: [],
      ok: true,
      query: { index: null, input: [target, ...request.queries], root: request.root },
      reliability: {
        backend: 'binary router',
        caveats: routed.found ? [] : ['No routed stage answered the target.'],
        indexedAt: null,
        note: 'Binary or bundle-shaped file target routed through the binary router.',
      },
      results: parts.results,
      source: 'binary',
      status: routed.found ? 'found' : 'empty',
      transport: transportKind(request.transport),
      verb: 'read',
    });
  }
  if (!request.transport) {
    return redactEnvelope({
      attempts: [
        ...attempts,
        skippedAttempt('read:symbol', 'A symbol read requires a backend transport.'),
      ],
      found: false,
      next: ['Restore the backend transport, then retry the symbol read.'],
      ok: false,
      query: { index: null, input: [target], root: request.root },
      reliability: {
        backend: null,
        caveats: ['No backend transport answered.'],
        indexedAt: null,
        note: 'Symbol reads need the backend transport.',
      },
      results: [],
      source: 'none',
      status: 'error',
      transport: 'none',
      verb: 'read',
    });
  }
  const listed = await callAttempt(
    request.transport,
    backendCall('list_projects', {}),
    'resolve-index',
  );
  attempts.push(listed.attempt);
  if (listed.attempt.status === 'error') {
    return redactEnvelope({
      attempts,
      found: false,
      next: [],
      ok: false,
      query: { index: null, input: [target], root: request.root },
      reliability: {
        backend: `codebase-memory-mcp via ${request.transport.kind}`,
        caveats: ['Backend project list unavailable.'],
        indexedAt: null,
        note: 'The symbol read could not resolve a project index.',
      },
      results: [],
      source: 'none',
      status: 'error',
      transport: transportKind(request.transport),
      verb: 'read',
    });
  }
  let index: string;
  try {
    index = repoSearchProjectForRoot(request.root, parseListProjects(listed.result.text));
  } catch (error) {
    return redactEnvelope({
      attempts: [
        ...attempts,
        skippedAttempt('resolve-index', error instanceof Error ? error.message : String(error)),
      ],
      found: false,
      next: [`search <approved-root> ${target} to locate the symbol first.`],
      ok: false,
      query: { index: null, input: [target], root: request.root },
      reliability: {
        backend: `codebase-memory-mcp via ${request.transport.kind}`,
        caveats: ['No matching project index for the symbol read.'],
        indexedAt: null,
        note: 'Index the intended project first.',
      },
      results: [],
      source: 'none',
      status: 'error',
      transport: transportKind(request.transport),
      verb: 'read',
    });
  }
  const status = await callAttempt(
    request.transport,
    backendCall('index_status', { project: index }),
    'index-status',
  );
  attempts.push(status.attempt);
  let statusText = status.result.text;
  if (status.attempt.status === 'error' || !parseIndexStatus(statusText).ready) {
    const indexing = await callAttempt(
      request.transport,
      indexRepositoryCall(request.root, index),
      'index-repository',
    );
    attempts.push(indexing.attempt);
    if (indexing.attempt.status === 'error') {
      return redactEnvelope({
        attempts,
        found: false,
        next: [],
        ok: false,
        query: { index, input: [target], root: request.root },
        reliability: {
          backend: `codebase-memory-mcp via ${request.transport.kind}`,
          caveats: [capDetail(indexing.attempt.detail)],
          indexedAt: null,
          note: 'Indexing the project failed.',
        },
        results: [],
        source: 'none',
        status: 'error',
        transport: transportKind(request.transport),
        verb: 'read',
      });
    }
    const rechecked = await callAttempt(
      request.transport,
      backendCall('index_status', { project: index }),
      'index-status',
    );
    attempts.push(rechecked.attempt);
    statusText = rechecked.result.text;
    if (rechecked.attempt.status === 'error' || !parseIndexStatus(statusText).ready) {
      return redactEnvelope({
        attempts,
        found: false,
        next: [],
        ok: false,
        query: { index, input: [target], root: request.root },
        reliability: {
          backend: `codebase-memory-mcp via ${request.transport.kind}`,
          caveats: ['Index not ready after indexing and the readiness re-check.'],
          indexedAt: null,
          note: 'The project index is not ready for a symbol read.',
        },
        results: [],
        source: 'none',
        status: 'error',
        transport: transportKind(request.transport),
        verb: 'read',
      });
    }
  }
  const snippet = await callAttempt(
    request.transport,
    backendCall('get_code_snippet', { project: index, qualified_name: target }),
    'read:symbol',
  );
  attempts.push(snippet.attempt);
  if (snippet.attempt.status === 'error' || snippet.result.isError) {
    return redactEnvelope({
      attempts,
      found: false,
      next: [`search <approved-root> ${target} to find the exact qualified name.`],
      ok: true,
      query: { index, input: [target], root: request.root },
      reliability: {
        backend: `codebase-memory-mcp via ${request.transport.kind}`,
        caveats: [capDetail(snippet.result.error ?? snippet.attempt.detail)],
        indexedAt: parseIndexStatus(statusText).indexedAt,
        note: 'The backend returned no snippet for the qualified name.',
      },
      results: [],
      source: 'none',
      status: 'empty',
      transport: transportKind(request.transport),
      verb: 'read',
    });
  }
  return redactEnvelope({
    attempts,
    found: true,
    next: [],
    ok: true,
    query: { index, input: [target], root: request.root },
    reliability: {
      backend: `codebase-memory-mcp via ${request.transport.kind}`,
      caveats: ['The indexed snapshot may differ from the working tree.'],
      indexedAt: parseIndexStatus(statusText).indexedAt,
      note: `Snippet read from index ${index}.`,
    },
    results: [
      {
        detail: capDetail(snippet.result.text),
        kind: 'symbol',
        location: null,
        name: target,
      },
    ],
    source: 'symbol',
    status: 'found',
    transport: transportKind(request.transport),
    verb: 'read',
  });
};

/**
 * One readiness check, then every declared independent read concurrently. The inspect
 * route never indexes; use the read route for deliberate index-and-retry reads.
 */
