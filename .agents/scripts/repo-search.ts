import { tmpdir } from 'node:os';
import type { CommandBody, CommandDeclaration, ParsedInput } from '../utils/cli/declaration.js';
import { CliError, errorMessage } from '../utils/cli/errors.js';
import { runMain } from '../utils/cli/index.js';
import { UsageError } from '../utils/cli/usage-error.js';
import { nodeFileSystem, readText } from '../utils/filesystem.js';
import { bunExecutor, type CommandExecutor } from '../utils/process.js';
import {
  condenseRepoSearchEnvelope,
  type RepoSearchEnvelope,
  repoSearchDiscover,
  repoSearchRead,
  resolveRepoSearchIndex,
} from '../utils/repo-search/index.js';
import {
  inspectRepoSearch,
  parseRepoSearchInspectionJsonl,
} from '../utils/repo-search/inspection.js';
import {
  probeRepoSearchTransport,
  type RepoSearchTransport,
} from '../utils/repo-search/transport.js';

export interface RepoSearchCliRequest {
  readonly queries: readonly string[];
  readonly raw?: boolean;
  readonly requestPath?: string;
  readonly root: string;
  readonly target?: string;
  readonly verb: RepoSearchCliVerb;
  readonly verbose?: boolean;
}

export type RepoSearchCliVerb = 'inspect' | 'read' | 'search';

export interface RepoSearchDependencies {
  readonly executor: CommandExecutor;
  readonly probe: typeof probeRepoSearchTransport;
  readonly read: (path: string) => Promise<string | Buffer>;
  readonly temporaryDirectory: string;
}

const errorEnvelope = (
  message: string,
  request: RepoSearchCliRequest,
  transport: RepoSearchTransport | null,
): RepoSearchEnvelope => ({
  attempts: [],
  found: false,
  next: [],
  ok: false,
  query: { index: null, input: request.queries, root: request.root },
  reliability: {
    backend: null,
    caveats: [message],
    indexedAt: null,
    note: 'The wrapper rejected the request.',
  },
  results: [],
  source: 'none',
  status: 'error',
  transport: transport?.kind ?? 'none',
  verb: request.verb,
});

const isTemporaryRequestPath = (requestPath: string, temporaryDirectory: string): boolean =>
  requestPath.startsWith(`${temporaryDirectory.replace(/\/+$/u, '')}/`);

const runInspect = async (
  request: RepoSearchCliRequest,
  transport: RepoSearchTransport,
  probeAttempt: Parameters<typeof inspectRepoSearch>[3],
  read: (path: string) => Promise<string | Buffer>,
  temporaryDirectory: string,
): Promise<RepoSearchEnvelope> => {
  const requestPath = request.requestPath ?? '';
  if (!isTemporaryRequestPath(requestPath, temporaryDirectory)) {
    throw new Error(
      'inspect requires an absolute JSONL request path under the OS temporary directory.',
    );
  }
  const operations = parseRepoSearchInspectionJsonl(String(await read(requestPath)));
  const resolved = await resolveRepoSearchIndex(transport, request.root);
  if (!resolved.index) {
    return {
      attempts: [resolved.attempt],
      found: false,
      next: [],
      ok: false,
      query: {
        index: null,
        input: operations.map((operation) => operation.operation),
        root: request.root,
      },
      reliability: {
        backend: `codebase-memory-mcp via ${transport.kind}`,
        caveats: [resolved.attempt.detail],
        indexedAt: null,
        note: 'No matching project index for the inspection.',
      },
      results: [],
      source: 'none',
      status: 'error',
      transport: transport.kind,
      verb: 'inspect',
    };
  }
  return inspectRepoSearch(
    transport,
    { index: resolved.index, root: request.root },
    operations,
    probeAttempt,
  );
};

const dispatch = async (
  request: RepoSearchCliRequest,
  transport: RepoSearchTransport | null,
  probed: Awaited<ReturnType<typeof probeRepoSearchTransport>>,
  dependencies: RepoSearchDependencies,
): Promise<RepoSearchEnvelope> => {
  if (request.verb === 'inspect') {
    if (!transport) {
      throw new Error('Inspection reads require a backend transport.');
    }
    return runInspect(
      request,
      transport,
      probed.attempt,
      dependencies.read,
      dependencies.temporaryDirectory,
    );
  }
  if (request.verb === 'read') {
    return repoSearchRead({
      allowedRoots: [request.root],
      executor: dependencies.executor,
      probe: probed.attempt,
      queries: request.queries,
      readFile: dependencies.read,
      root: request.root,
      target: request.target ?? '',
      transport,
    });
  }
  return repoSearchDiscover({
    allowedRoots: [request.root],
    executor: dependencies.executor,
    probe: probed.attempt,
    query: request.queries[0] ?? '',
    raw: request.raw,
    root: request.root,
    transport,
  });
};

export const executeRepoSearch = async (
  request: RepoSearchCliRequest,
  dependencies: RepoSearchDependencies,
): Promise<{ readonly envelope: RepoSearchEnvelope; readonly failed: boolean }> => {
  const probed = await dependencies.probe();
  const transport = probed.transport;
  try {
    const envelope = await dispatch(request, transport, probed, dependencies);
    return { envelope, failed: envelope.status === 'error' };
  } catch (error) {
    return {
      envelope: errorEnvelope(errorMessage(error), request, transport),
      failed: true,
    };
  } finally {
    await transport?.close();
  }
};

const defaultDependencies: RepoSearchDependencies = {
  executor: bunExecutor,
  probe: probeRepoSearchTransport,
  read: readText.bind(undefined, nodeFileSystem),
  temporaryDirectory: tmpdir(),
};

const repoSearchBody = (
  verb: RepoSearchCliVerb,
  summary: string,
  positionals: string,
  arity: readonly [number, number],
  options: CommandBody<unknown>['options'],
  toRequest: (input: ParsedInput) => RepoSearchCliRequest,
  dependencies: RepoSearchDependencies,
): CommandBody<unknown> => ({
  arity,
  options,
  positionals,
  renderText: (data) => JSON.stringify(data, null, 2),
  run: async (input) => {
    const request = toRequest(input);
    const { envelope, failed } = await executeRepoSearch(request, dependencies);
    const printed = request.verbose === true ? envelope : condenseRepoSearchEnvelope(envelope);
    if (failed) {
      throw new CliError(`repo-search ${verb} failed.`, 1, printed);
    }
    return printed;
  },
  summary,
});

const requireAbsoluteRoot = (root: string): string => {
  if (!root.startsWith('/')) {
    throw new UsageError('The repository root must be an absolute path.');
  }
  return root;
};

const verboseOption = {
  verbose: {
    description: 'Print the full envelope instead of the condensed one.',
    type: 'boolean',
  },
} as const;

export const createCommand = (
  overrides: Partial<RepoSearchDependencies> = {},
): CommandDeclaration<unknown> => {
  const dependencies = { ...defaultDependencies, ...overrides };
  const flags = (input: ParsedInput) => (input.values.verbose === true ? { verbose: true } : {});
  return {
    commands: {
      inspect: repoSearchBody(
        'inspect',
        'Run several independent indexed reads declared in one JSONL request file.',
        '<absolute-root> <absolute-jsonl-request-path-under-os-tempdir>',
        [2, 2],
        verboseOption,
        (input) => ({
          queries: [],
          requestPath: input.positionals[1],
          root: requireAbsoluteRoot(input.positionals[0] ?? ''),
          verb: 'inspect',
          ...flags(input),
        }),
        dependencies,
      ),
      read: repoSearchBody(
        'read',
        'Read one file fragment, symbol snippet, URL, PID, or process target.',
        '<absolute-root> <file-or-URL-or-PID-or-process-or-symbol> [query...]',
        [2, Number.POSITIVE_INFINITY],
        verboseOption,
        (input) => {
          const [root = '', target = '', ...queries] = input.positionals;
          if (!target.trim()) {
            throw new UsageError('read needs a non-empty target.');
          }
          return {
            queries,
            root: requireAbsoluteRoot(root),
            target,
            verb: 'read',
            ...flags(input),
          };
        },
        dependencies,
      ),
      search: repoSearchBody(
        'search',
        'Search code, symbols, call paths, architecture, or literal text (the default command).',
        '<absolute-root> <query...>',
        [2, Number.POSITIVE_INFINITY],
        {
          raw: { description: 'Return the raw backend answer.', type: 'boolean' },
          ...verboseOption,
        },
        (input) => {
          const [root = '', ...words] = input.positionals;
          const query = words.join(' ').trim();
          if (!query) {
            throw new UsageError('search needs a non-empty query.');
          }
          return {
            queries: [query],
            root: requireAbsoluteRoot(root),
            verb: 'search',
            ...(input.values.raw === true ? { raw: true } : {}),
            ...flags(input),
          };
        },
        dependencies,
      ),
    },
    defaultCommand: 'search',
    script: 'scripts/repo-search.ts',
    summary:
      'Caller-facing repository discovery; pass a query that starts with a dash after a -- separator.',
  };
};

export const command = createCommand();

void runMain(command, import.meta.main);
