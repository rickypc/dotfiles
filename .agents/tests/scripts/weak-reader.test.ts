import { afterEach, describe, expect, mock, test } from 'bun:test';
import * as realFsPromises from 'node:fs/promises';
import * as realOs from 'node:os';
import path from 'node:path';
import realTls from 'node:tls';
import type {
  ChatMessage,
  LocalFile,
  ModelHandle,
  ReaderDependencies,
} from '../../scripts/weak-reader.js';

const fsMkdir = mock(async () => undefined);
const fsRename = mock(async () => undefined);
const fsSymlink = mock(async () => undefined);
const fakeGpu = { requestAdapter: mock(async () => ({})) };
const webgpuCreate = mock(() => fakeGpu);

mock.module('node:fs/promises', () => ({
  ...realFsPromises,
  mkdir: fsMkdir,
  rename: fsRename,
  symlink: fsSymlink,
}));
mock.module('node:os', () => ({ ...realOs, homedir: mock(() => '/home/reader') }));
mock.module('node:path', () => ({ default: path }));
const getCACertificates = mock((kind: string) => [`${kind}-cert`]);
mock.module('node:tls', () => ({
  ...realTls,
  default: { ...realTls, getCACertificates },
}));
mock.module('webgpu', () => ({ create: webgpuCreate, globals: { GPUBufferUsage: 'usage' } }));

const {
  EXIT_CODES,
  KV_CAPACITY_GLOBAL,
  MAX_NEW_TOKENS,
  PLAN_FILE,
  MODEL_ID,
  MODEL_REVISION,
  ReaderError,
  VENDORED_BUNDLE_PATH,
  VENDORED_BUNDLE_SHA256,
  buildMessages,
  cacheRootOf,
  createLocalFetch,
  createRetryingFetch,
  ensureCache,
  installGpu,
  isCertificateError,
  kvCapacityFor,
  mapNetworkError,
  parseAnswer,
  parseBundle,
  parseSkillName,
  NO_ANSWER,
  ROUTER_MAX_NEW_TOKENS,
  UNPARSEABLE_ROUTE,
  parseFailures,
  run,
  runCli,
  suggestionMessages,
  SUGGEST_MAX_NEW_TOKENS,
  usage,
} = await import('../../scripts/weak-reader.js');

const MODEL_SHA = MODEL_REVISION;
const LFS_OID = 'a'.repeat(64);
const CONFIG_OID = 'b'.repeat(40);
const CACHE = '/cache/hub';

interface FakeFile {
  readonly hash: string;
  readonly size: number;
}

interface Harness {
  readonly deps: ReaderDependencies;
  readonly downloads: string[];
  readonly files: Map<string, FakeFile>;
  readonly logs: string[];
  readonly renames: string[];
  readonly symlinks: string[];
  readonly writes: Map<string, string>;
}

const BUNDLE = JSON.stringify({
  document: 'Rule one.',
  instructions: 'Answer with one letter.',
  prompts: [
    { query: 'Q1?', query_id: 'q1', run: 1 },
    { query: 'Q1?', query_id: 'q1', run: 2 },
    { query: 'Q2?', query_id: 'q2', run: 1 },
  ],
});

const json = (value: unknown): Response => Response.json(value);

const modelTree = [
  { oid: CONFIG_OID, path: 'config.json', size: 5, type: 'file' },
  { lfs: { oid: LFS_OID }, oid: 'x'.repeat(40), path: 'model.safetensors', size: 10, type: 'file' },
  { oid: 'd'.repeat(40), path: '.gitattributes', size: 1, type: 'file' },
  { oid: 'e'.repeat(40), path: 'nested', size: 0, type: 'directory' },
];
const hubFetch = (overrides: Record<string, () => Response | Promise<Response>> = {}) =>
  mock(async (input: URL | RequestInfo) => {
    const url = String(input);
    const override = Object.entries(overrides).find(([fragment]) => url.includes(fragment));
    if (override) {
      return override[1]();
    }
    if (url.includes(`/api/models/${MODEL_ID}/tree/${MODEL_SHA}`)) {
      return json(modelTree);
    }
    return new Response('payload');
  });

const sizes: Record<string, FakeFile> = {
  config: { hash: CONFIG_OID, size: 5 },
  model: { hash: LFS_OID, size: 10 },
};

const downloadedFor = (target: string): FakeFile => {
  if (target.includes(LFS_OID)) {
    return sizes.model;
  }
  return sizes.config;
};

const fakeModel = (replies: readonly string[]): ModelHandle => {
  let index = 0;
  return {
    dispose: mock(),
    encodePrompt: () => [1, 2, 3],
    generate: () => {
      const reply = replies[index++ % replies.length] ?? '';
      return (async function* () {
        yield { text: reply.slice(0, 1) };
        yield { text: reply };
      })();
    },
    warmup: mock(async () => undefined),
  };
};

const makeHarness = (
  options: {
    readonly cached?: Record<string, FakeFile>;
    readonly corruptDownload?: boolean;
    readonly fetcher?: ReaderDependencies['fetch'];
    readonly model?: ModelHandle;
  } = {},
): Harness => {
  const files = new Map<string, FakeFile>(Object.entries(options.cached ?? {}));
  const downloads: string[] = [];
  const logs: string[] = [];
  const renames: string[] = [];
  const symlinks: string[] = [];
  const writes = new Map<string, string>();
  const deps: ReaderDependencies = {
    assignGlobals: mock(),
    env: { HF_HOME: '/cache' },
    exists: mock(async (target: string) => files.has(target) || writes.has(target)),
    fetch: options.fetcher ?? hubFetch(),
    hashFile: mock(async (target: string) => files.get(target)?.hash ?? 'missing'),
    hashText: mock(() => VENDORED_BUNDLE_SHA256),
    home: '/home/reader',
    importSource: mock(async () => ({
      Gemma4Mobile: { load: mock(async () => options.model ?? fakeModel(['B'])) },
    })),
    importWebgpu: mock(async () => ({ create: () => fakeGpu, globals: {} })),
    installNavigatorGpu: mock(),
    log: (message: string) => {
      logs.push(message);
    },
    mkdir: mock(async () => undefined),
    now: mock(() => 0),
    openLocalFile: mock(
      async (target: string): Promise<LocalFile | undefined> =>
        files.has(target) ? { body: () => 'body', size: files.get(target)?.size ?? 0 } : undefined,
    ),
    readText: mock(async (target: string) => writes.get(target) ?? BUNDLE),
    readVendoredBundle: mock(async () => 'vendored source'),
    rename: mock(async (from: string, to: string) => {
      renames.push(`${from}>${to}`);
      files.set(to, files.get(from) ?? { hash: '', size: 0 });
    }),
    symlink: mock(async (target: string, link: string) => {
      symlinks.push(`${link}->${target}`);
    }),
    writeBody: mock(async (target: string) => {
      downloads.push(target);
      files.set(
        target,
        options.corruptDownload ? { hash: 'wrong', size: 1 } : downloadedFor(target),
      );
    }),
    writeText: mock(async (target: string, content: string) => {
      writes.set(target, content);
    }),
  };
  return { deps, downloads, files, logs, renames, symlinks, writes };
};

describe('usage and cache root', () => {
  test('usage names both paths and every exit code', () => {
    const text = usage();
    expect(text).toContain('<absolute-bundle-json-path> <absolute-answers-jsonl-path>');
    expect(text).toContain('2 no GPU adapter');
    expect(text).toContain('3 integrity failure');
    expect(text).toContain('4 missing webgpu package');
  });

  test('cacheRootOf honors HF_HOME and otherwise uses the home cache', () => {
    expect(cacheRootOf({ HF_HOME: '/data/hf' }, '/home/u')).toBe('/data/hf/hub');
    expect(cacheRootOf({}, '/home/u')).toBe('/home/u/.cache/huggingface/hub');
  });
});

describe('mapNetworkError', () => {
  test.each([
    [new Error('self signed certificate in certificate chain'), true],
    [Object.assign(new Error('boom'), { name: 'UNABLE_TO_GET_ISSUER_CERT' }), true],
    [new Error('connection reset'), false],
    ['plain failure', false],
  ])('maps %p', (error, certificate) => {
    const mapped = mapNetworkError(error, 'https://huggingface.co/secret/path?token=1');
    expect(mapped.exitCode).toBe(EXIT_CODES.failure);
    expect(mapped.message).toContain('huggingface.co');
    expect(mapped.message).not.toContain('secret');
    expect(mapped.message.includes('NODE_EXTRA_CA_CERTS')).toBe(certificate);
  });
});

describe('parseAnswer', () => {
  test.each([
    ['B', 'B'],
    ['**C**', 'C'],
    ['B) Apple', 'B'],
    ['Answer: E', 'E'],
    ['the answer is d', ''],
    ['', ''],
    ['Z', ''],
    ['Apple', ''],
  ])('keeps the first standalone option letter of %p', (reply, expected) => {
    expect(parseAnswer(reply)).toBe(expected);
  });
});

describe('buildMessages', () => {
  test('puts the instructions and document in a shared system prefix and the query last', () => {
    const messages: readonly ChatMessage[] = buildMessages('Be brief.', 'DOC', 'Q?');
    expect(messages).toEqual([
      { content: 'Be brief.\n\nDocument:\nDOC', role: 'system' },
      { content: 'Q?', role: 'user' },
    ]);
  });
});

describe('parseBundle', () => {
  test('returns a valid bundle unchanged', () => {
    expect(parseBundle(BUNDLE, 'b.json').prompts).toHaveLength(3);
  });

  test.each([
    ['{not json', 'is not valid JSON'],
    ['null', 'is not a document or router bundle with instructions and prompts'],
    ['{"document":1,"instructions":"x","prompts":[]}', 'with a document or a catalog'],
    ['{"document":"d","instructions":"x"}', 'with instructions and prompts'],
    ['{"catalog":[],"instructions":"x","prompts":[]}', 'with a document or a catalog'],
    ['{"catalog":[{"name":"a"}],"instructions":"x","prompts":[]}', 'with a document or a catalog'],
    ['{"catalog":[null],"instructions":"x","prompts":[]}', 'with a document or a catalog'],
  ])('rejects %p', (content, message) => {
    expect(() => parseBundle(content, 'b.json')).toThrow(message);
  });

  test('turns a router bundle into a catalog context with the allowed names', () => {
    const router = JSON.stringify({
      catalog: [
        { description: 'Plans work.', name: 'aidp' },
        { description: 'Runs plans.', name: 'aidx' },
      ],
      instructions: 'Route it.',
      prompts: [{ query: 'Q', query_id: 'a', run: 1 }],
    });
    const bundle = parseBundle(router, 'r.json');

    expect(bundle.names).toEqual(['aidp', 'aidx']);
    expect(bundle.document).toBe('Skill catalog:\n- aidp: Plans work.\n- aidx: Runs plans.');
    expect(bundle.instructions).toBe('Route it.');
  });
});

describe('parseSkillName', () => {
  const names = ['aidp', 'aidx', 'knowledge-base', 'md-compress', 'review-changes'];

  test.each([
    ['aidp', 'aidp'],
    ['`knowledge-base`.', 'knowledge-base'],
    ['The answer is NO_SKILL', 'NO_SKILL'],
    ['md-compress or aidx', 'md-compress'],
    ['aidx, then aidp', 'aidx'],
    ['review_changes', 'review-changes'],
    ['Knowledge Base', 'knowledge-base'],
    ['no skill', 'NO_SKILL'],
    ['MD-COMPRESS', 'md-compress'],
    ['banana', UNPARSEABLE_ROUTE],
    ['aidpx', UNPARSEABLE_ROUTE],
    ['', UNPARSEABLE_ROUTE],
  ])('reads %p as %p', (reply, expected) => {
    expect(parseSkillName(reply, names)).toBe(expected);
  });

  test('a longer name wins over a shorter name that starts at the same place', () => {
    expect(parseSkillName('react-native', ['react', 'react-native'])).toBe('react-native');
  });
});

describe('createLocalFetch', () => {
  const body = mock((start?: number, end?: number) => `body:${start}:${end}`);
  const open = mock(
    async (target: string): Promise<LocalFile | undefined> =>
      target === '/snap/dir/model.safetensors' ? { body, size: 100 } : undefined,
  );
  const localFetch = createLocalFetch('/snap', open);
  const url = 'https://huggingface.co/x/resolve/main/dir/model.safetensors';

  test('answers HEAD with the size and no body', async () => {
    const response = await localFetch(url, { method: 'HEAD' });
    expect(response.headers.get('content-length')).toBe('100');
    expect(await response.text()).toBe('');
  });

  test('serves the whole file without a range', async () => {
    const response = await localFetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('body:undefined:undefined');
  });

  test('serves a closed byte range as 206', async () => {
    const response = await localFetch(url, { headers: { range: 'bytes=10-19' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 10-19/100');
    expect(response.headers.get('content-length')).toBe('10');
    expect(await response.text()).toBe('body:10:20');
  });

  test('serves an open-ended byte range to the last byte', async () => {
    const response = await localFetch(url, { headers: { range: 'bytes=90-' } });
    expect(response.headers.get('content-range')).toBe('bytes 90-99/100');
  });

  test('decodes the requested path before opening it', async () => {
    await localFetch('https://huggingface.co/x/resolve/main/dir%2Fmodel.safetensors');
    expect(open).toHaveBeenCalledWith('/snap/dir/model.safetensors');
  });

  test.each([
    'https://huggingface.co/x/unrelated',
    'https://huggingface.co/x/resolve/main/missing.bin',
  ])('answers 404 for %p', async (target) => {
    expect((await localFetch(target)).status).toBe(404);
  });
});

const modelBlob = `${CACHE}/models--${MODEL_ID.replace('/', '--')}/blobs/${LFS_OID}`;
const configBlob = `${CACHE}/models--${MODEL_ID.replace('/', '--')}/blobs/${CONFIG_OID}`;

describe('ensureCache', () => {
  test('first run downloads every blob once, verifies it, renames it, and links the snapshot', async () => {
    const harness = makeHarness();
    const result = await ensureCache(harness.deps);

    expect(harness.downloads.sort()).toEqual(
      [configBlob, modelBlob].map((blob) => `${blob}.incomplete`).sort(),
    );
    expect(harness.renames).toHaveLength(2);
    expect(harness.symlinks).toHaveLength(2);
    expect(harness.symlinks.some((link) => link.endsWith(`->../../blobs/${LFS_OID}`))).toBe(true);
    expect(result.provenance).toEqual({
      blobs: [`config.json:${CONFIG_OID}`, `model.safetensors:${LFS_OID}`],
      bundleSha256: VENDORED_BUNDLE_SHA256,
      modelRevision: MODEL_SHA,
    });
    expect(result.snapshotDir).toContain(`snapshots/${MODEL_SHA}`);
    expect(harness.writes.get(`${CACHE}/models--${MODEL_ID.replace('/', '--')}/refs/main`)).toBe(
      MODEL_SHA,
    );
    expect(
      harness.writes.get(`${CACHE}/models--${MODEL_ID.replace('/', '--')}/${PLAN_FILE}`),
    ).toContain(MODEL_SHA);
  });
});

describe('ensureCache plan manifest, cache hits, and integrity', () => {
  const manifest = `${CACHE}/models--${MODEL_ID.replace('/', '--')}/${PLAN_FILE}`;

  test('a recorded plan is reused with no network call at all', async () => {
    const first = makeHarness();
    await ensureCache(first.deps);
    const second = makeHarness({
      cached: { ...Object.fromEntries(first.files) },
      fetcher: mock(async () => {
        throw new Error('offline');
      }),
    });
    for (const [target, content] of first.writes) {
      second.writes.set(target, content);
    }
    const result = await ensureCache(second.deps);

    expect(second.deps.fetch).not.toHaveBeenCalled();
    expect(result.provenance.modelRevision).toBe(MODEL_SHA);
    expect(second.downloads).toEqual([]);
  });

  test.each(['{not json', '{"sha":1,"files":[]}', '{"sha":"x"}'])(
    'an unreadable plan %p is ignored and fetched again',
    async (content) => {
      const harness = makeHarness();
      harness.writes.set(manifest, content);
      const result = await ensureCache(harness.deps);

      expect(result.provenance.modelRevision).toBe(MODEL_SHA);
      expect(harness.logs.some((line) => line.includes('unreadable'))).toBe(true);
      expect(harness.writes.get(manifest)).toContain(MODEL_SHA);
    },
  );

  test('second run is a cache hit: nothing is downloaded or renamed', async () => {
    const harness = makeHarness({
      cached: { [configBlob]: sizes.config, [modelBlob]: sizes.model },
    });
    await ensureCache(harness.deps);

    expect(harness.downloads).toEqual([]);
    expect(harness.renames).toEqual([]);
    expect(harness.deps.fetch).toHaveBeenCalledTimes(1);
  });

  test('an existing snapshot link is left in place', async () => {
    const harness = makeHarness({
      cached: { [configBlob]: sizes.config, [modelBlob]: sizes.model },
    });
    const snapshotConfig = `${CACHE}/models--${MODEL_ID.replace('/', '--')}/snapshots/${MODEL_SHA}/config.json`;
    harness.files.set(snapshotConfig, sizes.config);
    await ensureCache(harness.deps);

    expect(harness.symlinks.some((link) => link.startsWith(snapshotConfig))).toBe(false);
  });

  test('a cached blob with the wrong hash exits 3 without a download', async () => {
    const harness = makeHarness({ cached: { [modelBlob]: { hash: 'bad', size: 10 } } });

    await expect(ensureCache(harness.deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.integrity,
      message: expect.stringContaining('model.safetensors'),
    });
    expect(harness.downloads.some((target) => target.includes(LFS_OID))).toBe(false);
  });

  test('a cached blob with the wrong size exits 3', async () => {
    const harness = makeHarness({ cached: { [modelBlob]: { hash: LFS_OID, size: 3 } } });

    await expect(ensureCache(harness.deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.integrity,
    });
  });

  test('a corrupt download exits 3, keeps the partial file, and is never renamed', async () => {
    const harness = makeHarness({ corruptDownload: true });

    await expect(ensureCache(harness.deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.integrity,
      message: expect.stringContaining('Downloaded'),
    });
    expect(harness.files.has(`${configBlob}.incomplete`)).toBe(true);
    expect(harness.renames).toEqual([]);
  });

  test('a certificate failure on the API names NODE_EXTRA_CA_CERTS and the host only', async () => {
    const harness = makeHarness({
      fetcher: mock(async () => {
        throw new Error('unable to verify the first certificate');
      }),
    });

    await expect(ensureCache(harness.deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.failure,
      message: expect.stringContaining('NODE_EXTRA_CA_CERTS'),
    });
  });

  test('a non-success API status is reported with the host and status', async () => {
    const harness = makeHarness({
      fetcher: hubFetch({ [`/api/models/${MODEL_ID}`]: () => new Response('no', { status: 503 }) }),
    });

    await expect(ensureCache(harness.deps)).rejects.toThrow(
      'huggingface.co failed with status 503',
    );
  });

  test('a failing download request maps the network error', async () => {
    const harness = makeHarness({
      fetcher: hubFetch({
        '/resolve/': () => {
          throw new Error('socket closed');
        },
      }),
    });

    await expect(ensureCache(harness.deps)).rejects.toThrow(
      'Network failure reaching huggingface.co',
    );
    expect(harness.downloads).toEqual([]);
  });

  test('a non-success download status is reported', async () => {
    const harness = makeHarness({
      fetcher: hubFetch({ '/resolve/': () => new Response('gone', { status: 404 }) }),
    });

    await expect(ensureCache(harness.deps)).rejects.toThrow(
      'Download from huggingface.co failed with status 404',
    );
  });
});

describe('installGpu', () => {
  test('installs the globals and the navigator entry point when an adapter exists', async () => {
    const harness = makeHarness();
    await installGpu(harness.deps);

    expect(harness.deps.assignGlobals).toHaveBeenCalledTimes(1);
    expect(harness.deps.installNavigatorGpu).toHaveBeenCalledTimes(1);
  });

  test('a missing package exits 4 with the exact add command', async () => {
    const harness = makeHarness();
    const deps = {
      ...harness.deps,
      importWebgpu: mock(async () => {
        throw new Error('Cannot find package');
      }),
    };

    await expect(installGpu(deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.missingDependency,
      message: expect.stringContaining('bun add webgpu'),
    });
    expect(harness.deps.installNavigatorGpu).not.toHaveBeenCalled();
  });

  test.each([
    ['a null adapter', async () => null],
    [
      'a rejected adapter request',
      async () => {
        throw new Error('no device');
      },
    ],
  ])('%s exits 2 and names the sandbox remedy', async (_label, requestAdapter) => {
    const harness = makeHarness();
    const deps = {
      ...harness.deps,
      importWebgpu: mock(async () => ({ create: () => ({ requestAdapter }), globals: {} })),
    };

    await expect(installGpu(deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.noAdapter,
      message: expect.stringContaining('outside the sandbox'),
    });
    expect(harness.deps.installNavigatorGpu).not.toHaveBeenCalled();
  });
});

describe('run', () => {
  test('writes one answer line per prompt in bundle order, asking each distinct query once', async () => {
    const model = fakeModel(['B', 'noise only', 'C) text']);
    const harness = makeHarness({ model });
    const ticks = [0, 2000, 2500, 2500, 2600, 2900, 2900, 3000, 3400, 3400];
    const deps = { ...harness.deps, now: mock(() => ticks.shift() ?? 0) };

    const code = await run(['/in/bundle.json', '/out/answers.jsonl'], deps);

    expect(code).toBe(EXIT_CODES.answered);
    expect(harness.writes.get('/out/answers.jsonl')).toBe(
      [
        '{"answer":"B","query_id":"q1","run":1}',
        '{"answer":"B","query_id":"q1","run":2}',
        `{"answer":"${NO_ANSWER}","query_id":"q2","run":1}`,
        '',
      ].join('\n'),
    );
    expect(model.warmup).toHaveBeenCalledTimes(1);
    expect(model.dispose).toHaveBeenCalledTimes(1);
    expect(harness.logs.some((line) => line.startsWith('provenance'))).toBe(true);
    expect(harness.logs).toContain('query 1: first token 0.100 s, total 0.400 s');
    expect(harness.logs).toContain('query 2: first token 0.100 s, total 0.500 s');
    expect(harness.logs).toContain(
      'answered 3 probes from 2 queries; load 2.000 s, warmup 0.500 s, '
        + 'first token of first query 0.100 s, mean per query 0.450 s, answering 0.900 s, '
        + 'model start to end 3.400 s',
    );
  });

  test('passes the small token limit and the document prefix to the model', async () => {
    const generate = mock((_messages: readonly ChatMessage[], _options: { maxNewTokens: number }) =>
      (async function* () {
        yield { text: 'A' };
      })(),
    );
    const model: ModelHandle = {
      encodePrompt: () => [1],
      generate,
      warmup: async () => undefined,
    };
    const harness = makeHarness({ model });

    await run(['/in/bundle.json', '/out/answers.jsonl'], harness.deps);

    expect(generate.mock.calls[0]?.[1]).toEqual({ maxNewTokens: MAX_NEW_TOKENS });
    expect(generate.mock.calls[0]?.[0][0]?.content).toContain('Rule one.');
  });

  test('an empty prompt list writes an empty file and still returns 0', async () => {
    const harness = makeHarness();
    const deps = {
      ...harness.deps,
      readText: mock(async () => '{"document":"d","instructions":"i","prompts":[]}'),
    };

    expect(await run(['/in/b.json', '/out/a.jsonl'], deps)).toBe(0);
    expect(harness.writes.get('/out/a.jsonl')).toBe('');
  });

  test('releases the model and writes nothing when generation fails', async () => {
    const dispose = mock();
    const model: ModelHandle = {
      dispose,
      encodePrompt: () => [1],
      generate: () => {
        throw new Error('KV cache overflow');
      },
      warmup: async () => undefined,
    };
    const harness = makeHarness({ model });

    await expect(run(['/in/bundle.json', '/out/answers.jsonl'], harness.deps)).rejects.toThrow(
      'KV cache overflow',
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(harness.writes.has('/out/answers.jsonl')).toBe(false);
  });

  test('a model without dispose still completes', async () => {
    const model: ModelHandle = {
      encodePrompt: () => [1],
      generate: () =>
        (async function* () {
          yield { text: 'D' };
        })(),
      warmup: async () => undefined,
    };
    const harness = makeHarness({ model });

    expect(await run(['/in/bundle.json', '/out/answers.jsonl'], harness.deps)).toBe(0);
  });

  test.each([
    [[]],
    [['/only/one.json']],
    [['relative.json', '/out/a.jsonl']],
    [['/in/b.json', 'relative.jsonl']],
    [['/in/b.json', '/out/a.jsonl', '/extra']],
  ])('rejects arguments %p with the usage text before work starts', async (args) => {
    const harness = makeHarness();

    await expect(run(args, harness.deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.failure,
      message: usage(),
    });
    expect(harness.deps.readText).not.toHaveBeenCalled();
    expect(harness.deps.fetch).not.toHaveBeenCalled();
  });

  test('an invalid bundle stops before network or GPU work', async () => {
    const harness = makeHarness();
    const deps = { ...harness.deps, readText: mock(async () => 'nope') };

    await expect(run(['/in/b.json', '/out/a.jsonl'], deps)).rejects.toThrow('is not valid JSON');
    expect(harness.deps.fetch).not.toHaveBeenCalled();
    expect(harness.deps.importWebgpu).not.toHaveBeenCalled();
  });
});

describe('kvCapacityFor', () => {
  const bundleOf = (document: string) => ({
    document,
    instructions: 'i',
    prompts: [{ query: 'q', query_id: 'a', run: 1 }],
  });

  test.each([
    [10, 8192],
    [100_000, 40_960],
    [10_000_000, 131_072],
  ])('a %p character document gets %p tokens of capacity', (length, expected) => {
    expect(kvCapacityFor(bundleOf('x'.repeat(length)))).toBe(expected);
  });

  test('a bundle without prompts still gets the minimum capacity', () => {
    expect(kvCapacityFor({ document: 'd', instructions: 'i', prompts: [] })).toBe(8192);
  });
});

describe('certificate retry', () => {
  const certificateError = new Error('self signed certificate in certificate chain');

  test('recognizes certificate failures only', () => {
    expect(isCertificateError(certificateError)).toBe(true);
    expect(isCertificateError(new Error('socket closed'))).toBe(false);
  });

  test('passes a successful response straight through', async () => {
    const base = mock(async () => new Response('ok'));
    const retrying = createRetryingFetch(base, () => ['ca']);

    expect(await (await retrying('https://x.test/')).text()).toBe('ok');
    expect(base).toHaveBeenCalledTimes(1);
  });

  test('retries once with the supplied trust store after a certificate failure', async () => {
    const base = mock(async (_input: URL | RequestInfo, init?: RequestInit) => {
      if (!Reflect.has(init ?? {}, 'tls')) {
        throw certificateError;
      }
      return new Response('retried');
    });
    const retrying = createRetryingFetch(base, () => ['system-ca']);

    expect(await (await retrying('https://x.test/', { method: 'GET' })).text()).toBe('retried');
    expect(base).toHaveBeenCalledTimes(2);
    expect(Reflect.get(base.mock.calls[1]?.[1] ?? {}, 'tls')).toEqual({ ca: ['system-ca'] });
  });

  test('rethrows other failures without a retry and a second certificate failure as is', async () => {
    const network = mock(async () => {
      throw new Error('socket closed');
    });
    await expect(createRetryingFetch(network, () => [])('https://x.test/')).rejects.toThrow(
      'socket closed',
    );
    expect(network).toHaveBeenCalledTimes(1);

    const persistent = mock(async () => {
      throw certificateError;
    });
    await expect(createRetryingFetch(persistent, () => [])('https://x.test/')).rejects.toBe(
      certificateError,
    );
    expect(persistent).toHaveBeenCalledTimes(2);
  });
});

describe('run with the vendored bundle', () => {
  test('imports the verified source, sizes the context from the document, and logs it', async () => {
    const harness = makeHarness();

    await run(['/in/bundle.json', '/out/answers.jsonl'], harness.deps);

    expect(harness.deps.hashText).toHaveBeenCalledWith('vendored source');
    expect(harness.deps.importSource).toHaveBeenCalledWith('vendored source');
    expect(harness.deps.assignGlobals).toHaveBeenCalledWith({ [KV_CAPACITY_GLOBAL]: 8192 });
    expect(harness.logs).toContain('context 11 of 8192 tokens');
  });

  test('a vendored bundle that fails its pinned hash exits 3 before importing it', async () => {
    const harness = makeHarness();
    const deps = { ...harness.deps, hashText: mock(() => 'tampered') };

    await expect(run(['/in/bundle.json', '/out/answers.jsonl'], deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.integrity,
      message: expect.stringContaining(VENDORED_BUNDLE_PATH),
    });
    expect(harness.deps.importSource).not.toHaveBeenCalled();
    expect(harness.writes.has('/out/answers.jsonl')).toBe(false);
  });

  test('a document beyond the context capacity exits 5 before answering', async () => {
    const dispose = mock();
    const model: ModelHandle = {
      ...fakeModel(['A']),
      dispose,
      encodePrompt: () => new Array<number>(9000).fill(0),
    };
    const harness = makeHarness({ model });

    await expect(
      run(['/in/bundle.json', '/out/answers.jsonl'], harness.deps),
    ).rejects.toMatchObject({
      exitCode: EXIT_CODES.tooLong,
      message: expect.stringContaining('9008 tokens'),
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(harness.writes.has('/out/answers.jsonl')).toBe(false);
  });
});

describe('router bundles', () => {
  const routerBundle = JSON.stringify({
    catalog: [
      { description: 'Plans work.', name: 'aidp' },
      { description: 'Runs plans.', name: 'aidx' },
    ],
    instructions: 'Route it.',
    prompts: [
      { query: 'Plan this.', query_id: 'q1', run: 1 },
      { query: 'Plan this.', query_id: 'q1', run: 2 },
      { query: 'Say hi.', query_id: 'q2', run: 1 },
    ],
  });

  test('answers with skill names under skill_name, asking each query once, and tags unparseable replies', async () => {
    const generate = mock(
      (_messages: readonly ChatMessage[], _options: { maxNewTokens: number }) => {
        const replies = ['aidp', 'hello there'];
        const reply = replies[generate.mock.calls.length - 1] ?? '';
        return (async function* () {
          yield { text: reply };
        })();
      },
    );
    const harness = makeHarness({ model: { ...fakeModel(['A']), generate } });
    const deps = { ...harness.deps, readText: mock(async () => routerBundle) };

    expect(await run(['/in/router.json', '/out/answers.jsonl'], deps)).toBe(0);

    expect(harness.writes.get('/out/answers.jsonl')).toBe(
      [
        '{"skill_name":"aidp","query_id":"q1","run":1}',
        '{"skill_name":"aidp","query_id":"q1","run":2}',
        `{"skill_name":"${UNPARSEABLE_ROUTE}","query_id":"q2","run":1}`,
        '',
      ].join('\n'),
    );
    expect(generate.mock.calls[0]?.[1]).toEqual({ maxNewTokens: ROUTER_MAX_NEW_TOKENS });
    expect(harness.logs.some((line) => line.startsWith('unparseable reply for "Say hi."'))).toBe(
      true,
    );
    expect(harness.logs.filter((line) => line.startsWith('unparseable reply'))).toHaveLength(1);
    expect(generate.mock.calls[0]?.[0][0]?.content).toContain('- aidx: Runs plans.');
  });
});

describe('suggest mode', () => {
  const failure = { expected: 'A', given: 'B', id: 'train-01', query: 'Q?\nA) one\nB) two' };
  const failuresJson = JSON.stringify([failure, { ...failure, id: 'train-02' }]);
  const suggestDeps = (model: ModelHandle) => {
    const harness = makeHarness({ model });
    const deps = {
      ...harness.deps,
      readText: mock(async (target: string) =>
        target.endsWith('failures.json') ? failuresJson : BUNDLE,
      ),
    };
    return { deps, harness };
  };
  const args = ['suggest', '/in/bundle.json', '/in/failures.json', '/out/suggestions.jsonl'];

  test('writes one trimmed suggestion line per failure using the long token limit', async () => {
    const generate = mock((_messages: readonly ChatMessage[], _options: { maxNewTokens: number }) =>
      (async function* () {
        yield { text: '  The deciding sentence is X.\n' };
      })(),
    );
    const { deps, harness } = suggestDeps({ ...fakeModel(['A']), generate });

    expect(await run(args, deps)).toBe(EXIT_CODES.answered);

    expect(harness.writes.get('/out/suggestions.jsonl')).toBe(
      '{"id":"train-01","suggestion":"The deciding sentence is X."}\n'
        + '{"id":"train-02","suggestion":"The deciding sentence is X."}\n',
    );
    expect(generate.mock.calls[0]?.[1]).toEqual({ maxNewTokens: SUGGEST_MAX_NEW_TOKENS });
    expect(harness.logs).toContain('suggestion 2 of 2');
  });

  test('the prompt carries the document, the question, the given and correct letters', () => {
    const [system, user] = suggestionMessages('DOC TEXT', failure);

    expect(system?.role).toBe('system');
    expect(system?.content).toContain('DOC TEXT');
    expect(system?.content).not.toContain('exactly one option letter');
    expect(user?.content).toContain('Q?');
    expect(user?.content).toContain('You answered B. The correct answer is A.');
    expect(user?.content).toContain('make A obvious');
  });

  test('releases the model and writes nothing when generation fails', async () => {
    const dispose = mock();
    const { deps, harness } = suggestDeps({
      ...fakeModel(['A']),
      dispose,
      generate: () => {
        throw new Error('boom');
      },
    });

    await expect(run(args, deps)).rejects.toThrow('boom');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(harness.writes.has('/out/suggestions.jsonl')).toBe(false);
  });

  test.each([
    [['suggest', '/in/bundle.json', '/in/failures.json']],
    [['suggest', '/in/bundle.json', '/in/failures.json', 'relative.jsonl']],
    [['suggest', 'relative.json', '/in/failures.json', '/out/s.jsonl']],
  ])('rejects arguments %p with the usage text', async (badArgs) => {
    const { deps } = suggestDeps(fakeModel(['A']));

    await expect(run(badArgs, deps)).rejects.toMatchObject({
      exitCode: EXIT_CODES.failure,
      message: usage(),
    });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test('parseFailures accepts a valid list and rejects bad JSON and wrong shapes', () => {
    expect(parseFailures(failuresJson, 'f.json')).toHaveLength(2);
    expect(parseFailures('[]', 'f.json')).toEqual([]);
    expect(() => parseFailures('{nope', 'f.json')).toThrow('is not valid JSON');
    for (const bad of [
      '{}',
      'null',
      '[null]',
      '[{"id":"x"}]',
      '[{"id":1,"query":"q","expected":"A","given":"B"}]',
    ]) {
      expect(() => parseFailures(bad, 'f.json')).toThrow('must be an array of objects');
    }
  });

  test('usage documents the suggest route and the document-too-long code', () => {
    expect(usage()).toContain('weak-reader.ts suggest');
    expect(usage()).toContain('5 document too long');
  });
});

describe('runCli', () => {
  const quiet = (): void => undefined;

  afterEach(() => {
    mock.restore();
  });

  test('prints the usage for a single help flag without running', async () => {
    const runner = mock(async () => 0);
    const log = mock();
    const original = console.log;
    console.log = log;
    try {
      await runCli(['--help'], makeHarness().deps, runner, quiet);
      await runCli(['-h'], makeHarness().deps, runner, quiet);
    } finally {
      console.log = original;
    }

    expect(log).toHaveBeenCalledWith(usage());
    expect(log).toHaveBeenCalledTimes(2);
    expect(runner).not.toHaveBeenCalled();
  });

  test('exits with the runner result', async () => {
    const exit = mock();
    await runCli(['a', 'b'], makeHarness().deps, async () => 0, exit);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test.each([
    [new ReaderError('no adapter', 2), 2],
    [new ReaderError('bad blob', 3), 3],
    [new Error('plain'), 1],
    ['text', 1],
  ])('maps %p to exit code %p and prints the message', async (error, code) => {
    const exit = mock();
    const printed = mock();
    const original = console.error;
    console.error = printed;
    try {
      await runCli(
        ['a', 'b'],
        makeHarness().deps,
        async () => {
          throw error;
        },
        exit,
      );
    } finally {
      console.error = original;
    }

    expect(exit).toHaveBeenCalledWith(code);
    expect(printed).toHaveBeenCalledWith(error instanceof Error ? error.message : String(error));
  });

  test('the default runner and exit are wired to run and process.exit', async () => {
    const originalExit = process.exit;
    const exit = mock();
    process.exit = exit as unknown as typeof process.exit;
    const original = console.error;
    console.error = quiet;
    try {
      await runCli([], makeHarness().deps);
    } finally {
      process.exit = originalExit;
      console.error = original;
    }

    expect(exit).toHaveBeenCalledWith(EXIT_CODES.failure);
  });
});
