import { mkdir, rename, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import tls from 'node:tls';

export interface ChatMessage {
  readonly content: string;
  readonly role: 'system' | 'user';
}

export interface FetchedFile {
  readonly oid: string;
  readonly path: string;
  readonly sha256?: string;
  readonly size: number;
}

type FetchFunction = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

type GpuEntry = { readonly requestAdapter: () => Promise<unknown> };

export interface LocalFile {
  readonly body: (start?: number, end?: number) => BodyInit;
  readonly size: number;
}

export interface ModelHandle {
  readonly dispose?: () => Promise<void> | void;
  readonly encodePrompt: (messages: readonly ChatMessage[]) => readonly number[];
  readonly generate: (
    messages: readonly ChatMessage[],
    options: { readonly maxNewTokens: number },
  ) => AsyncIterable<{ readonly text: string }>;
  readonly warmup: () => Promise<void>;
}

type ModelLoader = {
  readonly load: (
    repository: null,
    options: { readonly fetch: FetchFunction },
  ) => Promise<ModelHandle>;
};

export interface Provenance {
  readonly blobs: readonly string[];
  readonly bundleSha256: string;
  readonly modelRevision: string;
}

interface QueryTiming {
  readonly firstTokenMs: number;
  readonly totalMs: number;
}

export interface ReaderBundle {
  readonly document: string;
  readonly instructions: string;
  // Present for a skill-router bundle: the catalog names an answer must come from.
  readonly names?: readonly string[];
  readonly prompts: readonly ReaderPrompt[];
}

export interface ReaderDependencies {
  readonly assignGlobals: (globals: object) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly exists: (path: string) => Promise<boolean>;
  readonly fetch: FetchFunction;
  readonly hashFile: (path: string, algorithm: 'git-sha1' | 'sha256') => Promise<string>;
  readonly hashText: (text: string) => string;
  readonly home: string;
  readonly importSource: (source: string) => Promise<{ readonly Gemma4Mobile: ModelLoader }>;
  readonly importWebgpu: () => Promise<WebgpuModule>;
  readonly installNavigatorGpu: (gpu: GpuEntry) => void;
  readonly log: (message: string) => void;
  readonly mkdir: (path: string) => Promise<void>;
  readonly now: () => number;
  readonly openLocalFile: (path: string) => Promise<LocalFile | undefined>;
  readonly readText: (path: string) => Promise<string>;
  readonly readVendoredBundle: () => Promise<string>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly symlink: (target: string, link: string) => Promise<void>;
  readonly writeBody: (path: string, body: Response) => Promise<void>;
  readonly writeText: (path: string, content: string) => Promise<void>;
}

export interface ReaderFailure {
  readonly expected: string;
  readonly given: string;
  readonly id: string;
  readonly query: string;
}

export interface ReaderPrompt {
  readonly query: string;
  readonly query_id: string;
  readonly run: number;
}

interface RepoPlan {
  readonly files: readonly FetchedFile[];
  readonly id: string;
  readonly sha: string;
}

interface TreeEntry {
  readonly lfs?: { readonly oid: string };
  readonly oid: string;
  readonly path: string;
  readonly size: number;
  readonly type: string;
}

type WeakReaderRunner = typeof run;

type WebgpuModule = {
  readonly create: (options: string[]) => GpuEntry;
  readonly globals: object;
};

export const EXIT_CODES = {
  answered: 0,
  failure: 1,
  integrity: 3,
  missingDependency: 4,
  noAdapter: 2,
  tooLong: 5,
};

export const MODEL_ID = 'google/gemma-4-E2B-it-qat-mobile-transformers';
export const MAX_NEW_TOKENS = 8;
export const ROUTER_MAX_NEW_TOKENS = 24;
// Bump when the router prompt shape or answer parsing changes; activation receipts record it.
export const ROUTER_VERSION = 'router-v1';
export const NO_ANSWER = 'NONE';
export const NO_SKILL_ANSWER = 'NO_SKILL';
export const UNPARSEABLE_ROUTE = 'UNPARSEABLE';
// Pinned so every machine reads the same weights; the instruction gate records this in its receipts.
export const MODEL_REVISION =
  // biome-ignore lint/security/noSecrets: a public git revision, not a secret
  'dd693ff40353f057ca5f07e945ad867f4afbf2ec';
// Bump when scored prompts or decoding options change; suggestion diagnostics do not affect scores.
export const READER_VERSION = 'reader-v1';
export const SUGGEST_MAX_NEW_TOKENS = 260;
export const SUGGEST_INSTRUCTIONS =
  'You are diagnosing a failed reading question. Use only the document below; do not add facts.';
export const MAX_CONTEXT_TOKENS = 131072;
export const MIN_CONTEXT_TOKENS = 8192;
export const PLAN_FILE = 'weak-reader-plan.json';
// sha256 of vendor/gemma-4-e2b/gemma-4-e2b.js.gz after decompression; see its README.md.
export const VENDORED_BUNDLE_SHA256 =
  // biome-ignore lint/security/noSecrets: a public content hash, not a secret
  '12fe95ea0c606d8aee70337f472289c17feb098f966de6a4c0a9f4da9f63f40a';
export const VENDORED_BUNDLE_PATH = path.join('vendor', 'gemma-4-e2b', 'gemma-4-e2b.js.gz');
export const KV_CAPACITY_GLOBAL = '__weakReaderKvCapacity';

const HUB = 'https://huggingface.co';

export class ReaderError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

export const buildMessages = (
  instructions: string,
  document: string,
  query: string,
): readonly ChatMessage[] => [
  { content: `${instructions}\n\nDocument:\n${document}`, role: 'system' },
  { content: query, role: 'user' },
];

export const cacheRootOf = (
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string => path.join(env.HF_HOME ?? path.join(home, '.cache', 'huggingface'), 'hub');

const catalogDocument = (catalog: readonly { description: string; name: string }[]): string =>
  `Skill catalog:\n${catalog.map(({ description, name }) => `- ${name}: ${description}`).join('\n')}`;

const completeText = async (
  model: ModelHandle,
  messages: readonly ChatMessage[],
  maxNewTokens: number,
): Promise<string> => {
  let text = '';
  for await (const chunk of model.generate(messages, { maxNewTokens })) {
    text = chunk.text;
  }
  return text.trim();
};

export const createLocalFetch =
  (snapshotDir: string, openLocalFile: ReaderDependencies['openLocalFile']): FetchFunction =>
  async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    const match = new URL(request.url).pathname.match(/\/resolve\/[^/]+\/(.+)$/u);
    const local = match?.[1]
      ? await openLocalFile(path.join(snapshotDir, decodeURIComponent(match[1])))
      : undefined;
    if (!local) {
      return new Response('not found', { status: 404 });
    }
    const headers: Record<string, string> = { 'accept-ranges': 'bytes', etag: '"local"' };
    const range = request.headers.get('range')?.match(/bytes=(\d+)-(\d*)/u);
    if (request.method === 'HEAD') {
      return new Response(null, { headers: { ...headers, 'content-length': String(local.size) } });
    }
    if (!range) {
      return new Response(local.body(), {
        headers: { ...headers, 'content-length': String(local.size) },
      });
    }
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : local.size - 1;
    return new Response(local.body(start, end + 1), {
      headers: {
        ...headers,
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${local.size}`,
      },
      status: 206,
    });
  };

const detailOf = (error: unknown): string =>
  error instanceof Error ? `${error.name} ${error.message}` : String(error);

const escapeForPattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const fileOf = (entry: TreeEntry): FetchedFile => ({
  oid: entry.oid,
  path: entry.path,
  ...(entry.lfs ? { sha256: entry.lfs.oid } : {}),
  size: entry.size,
});

export const installGpu = async (deps: ReaderDependencies): Promise<void> => {
  let webgpu: WebgpuModule;
  try {
    webgpu = await deps.importWebgpu();
  } catch {
    throw new ReaderError(
      'The webgpu package is missing; run `bun add webgpu` in the agents root.',
      EXIT_CODES.missingDependency,
    );
  }
  deps.assignGlobals(webgpu.globals);
  const gpu = webgpu.create([]);
  const adapter = await gpu.requestAdapter().catch(() => null);
  if (!adapter) {
    throw new ReaderError(
      'No GPU adapter is available; this process is probably sandboxed. Run this one command outside the sandbox.',
      EXIT_CODES.noAdapter,
    );
  }
  deps.installNavigatorGpu(gpu);
};

const isCatalog = (value: unknown): value is readonly { description: string; name: string }[] =>
  Array.isArray(value)
  && value.length > 0
  && value.every(
    (entry: { description?: unknown; name?: unknown } | null) =>
      typeof entry?.name === 'string' && typeof entry.description === 'string',
  );

export const isCertificateError = (error: unknown): boolean =>
  /cert|issuer|self.signed/iu.test(detailOf(error));

export const createRetryingFetch =
  (baseFetch: FetchFunction, loadCa: () => readonly string[]): FetchFunction =>
  async (input, init) => {
    try {
      return await baseFetch(input, init);
    } catch (error) {
      if (!isCertificateError(error)) {
        throw error;
      }
      return baseFetch(input, { ...init, tls: { ca: loadCa() } } as RequestInit);
    }
  };

export const kvCapacityFor = (bundle: ReaderBundle): number => {
  const longestQuery = Math.max(0, ...bundle.prompts.map(({ query }) => query.length));
  const characters = bundle.instructions.length + bundle.document.length + longestQuery;
  const tokens = Math.ceil(characters / 2.5) + 512;
  return Math.min(
    MAX_CONTEXT_TOKENS,
    Math.max(MIN_CONTEXT_TOKENS, Math.ceil(tokens / 1024) * 1024),
  );
};

const linkIntoSnapshot = async (
  deps: ReaderDependencies,
  snapshotDir: string,
  blobName: string,
  file: FetchedFile,
): Promise<void> => {
  const link = path.join(snapshotDir, file.path);
  if (await deps.exists(link)) {
    return;
  }
  await deps.mkdir(path.dirname(link));
  await deps.symlink(
    path.relative(path.dirname(link), path.join(snapshotDir, '..', '..', 'blobs', blobName)),
    link,
  );
};

const loadModel = async (
  deps: ReaderDependencies,
  snapshotDir: string,
  bundle: ReaderBundle,
): Promise<ModelHandle> => {
  const source = await deps.readVendoredBundle();
  if (deps.hashText(source) !== VENDORED_BUNDLE_SHA256) {
    throw new ReaderError(
      `The vendored runtime bundle does not match its pinned sha256; restore ${VENDORED_BUNDLE_PATH}.`,
      EXIT_CODES.integrity,
    );
  }
  const capacity = kvCapacityFor(bundle);
  deps.assignGlobals({ [KV_CAPACITY_GLOBAL]: capacity });
  const { Gemma4Mobile } = await deps.importSource(source);
  const model = await Gemma4Mobile.load(null, {
    fetch: createLocalFetch(snapshotDir, deps.openLocalFile),
  });
  const longestQuery = bundle.prompts.reduce(
    (longest, { query }) => (query.length > longest.length ? query : longest),
    '',
  );
  const needed =
    model.encodePrompt(buildMessages(bundle.instructions, bundle.document, longestQuery)).length
    + MAX_NEW_TOKENS;
  if (needed > capacity) {
    await model.dispose?.();
    throw new ReaderError(
      `The document needs ${needed} tokens but the context capacity is ${capacity} (model limit ${MAX_CONTEXT_TOKENS}).`,
      EXIT_CODES.tooLong,
    );
  }
  deps.log(`context ${needed} of ${capacity} tokens`);
  return model;
};

export const mapNetworkError = (error: unknown, url: string): ReaderError => {
  const host = new URL(url).host;
  if (isCertificateError(error)) {
    return new ReaderError(
      `Certificate failure reaching ${host} even with the system trust store; set NODE_EXTRA_CA_CERTS to the CA bundle.`,
      EXIT_CODES.failure,
    );
  }
  return new ReaderError(`Network failure reaching ${host}.`, EXIT_CODES.failure);
};

const downloadBlob = async (
  deps: ReaderDependencies,
  url: string,
  blobPath: string,
): Promise<void> => {
  let response: Response;
  try {
    response = await deps.fetch(url);
  } catch (error) {
    throw mapNetworkError(error, url);
  }
  if (!response.ok) {
    throw new ReaderError(
      `Download from ${new URL(url).host} failed with status ${response.status}.`,
      EXIT_CODES.failure,
    );
  }
  await deps.writeBody(`${blobPath}.incomplete`, response);
};

const getJson = async <Value>(
  fetcher: FetchFunction,
  url: string,
  fetchOptions?: RequestInit,
): Promise<Value> => {
  let response: Response;
  try {
    response = await fetcher(url, fetchOptions);
  } catch (error) {
    throw mapNetworkError(error, url);
  }
  if (!response.ok) {
    throw new ReaderError(
      `Request to ${new URL(url).host} failed with status ${response.status}.`,
      EXIT_CODES.failure,
    );
  }
  return (await response.json()) as Value;
};

export const parseAnswer = (reply: string): string =>
  reply.match(/(?<![A-Za-z])([A-F])(?![A-Za-z])/u)?.[1] ?? '';

export const parseBundle = (content: string, sourcePath: string): ReaderBundle => {
  let parsed: (Partial<ReaderBundle> & { catalog?: unknown }) | null;
  try {
    parsed = JSON.parse(content) as (Partial<ReaderBundle> & { catalog?: unknown }) | null;
  } catch {
    throw new ReaderError(`${sourcePath} is not valid JSON.`, EXIT_CODES.failure);
  }
  if (typeof parsed?.instructions !== 'string' || !Array.isArray(parsed.prompts)) {
    throw new ReaderError(
      `${sourcePath} is not a document or router bundle with instructions and prompts.`,
      EXIT_CODES.failure,
    );
  }
  if (isCatalog(parsed.catalog)) {
    return {
      document: catalogDocument(parsed.catalog),
      instructions: parsed.instructions,
      names: parsed.catalog.map(({ name }) => name),
      prompts: parsed.prompts,
    };
  }
  if (typeof parsed.document !== 'string') {
    throw new ReaderError(
      `${sourcePath} is not a document or router bundle with a document or a catalog.`,
      EXIT_CODES.failure,
    );
  }
  return { document: parsed.document, instructions: parsed.instructions, prompts: parsed.prompts };
};

export const parseFailures = (content: string, sourcePath: string): readonly ReaderFailure[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ReaderError(`${sourcePath} is not valid JSON.`, EXIT_CODES.failure);
  }
  const valid =
    Array.isArray(parsed)
    && parsed.every((entry: Partial<ReaderFailure> | null) =>
      ['expected', 'given', 'id', 'query'].every(
        (key) => typeof entry?.[key as keyof ReaderFailure] === 'string',
      ),
    );
  if (!valid) {
    throw new ReaderError(
      `${sourcePath} must be an array of objects with id, query, expected, and given.`,
      EXIT_CODES.failure,
    );
  }
  return parsed as readonly ReaderFailure[];
};

const planFromManifest = (content: string): RepoPlan => {
  const plan = JSON.parse(content) as Partial<RepoPlan>;
  if (typeof plan.sha !== 'string' || !Array.isArray(plan.files)) {
    throw new Error('Invalid plan manifest.');
  }
  return plan as RepoPlan;
};

const planOf = async (
  deps: ReaderDependencies,
  id: string,
  wanted: (entryPath: string) => boolean,
): Promise<RepoPlan> => {
  const tree = await getJson<readonly TreeEntry[]>(
    deps.fetch,
    `${HUB}/api/models/${id}/tree/${MODEL_REVISION}?recursive=true`,
  );
  return {
    files: tree
      .filter(({ path: entryPath, type }) => type === 'file' && wanted(entryPath))
      .map(fileOf),
    id,
    sha: MODEL_REVISION,
  };
};

const repoDirOf = (cacheRoot: string, id: string): string =>
  path.join(cacheRoot, `models--${id.replace('/', '--')}`);

// The first run records the revision and file list; later runs reuse them with no network call,
// so a cached run works offline and every run reads the same pinned files.
const loadPlan = async (
  deps: ReaderDependencies,
  cacheRoot: string,
  id: string,
  wanted: (entryPath: string) => boolean,
): Promise<RepoPlan> => {
  const manifestPath = path.join(repoDirOf(cacheRoot, id), PLAN_FILE);
  if (await deps.exists(manifestPath)) {
    try {
      return planFromManifest(await deps.readText(manifestPath));
    } catch {
      deps.log(`ignoring an unreadable ${PLAN_FILE}; fetching a fresh plan`);
    }
  }
  const plan = await planOf(deps, id, wanted);
  await deps.mkdir(path.dirname(manifestPath));
  await deps.writeText(manifestPath, JSON.stringify(plan));
  return plan;
};

const secondsOf = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(3)} s`;

// Separators are interchangeable and case is ignored: a small model that answers "review_changes"
// chose review-changes, so a formatting slip is not counted as a wrong routing choice.
const separatorPattern = (name: string): string =>
  name.split(/[-_ ]/u).map(escapeForPattern).join('[-_ ]');

// The earliest catalog name (or NO_SKILL) that appears as a whole token in the reply.
export const parseSkillName = (reply: string, names: readonly string[]): string => {
  const candidates = [...names, NO_SKILL_ANSWER].flatMap((name) => {
    const found = new RegExp(`(?<![\\w-])${separatorPattern(name)}(?![\\w-])`, 'iu').exec(reply);
    return found ? [{ at: found.index, name }] : [];
  });
  candidates.sort((left, right) => left.at - right.at || right.name.length - left.name.length);
  return candidates[0]?.name ?? UNPARSEABLE_ROUTE;
};

const answerQuery = async (
  model: ModelHandle,
  bundle: ReaderBundle,
  query: string,
  now: () => number,
): Promise<{ readonly letter: string; readonly raw: string; readonly timing: QueryTiming }> => {
  const started = now();
  let firstTokenMs: number | undefined;
  let text = '';
  for await (const chunk of model.generate(
    buildMessages(bundle.instructions, bundle.document, query),
    { maxNewTokens: bundle.names ? ROUTER_MAX_NEW_TOKENS : MAX_NEW_TOKENS },
  )) {
    firstTokenMs ??= now() - started;
    text = chunk.text;
  }
  const totalMs = now() - started;
  const letter = bundle.names ? parseSkillName(text, bundle.names) : parseAnswer(text);
  return { letter, raw: text, timing: { firstTokenMs: firstTokenMs ?? totalMs, totalMs } };
};

// Decoding is greedy, so every run of one query yields the same reply: ask each query once.
const answerAll = async (
  model: ModelHandle,
  bundle: ReaderBundle,
  deps: ReaderDependencies,
): Promise<{ readonly lines: readonly string[]; readonly timings: readonly QueryTiming[] }> => {
  const letters = new Map<string, string>();
  const timings: QueryTiming[] = [];
  const lines: string[] = [];
  for (const prompt of bundle.prompts) {
    if (!letters.has(prompt.query)) {
      const answered = await answerQuery(model, bundle, prompt.query, deps.now);
      letters.set(prompt.query, answered.letter);
      if (!answered.letter || answered.letter === UNPARSEABLE_ROUTE) {
        deps.log(
          `unparseable reply for ${JSON.stringify(prompt.query.slice(0, 50))}: ${JSON.stringify(answered.raw.slice(0, 120))}`,
        );
      }
      timings.push(answered.timing);
      deps.log(
        `query ${timings.length}: first token ${secondsOf(answered.timing.firstTokenMs)}, total ${secondsOf(answered.timing.totalMs)}`,
      );
    }
    lines.push(
      JSON.stringify({
        [bundle.names ? 'skill_name' : 'answer']: letters.get(prompt.query) || NO_ANSWER,
        query_id: prompt.query_id,
        run: prompt.run,
      }),
    );
  }
  return { lines, timings };
};

export const suggestionMessages = (
  document: string,
  failure: ReaderFailure,
): readonly ChatMessage[] => [
  { content: `${SUGGEST_INSTRUCTIONS}\n\nDocument:\n${document}`, role: 'system' },
  {
    content: `Question:\n${failure.query}

You answered ${failure.given}. The correct answer is ${failure.expected}.
Quote the shortest sentence that supports the correct answer. State whether the issue is wording
or placement.
Give the smallest local repair that makes ${failure.expected} obvious. Preserve all other rules
and meaning.
If the sentence is already correct but buried in a paragraph, keep its wording and recommend
making it its own paragraph.
Otherwise give one short replacement sentence. Do not rewrite surrounding text.`,
    role: 'user',
  },
];

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/weak-reader.ts <absolute-bundle-json-path> <absolute-answers-jsonl-path>; '
  + 'bun <agents-root>/scripts/weak-reader.ts suggest <absolute-bundle-json-path> '
  + '<absolute-failures-json-path> <absolute-suggestions-jsonl-path>; '
  + 'exit codes: 0 answered, 1 failure, 2 no GPU adapter, 3 integrity failure, '
  + '4 missing webgpu package, 5 document too long.';

const verifyBlob = async (
  deps: ReaderDependencies,
  file: FetchedFile,
  candidate: string,
): Promise<boolean> => {
  const local = await deps.openLocalFile(candidate);
  if (local?.size !== file.size) {
    return false;
  }
  if (file.sha256 !== undefined) {
    return (await deps.hashFile(candidate, 'sha256')) === file.sha256;
  }
  return (await deps.hashFile(candidate, 'git-sha1')) === file.oid;
};

const ensureBlob = async (
  deps: ReaderDependencies,
  file: FetchedFile,
  blobPath: string,
  url: string,
): Promise<void> => {
  if (await deps.exists(blobPath)) {
    if (await verifyBlob(deps, file, blobPath)) {
      return;
    }
    throw new ReaderError(
      `Cached blob for ${file.path} failed its integrity check.`,
      EXIT_CODES.integrity,
    );
  }
  await downloadBlob(deps, url, blobPath);
  if (!(await verifyBlob(deps, file, `${blobPath}.incomplete`))) {
    throw new ReaderError(
      `Downloaded ${file.path} failed its integrity check.`,
      EXIT_CODES.integrity,
    );
  }
  await deps.rename(`${blobPath}.incomplete`, blobPath);
};

const syncRepo = async (
  deps: ReaderDependencies,
  cacheRoot: string,
  plan: RepoPlan,
): Promise<{ readonly blobs: readonly string[]; readonly snapshotDir: string }> => {
  const repoDir = repoDirOf(cacheRoot, plan.id);
  const snapshotDir = path.join(repoDir, 'snapshots', plan.sha);
  await deps.mkdir(path.join(repoDir, 'blobs'));
  await deps.mkdir(path.join(repoDir, 'refs'));
  await deps.mkdir(snapshotDir);
  await deps.writeText(path.join(repoDir, 'refs', 'main'), plan.sha);
  const urlBase = `${HUB}/${plan.id}/resolve/${plan.sha}`;
  const blobs: string[] = [];
  for (const file of plan.files) {
    const blobName = file.sha256 ?? file.oid;
    await ensureBlob(deps, file, path.join(repoDir, 'blobs', blobName), `${urlBase}/${file.path}`);
    await linkIntoSnapshot(deps, snapshotDir, blobName, file);
    blobs.push(`${file.path}:${blobName}`);
  }
  return { blobs, snapshotDir };
};

export const ensureCache = async (
  deps: ReaderDependencies,
): Promise<{ readonly provenance: Provenance; readonly snapshotDir: string }> => {
  const cacheRoot = cacheRootOf(deps.env, deps.home);
  const plan = await loadPlan(deps, cacheRoot, MODEL_ID, (entryPath) => !entryPath.startsWith('.'));
  const model = await syncRepo(deps, cacheRoot, plan);
  return {
    provenance: {
      blobs: model.blobs,
      bundleSha256: VENDORED_BUNDLE_SHA256,
      modelRevision: plan.sha,
    },
    snapshotDir: model.snapshotDir,
  };
};

const prepareModel = async (
  deps: ReaderDependencies,
  bundle: ReaderBundle,
): Promise<{
  readonly loadedAt: number;
  readonly model: ModelHandle;
  readonly startedLoad: number;
}> => {
  const cache = await ensureCache(deps);
  deps.log(`provenance ${JSON.stringify(cache.provenance)}`);
  await installGpu(deps);
  deps.log('gpu adapter ready');
  const startedLoad = deps.now();
  const model = await loadModel(deps, cache.snapshotDir, bundle);
  return { loadedAt: deps.now(), model, startedLoad };
};

const runSuggest = async (args: readonly string[], deps: ReaderDependencies): Promise<number> => {
  const [bundlePath, failuresPath, suggestionsPath] = args;
  if (args.length !== 3 || !args.every((argument) => path.isAbsolute(argument))) {
    throw new ReaderError(usage(), EXIT_CODES.failure);
  }
  const bundle = parseBundle(await deps.readText(bundlePath), bundlePath);
  const failures = parseFailures(await deps.readText(failuresPath), failuresPath);
  const { model } = await prepareModel(deps, bundle);
  try {
    const lines: string[] = [];
    for (const failure of failures) {
      const suggestion = await completeText(
        model,
        suggestionMessages(bundle.document, failure),
        SUGGEST_MAX_NEW_TOKENS,
      );
      lines.push(JSON.stringify({ id: failure.id, suggestion }));
      deps.log(`suggestion ${lines.length} of ${failures.length}`);
    }
    await deps.writeText(suggestionsPath, lines.map((line) => `${line}\n`).join(''));
  } finally {
    await model.dispose?.();
  }
  return EXIT_CODES.answered;
};

export const run = async (args: readonly string[], deps: ReaderDependencies): Promise<number> => {
  if (args[0] === 'suggest') {
    return runSuggest(args.slice(1), deps);
  }
  const [bundlePath, answersPath] = args;
  if (args.length !== 2 || !path.isAbsolute(bundlePath) || !path.isAbsolute(answersPath)) {
    throw new ReaderError(usage(), EXIT_CODES.failure);
  }
  const bundle = parseBundle(await deps.readText(bundlePath), bundlePath);
  const { loadedAt, model, startedLoad } = await prepareModel(deps, bundle);
  try {
    await model.warmup();
    const warmAt = deps.now();
    const { lines, timings } = await answerAll(model, bundle, deps);
    const endedAt = deps.now();
    const meanMs = (endedAt - warmAt) / Math.max(1, timings.length);
    deps.log(
      `answered ${lines.length} probes from ${timings.length} queries; load ${secondsOf(loadedAt - startedLoad)}, `
        + `warmup ${secondsOf(warmAt - loadedAt)}, first token of first query ${secondsOf(timings[0]?.firstTokenMs ?? 0)}, `
        + `mean per query ${secondsOf(meanMs)}, answering ${secondsOf(endedAt - warmAt)}, `
        + `model start to end ${secondsOf(endedAt - startedLoad)}`,
    );
    await deps.writeText(answersPath, lines.map((line) => `${line}\n`).join(''));
  } finally {
    await model.dispose?.();
  }
  return EXIT_CODES.answered;
};

const defaultWeakReaderRunner: WeakReaderRunner = run;

export const defaultDependencies = (): ReaderDependencies => ({
  assignGlobals: (globals) => {
    Object.assign(globalThis, globals);
  },
  env: process.env,
  exists: (target) => Bun.file(target).exists(),
  fetch: createRetryingFetch(fetch, () => [
    ...tls.getCACertificates('default'),
    ...tls.getCACertificates('system'),
  ]),
  hashFile: async (target, algorithm) => {
    const hasher = new Bun.CryptoHasher(algorithm === 'sha256' ? 'sha256' : 'sha1');
    if (algorithm === 'git-sha1') {
      hasher.update(`blob ${Bun.file(target).size}\0`);
    }
    for await (const chunk of Bun.file(target).stream()) {
      hasher.update(chunk);
    }
    return hasher.digest('hex');
  },
  hashText: (text) => new Bun.CryptoHasher('sha256').update(text).digest('hex'),
  home: homedir(),
  importSource: (source) =>
    import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))),
  importWebgpu: () => import('webgpu'),
  installNavigatorGpu: (gpu) => {
    Object.defineProperty(globalThis.navigator, 'gpu', { configurable: true, value: gpu });
  },
  log: (message) => console.error(`[weak-reader] ${message}`),
  mkdir: async (target) => {
    await mkdir(target, { recursive: true });
  },
  now: () => performance.now(),
  openLocalFile: async (target) => {
    const file = Bun.file(target);
    return (await file.exists())
      ? {
          body: (start, end) => (start === undefined ? file : file.slice(start, end)),
          size: file.size,
        }
      : undefined;
  },
  readText: (target) => Bun.file(target).text(),
  readVendoredBundle: async () =>
    new TextDecoder().decode(
      Bun.gunzipSync(
        await Bun.file(path.join(import.meta.dir, '..', VENDORED_BUNDLE_PATH)).bytes(),
      ),
    ),
  rename,
  symlink: async (target, link) => {
    await symlink(target, link);
  },
  writeBody: async (target, body) => {
    await Bun.write(target, body);
  },
  writeText: async (target, content) => {
    await Bun.write(target, content);
  },
});

export const runCli = async (
  args: readonly string[],
  deps: ReaderDependencies,
  runner: WeakReaderRunner = defaultWeakReaderRunner,
  exit: (code: number) => void = (code) => process.exit(code),
): Promise<void> => {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage());
    return;
  }
  try {
    exit(await runner(args, deps));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exit(error instanceof ReaderError ? error.exitCode : EXIT_CODES.failure);
  }
};

void (import.meta.main ? runCli(Bun.argv.slice(2), defaultDependencies()) : undefined);
