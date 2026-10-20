import { tmpdir } from 'node:os';
import { runWhenMain as runCliWhenMain, runWhenMainWithHelp } from '../utils/cli.js';
import { nodeFileSystem, readText } from '../utils/filesystem.js';
import { bunExecutor, type CommandExecutor } from '../utils/process.js';
import {
  type RepoSearchEnvelope,
  repoSearchDiscover,
  repoSearchRead,
  resolveRepoSearchIndex,
} from '../utils/repo-search.js';
import {
  inspectRepoSearch,
  parseRepoSearchInspectionJsonl,
} from '../utils/repo-search-inspection.js';
import {
  probeRepoSearchTransport,
  type RepoSearchTransport,
} from '../utils/repo-search-transport.js';

export interface RepoSearchCliRequest {
  readonly queries: readonly string[];
  readonly requestPath?: string;
  readonly root: string;
  readonly target?: string;
  readonly verb: RepoSearchCliVerb;
}

export type RepoSearchCliVerb = 'inspect' | 'read' | 'search';

const verbs: readonly RepoSearchCliVerb[] = ['inspect', 'read', 'search'];

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

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/repo-search.ts [search] <absolute-root> <query...> '
  + '| read <absolute-root> <file-or-URL-or-PID-or-process-or-symbol> [query...] '
  + '| inspect <absolute-root> <absolute-jsonl-request-path-under-os-tempdir>';

export const parseRepoSearchArgs = (args: readonly string[]): RepoSearchCliRequest => {
  const rest = [...args];
  const first = rest[0];
  const verb = verbs.includes(first as RepoSearchCliVerb)
    ? (rest.shift() as RepoSearchCliVerb)
    : 'search';
  const root = rest.shift();
  if (!root?.startsWith('/')) {
    throw new Error(usage());
  }
  if (verb === 'inspect') {
    const requestPath = rest.shift();
    if (!requestPath || rest.length > 0) {
      throw new Error(usage());
    }
    return { queries: [], requestPath, root, verb };
  }
  if (verb === 'read') {
    const target = rest.shift();
    if (!target?.trim()) {
      throw new Error(usage());
    }
    return { queries: rest, root, target, verb };
  }
  const query = rest.join(' ').trim();
  if (!query) {
    throw new Error(usage());
  }
  return { queries: [query], root, verb };
};

export const run = async (
  args: readonly string[],
  write: (message: string) => void = console.log,
  read: (path: string) => Promise<string | Buffer> = readText.bind(undefined, nodeFileSystem),
  temporaryDirectory: string = tmpdir(),
  probe: typeof probeRepoSearchTransport = probeRepoSearchTransport,
  executor: CommandExecutor = bunExecutor,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the verb dispatch keeps every route, error envelope, and exit-code transition explicit.
): Promise<void> => {
  const request = parseRepoSearchArgs(args);
  const probed = await probe();
  const transport = probed.transport;
  try {
    let envelope: RepoSearchEnvelope;
    if (request.verb === 'inspect') {
      if (!transport) {
        throw new Error('Inspection reads require a backend transport.');
      }
      envelope = await runInspect(request, transport, probed.attempt, read, temporaryDirectory);
    } else if (request.verb === 'read') {
      envelope = await repoSearchRead({
        allowedRoots: [request.root],
        executor,
        probe: probed.attempt,
        queries: request.queries,
        readFile: read,
        root: request.root,
        target: request.target ?? '',
        transport,
      });
    } else {
      envelope = await repoSearchDiscover({
        allowedRoots: [request.root],
        executor,
        probe: probed.attempt,
        query: request.queries[0] ?? '',
        root: request.root,
        transport,
      });
    }
    write(JSON.stringify(envelope, null, 2));
    if (envelope.status === 'error') {
      process.exitCode = 1;
    }
  } catch (error) {
    write(
      JSON.stringify(
        errorEnvelope(error instanceof Error ? error.message : String(error), request, transport),
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await transport?.close();
  }
};

export const runWhenMain = runCliWhenMain;

void runWhenMainWithHelp(import.meta.main, Bun.argv.slice(2), usage, run);
