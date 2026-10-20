import {
  backendCall,
  callAttempt,
  capDetail,
  parseIndexStatus,
  type RepoSearchEnvelope,
  redactEnvelope,
  skippedAttempt,
  transportKind,
} from './repo-search.js';
import type { RepoSearchBackendCall, RepoSearchTransport } from './repo-search-transport.js';
import type { SearchAttempt } from './search-fallback.js';

type InspectionOperationReader = (record: Record<string, unknown>) => RepoSearchInspectionOperation;

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
  | { readonly limit: number; readonly operation: 'search-code'; readonly pattern: string };

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

const inspectionLabel = (operation: RepoSearchInspectionOperation): string => {
  switch (operation.operation) {
    case 'architecture':
      return `architecture(${operation.path || 'all'})`;
    case 'schema':
      return 'schema';
    case 'search-graph':
      return `search-graph(${operation.namePattern}, ${operation.label})`;
    case 'snippet':
      return `snippet(${operation.qualifiedName})`;
    case 'trace':
      return `trace(${operation.qualifiedName}, ${operation.direction}, ${operation.depth})`;
    default:
      return `search-code(${operation.pattern})`;
  }
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

/** Parses only script-local JSONL inspection requests. */
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

/** Renders one inspection operation as its backend call. */
export const repoSearchInspectionCall = (
  project: string,
  operation: RepoSearchInspectionOperation,
): RepoSearchBackendCall => {
  switch (operation.operation) {
    case 'architecture':
      return backendCall('get_architecture', { path: operation.path, project });
    case 'schema':
      return backendCall('get_graph_schema', { project });
    case 'search-graph':
      return backendCall('search_graph', {
        label: operation.label,
        limit: operation.limit,
        name_pattern: operation.namePattern,
        project,
      });
    case 'snippet':
      return backendCall('get_code_snippet', { project, qualified_name: operation.qualifiedName });
    case 'trace':
      return backendCall('trace_path', {
        depth: operation.depth,
        direction: operation.direction,
        function_name: operation.qualifiedName,
        mode: 'calls',
        project,
      });
    default:
      return backendCall('search_code', {
        limit: operation.limit,
        mode: 'compact',
        pattern: operation.pattern,
        project,
      });
  }
};

export const inspectRepoSearch = async (
  transport: RepoSearchTransport | null,
  root: { readonly index: string; readonly root: string },
  operations: readonly RepoSearchInspectionOperation[],
  probe?: SearchAttempt,
): Promise<RepoSearchEnvelope> => {
  const attempts: SearchAttempt[] = probe ? [probe] : [];
  if (!transport) {
    return redactEnvelope({
      attempts: [
        ...attempts,
        skippedAttempt('inspect', 'Inspection reads require a backend transport.'),
      ],
      found: false,
      next: ['Restore the backend transport, then retry the inspection.'],
      ok: false,
      query: { index: root.index, input: operations.map(inspectionLabel), root: root.root },
      reliability: {
        backend: null,
        caveats: ['No backend transport answered.'],
        indexedAt: null,
        note: 'Inspection reads need the backend transport.',
      },
      results: [],
      source: 'none',
      status: 'error',
      transport: 'none',
      verb: 'inspect',
    });
  }
  const status = await callAttempt(
    transport,
    backendCall('index_status', { project: root.index }),
    'index-status',
  );
  attempts.push(status.attempt);
  if (status.attempt.status === 'error' || !parseIndexStatus(status.result.text).ready) {
    return redactEnvelope({
      attempts,
      found: false,
      next: [],
      ok: false,
      query: { index: root.index, input: operations.map(inspectionLabel), root: root.root },
      reliability: {
        backend: `codebase-memory-mcp via ${transport.kind}`,
        caveats: ['Index not ready; inspection reads were not attempted.'],
        indexedAt: null,
        note: 'The project index is not ready.',
      },
      results: [],
      source: 'none',
      status: 'error',
      transport: transportKind(transport),
      verb: 'inspect',
    });
  }
  const entries = await Promise.all(
    operations.map(async (operation) => {
      const executed = await callAttempt(
        transport,
        repoSearchInspectionCall(root.index, operation),
        `inspect:${operation.operation}`,
      );
      return { executed, operation };
    }),
  );
  const results = entries.map(({ executed, operation }) => ({
    detail: capDetail(
      executed.result.isError ? (executed.result.error ?? 'backend error') : executed.result.text,
    ),
    kind: 'text' as const,
    location: null,
    name: inspectionLabel(operation),
  }));
  attempts.push(...entries.map(({ executed }) => executed.attempt));
  const found = entries.some(({ executed }) => !executed.result.isError);
  return redactEnvelope({
    attempts,
    found,
    next: [],
    ok: true,
    query: { index: root.index, input: operations.map(inspectionLabel), root: root.root },
    reliability: {
      backend: `codebase-memory-mcp via ${transport.kind}`,
      caveats: found
        ? ['The indexed snapshot may differ from the working tree.']
        : ['Every inspection read errored.'],
      indexedAt: parseIndexStatus(status.result.text).indexedAt,
      note: `Inspected index ${root.index}.`,
    },
    results,
    source: found ? 'graph' : 'none',
    status: found ? 'found' : 'error',
    transport: transportKind(transport),
    verb: 'inspect',
  });
};
