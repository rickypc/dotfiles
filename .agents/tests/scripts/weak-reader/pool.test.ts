import { describe, expect, mock, test } from 'bun:test';
import type {
  ModelHandle,
  Provenance,
  ReaderBundle,
  ReaderDependencies,
} from '../../../scripts/weak-reader/index.js';
import { EXIT_CODES, kvCapacityFor } from '../../../scripts/weak-reader/index.js';
import {
  disposeAllReaderSlots,
  type LoadedReader,
  retainReader,
  withReaderSession,
} from '../../../scripts/weak-reader/pool.js';

const bundleOf = (longestQueryLength = 10): ReaderBundle =>
  ({
    boundary: 'in-session',
    document: 'doc',
    instructions: 'instr',
    prompts: [{ query: 'q'.repeat(longestQueryLength), query_id: 'q1', run: 1 }],
    responseContract: '',
  }) as unknown as ReaderBundle;
const depsOf = (): ReaderDependencies =>
  ({ log: mock(() => undefined), now: mock(() => 0) }) as unknown as ReaderDependencies;
const modelOf = (promptLength = 10): ModelHandle =>
  ({
    dispose: mock(async () => undefined),
    encodePrompt: mock(() => ({ length: promptLength })),
    generate: mock(() => (async function* () {})()),
    warmup: mock(async () => undefined),
  }) as unknown as ModelHandle;
const provenanceOf = (): Provenance => ({
  blobs: [],
  bundleSha256: 'bundle',
  modelRevision: 'rev',
});
const loaderFor = (models: ModelHandle[]) => {
  const load = mock(async () => {
    const model = models.shift();
    if (model === undefined) {
      throw new Error('no model left');
    }
    const loaded: LoadedReader = { capacity: 8192, model, provenance: provenanceOf() };
    return loaded;
  });
  return load;
};

describe('weak reader instance pool', () => {
  test('pool resets between tests', async () => {
    await disposeAllReaderSlots();
    expect(true).toBe(true);
  });

  test('first acquire loads once, release disposes at zero refs', async () => {
    const model = modelOf();
    const load = loaderFor([model]);
    const deps = depsOf();
    const bundle = bundleOf();
    await withReaderSession(deps, load, bundle, async () => EXIT_CODES.answered);
    expect(load).toHaveBeenCalledTimes(1);
    expect(model.dispose).toHaveBeenCalledTimes(1);
  });

  test('a hold keeps the instance alive across sequential sessions and disposes at the last release', async () => {
    const model = modelOf();
    const load = loaderFor([model]);
    const deps = depsOf();
    const bundle = bundleOf();
    const release = await retainReader(deps, load, bundle);
    await withReaderSession(deps, load, bundle, async () => 1);
    await withReaderSession(deps, load, bundle, async () => 2);
    expect(load).toHaveBeenCalledTimes(1);
    expect(model.dispose).toHaveBeenCalledTimes(0);
    await release();
    expect(model.dispose).toHaveBeenCalledTimes(1);
  });

  test('a larger document loads a second slot and slots dispose independently', async () => {
    const first = modelOf();
    const second = modelOf();
    const models = [first, second];
    const load = mock(async (_deps: ReaderDependencies, bundle: ReaderBundle) => {
      const model = models.shift() as ModelHandle;
      const loaded: LoadedReader = {
        capacity: kvCapacityFor(bundle),
        model,
        provenance: provenanceOf(),
      };
      return loaded;
    });
    const deps = depsOf();
    await disposeAllReaderSlots();
    await withReaderSession(deps, load, bundleOf(), async () => 1);
    await withReaderSession(deps, load, bundleOf(20000), async () => 2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  test('a document longer than the capacity refuses with tooLong and disposes the loaded instance', async () => {
    await disposeAllReaderSlots();
    const model = modelOf(90000);
    const load = loaderFor([model]);
    const deps = depsOf();
    const exitCode = await withReaderSession(deps, load, bundleOf(), async () => 1).then(
      () => -1,
      (error: { exitCode: number }) => error.exitCode,
    );
    expect(exitCode).toBe(EXIT_CODES.tooLong);
    expect(model.dispose).toHaveBeenCalledTimes(1);
  });

  test('a failing session leaves the queue healthy for the next session', async () => {
    const model = modelOf();
    const load = loaderFor([model]);
    const deps = depsOf();
    await disposeAllReaderSlots();
    const release = await retainReader(deps, load, bundleOf());
    const failure = withReaderSession(deps, load, bundleOf(), async () => {
      throw new Error('session exploded');
    }).then(
      () => 'resolved',
      () => 'rejected',
    );
    expect(await failure).toBe('rejected');
    const second = await withReaderSession(deps, load, bundleOf(), async () => 'ok');
    expect(second).toBe('ok');
    expect(load).toHaveBeenCalledTimes(1);
    expect(model.dispose).toHaveBeenCalledTimes(0);
    await release();
    expect(model.dispose).toHaveBeenCalledTimes(1);
  });

  test('sessions serialize on one instance in arrival order', async () => {
    const model = modelOf();
    const load = loaderFor([model]);
    const deps = depsOf();
    const order: string[] = [];
    const slow = withReaderSession(deps, load, bundleOf(), async () => {
      order.push('a-start');
      order.push('a-end');
      return 'a';
    });
    const fast = withReaderSession(deps, load, bundleOf(), async () => {
      order.push('b');
      return 'b';
    });
    expect([await slow, await fast]).toEqual(['a', 'b']);
    expect(order).toEqual(['a-start', 'a-end', 'b']);
  });
});

describe('weak reader instance pool shutdown', () => {
  test('shutdown disposes every live slot and clears the pool', async () => {
    const model = modelOf();
    const load = loaderFor([model]);
    const deps = depsOf();
    const release = await retainReader(deps, load, bundleOf());
    await disposeAllReaderSlots();
    expect(model.dispose).toHaveBeenCalledTimes(1);
    await release();
    expect(model.dispose).toHaveBeenCalledTimes(1);
  });

  test('a retained document longer than the capacity refuses with tooLong', async () => {
    const model = modelOf(90000);
    const load = loaderFor([model]);
    const deps = depsOf();
    const exitCode = await retainReader(deps, load, bundleOf()).then(
      () => -1,
      (error: { exitCode: number }) => error.exitCode,
    );
    expect(exitCode).toBe(EXIT_CODES.tooLong);
    expect(model.dispose).toHaveBeenCalledTimes(1);
  });
});
