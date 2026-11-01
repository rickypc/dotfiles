import { afterEach, describe, expect, mock, test } from 'bun:test';
import * as realFsPromises from 'node:fs/promises';
import * as realOs from 'node:os';
import path from 'node:path';
import realTls from 'node:tls';

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

const { defaultDependencies } = await import('../../scripts/weak-reader.js');

const realBun = {
  CryptoHasher: Bun.CryptoHasher,
  file: Bun.file,
  gunzipSync: Bun.gunzipSync,
  write: Bun.write,
};
const realGpu = Object.getOwnPropertyDescriptor(globalThis.navigator, 'gpu');

afterEach(() => {
  Object.assign(Bun, realBun);
  if (realGpu) {
    Object.defineProperty(globalThis.navigator, 'gpu', realGpu);
  } else {
    Reflect.deleteProperty(globalThis.navigator, 'gpu');
  }
  Reflect.deleteProperty(globalThis, 'GPUBufferUsage');
});

const fakeBun = (present: boolean) => {
  const written: unknown[][] = [];
  const slice = mock((start: number, end: number) => `slice:${start}:${end}`);
  const file = {
    bytes: async () => new Uint8Array([1, 2, 3]),
    exists: async () => present,
    size: 42,
    slice,
    stream: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.enqueue(new Uint8Array([2]));
          controller.close();
        },
      }),
    text: async () => 'file text',
  };
  class Hasher {
    readonly algorithm: string;
    chunks = 0;
    constructor(algorithm: string) {
      this.algorithm = algorithm;
    }
    digest(): string {
      return `${this.algorithm}:${this.chunks}`;
    }
    update(): this {
      this.chunks += 1;
      return this;
    }
  }
  Object.assign(Bun, {
    CryptoHasher: Hasher,
    file: () => file,
    gunzipSync: () => new TextEncoder().encode('vendored text'),
    write: async (...args: unknown[]) => {
      written.push(args);
    },
  });
  return { file, slice, written };
};

describe('defaultDependencies', () => {
  test('reads the environment, home, and a log line prefix', () => {
    const errors = mock();
    const original = console.error;
    console.error = errors;
    const deps = defaultDependencies();
    deps.log('hello');
    console.error = original;

    expect(deps.home).toBe('/home/reader');
    expect(deps.env).toBe(process.env);
    expect(errors).toHaveBeenCalledWith('[weak-reader] hello');
    expect(typeof deps.now()).toBe('number');
  });

  test('wraps the file system calls through the mocked node module', async () => {
    const deps = defaultDependencies();
    await deps.mkdir('/a/b');
    await deps.symlink('t', 'l');
    await deps.rename('x', 'y');

    expect(fsMkdir).toHaveBeenCalledWith('/a/b', { recursive: true });
    expect(fsSymlink).toHaveBeenCalledWith('t', 'l');
    expect(fsRename).toHaveBeenCalledWith('x', 'y');
  });
});

describe('defaultDependencies file wrappers', () => {
  test('wraps Bun file access: exists, read, write, hash, open', async () => {
    const bun = fakeBun(true);
    const deps = defaultDependencies();

    expect(await deps.exists('/f')).toBe(true);
    expect(await deps.readText('/f')).toBe('file text');
    await deps.writeText('/out', 'content');
    await deps.writeBody('/blob', new Response('x'));
    expect(bun.written.map(([target]) => target)).toEqual(['/out', '/blob']);
    expect(await deps.hashFile('/f', 'sha256')).toBe('sha256:2');
    expect(await deps.hashFile('/f', 'git-sha1')).toBe('sha1:3');

    const local = await deps.openLocalFile('/f');
    expect(local?.size).toBe(42);
    expect(Object.is(local?.body(), bun.file)).toBe(true);
    expect(local?.body(3, 9)).toBe('slice:3:9');
  });

  test('the default fetch retries a certificate failure with the default and system stores', async () => {
    const originalFetch = globalThis.fetch;
    const calls: unknown[] = [];
    globalThis.fetch = mock(async (_input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(init);
      if (!Reflect.has(init ?? {}, 'tls')) {
        throw new Error('self signed certificate in certificate chain');
      }
      return new Response('ok');
    }) as unknown as typeof fetch;
    try {
      const response = await defaultDependencies().fetch('https://x.test/');
      expect(await response.text()).toBe('ok');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(Reflect.get(calls[1] as object, 'tls')).toEqual({ ca: ['default-cert', 'system-cert'] });
  });

  test('reads and decompresses the vendored bundle and hashes text with sha256', async () => {
    fakeBun(true);
    const deps = defaultDependencies();

    expect(await deps.readVendoredBundle()).toBe('vendored text');
    expect(deps.hashText('anything')).toBe('sha256:1');
  });

  test('openLocalFile returns undefined for a missing file', async () => {
    fakeBun(false);

    expect(await defaultDependencies().openLocalFile('/missing')).toBeUndefined();
  });

  test('imports webgpu, the bundle, and installs globals and the navigator entry point', async () => {
    const deps = defaultDependencies();
    const webgpu = await deps.importWebgpu();
    deps.assignGlobals(webgpu.globals);
    const bundle = await deps.importSource('export const Gemma4Mobile = { load: 1 };');
    deps.installNavigatorGpu(fakeGpu);

    expect(String(Reflect.get(globalThis, 'GPUBufferUsage'))).toBe('usage');
    expect(String(Reflect.get(bundle.Gemma4Mobile, 'load'))).toBe('1');
    expect(Object.is(Reflect.get(globalThis.navigator, 'gpu'), fakeGpu)).toBe(true);
    expect(Object.is(webgpu.create([]), fakeGpu)).toBe(true);
  });
});
