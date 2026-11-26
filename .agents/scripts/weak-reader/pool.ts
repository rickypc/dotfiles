import {
  buildMessages,
  EXIT_CODES,
  kvCapacityFor,
  MAX_CONTEXT_TOKENS,
  MAX_NEW_TOKENS,
  type ModelHandle,
  type Provenance,
  type ReaderBundle,
  type ReaderDependencies,
  ReaderError,
  ROUTER_MAX_NEW_TOKENS,
} from './index.js';

export interface LoadedReader {
  readonly capacity: number;
  readonly model: ModelHandle;
  readonly provenance: Provenance;
}

export type ReaderLoader = (
  deps: ReaderDependencies,
  bundle: ReaderBundle,
) => Promise<LoadedReader>;

interface ReaderPoolSlot {
  readonly capacity: number;
  model: ModelHandle;
  provenance: Provenance;
  refcount: number;
  tail: Promise<unknown>;
}

// One loaded instance per KV capacity, refcounted across requests: the first request loads, later
// requests reuse the same instance while it is in flight, queued requests are guaranteed the same
// instance, and the slot is disposed when its last request releases. The runtime exposes a single
// generation state per instance, so sessions on one slot are serialized.
const readerPool = new Map<number, ReaderPoolSlot>();
const readerPoolLoads = new Map<number, Promise<ReaderPoolSlot>>();

const capacityError = (needed: number, capacity: number): ReaderError =>
  new ReaderError(
    `The document needs ${needed} tokens but the context capacity is ${capacity} (model limit ${MAX_CONTEXT_TOKENS}).`,
    EXIT_CODES.tooLong,
  );

// Shutdown path: dispose every pooled instance regardless of refcount.
export const disposeAllReaderSlots = async (): Promise<void> => {
  const slots = [...readerPool.values()];
  readerPool.clear();
  for (const slot of slots) {
    await slot.model.dispose?.();
  }
};

const loadPoolSlot = async (
  deps: ReaderDependencies,
  load: ReaderLoader,
  bundle: ReaderBundle,
): Promise<ReaderPoolSlot> => {
  const { capacity, model, provenance } = await load(deps, bundle);
  return { capacity, model, provenance, refcount: 0, tail: Promise.resolve() };
};

const longestPromptOf = (bundle: ReaderBundle): string =>
  bundle.prompts.reduce(
    (longest, { query }) => (query.length > longest.length ? query : longest),
    '',
  );

const releaseReader = async (slot: ReaderPoolSlot): Promise<void> => {
  slot.refcount -= 1;
  if (slot.refcount <= 0 && readerPool.get(slot.capacity) === slot) {
    readerPool.delete(slot.capacity);
    await slot.model.dispose?.();
  }
};

const acquireReader = async (
  deps: ReaderDependencies,
  load: ReaderLoader,
  bundle: ReaderBundle,
): Promise<{
  slot: ReaderPoolSlot;
  context: { capacity: number; needed: number };
}> => {
  const capacity = kvCapacityFor(bundle);
  let slot = readerPool.get(capacity);
  if (slot === undefined) {
    let loading = readerPoolLoads.get(capacity);
    if (loading === undefined) {
      loading = loadPoolSlot(deps, load, bundle).finally(() => {
        readerPoolLoads.delete(capacity);
      });
      readerPoolLoads.set(capacity, loading);
    }
    slot = await loading;
    readerPool.delete(capacity);
    readerPool.set(slot.capacity, slot);
  }
  slot.refcount += 1;
  const needed =
    slot.model.encodePrompt(
      buildMessages(bundle.instructions, bundle.document, longestPromptOf(bundle)),
    ).length + (bundle.names ? ROUTER_MAX_NEW_TOKENS : MAX_NEW_TOKENS);
  if (needed > slot.capacity) {
    await releaseReader(slot);
    throw capacityError(needed, slot.capacity);
  }
  return { context: { capacity: slot.capacity, needed }, slot };
};

export const retainReader = async (
  deps: ReaderDependencies,
  load: ReaderLoader,
  bundle: ReaderBundle,
): Promise<() => Promise<void>> => {
  const capacity = kvCapacityFor(bundle);
  let slot = readerPool.get(capacity);
  if (slot === undefined) {
    let loading = readerPoolLoads.get(capacity);
    if (loading === undefined) {
      loading = loadPoolSlot(deps, load, bundle).finally(() => {
        readerPoolLoads.delete(capacity);
      });
      readerPoolLoads.set(capacity, loading);
    }
    slot = await loading;
    readerPool.delete(capacity);
    readerPool.set(slot.capacity, slot);
  }
  slot.refcount += 1;
  const longestQuery = longestPromptOf(bundle);
  const needed =
    slot.model.encodePrompt(buildMessages(bundle.instructions, bundle.document, longestQuery))
      .length + (bundle.names ? ROUTER_MAX_NEW_TOKENS : MAX_NEW_TOKENS);
  if (needed > slot.capacity) {
    await releaseReader(slot);
    throw capacityError(needed, slot.capacity);
  }
  return () => releaseReader(slot);
};

export const withReaderSession = async <Value>(
  deps: ReaderDependencies,
  load: ReaderLoader,
  bundle: ReaderBundle,
  run: (
    model: ModelHandle,
    context: { capacity: number; needed: number },
    provenance: Provenance,
    timing: { readonly loadedAt: number; readonly startedLoad: number },
  ) => Promise<Value>,
): Promise<Value> => {
  const startedLoad = deps.now();
  const { slot, context } = await acquireReader(deps, load, bundle);
  const loadedAt = deps.now();
  const outcome = slot.tail.then(() => {
    deps.log(
      `reader session on a ${slot.refcount > 1 ? 'reused' : 'fresh'} pooled instance (capacity ${context.capacity})`,
    );
    return run(slot.model, context, slot.provenance, { loadedAt, startedLoad });
  });
  slot.tail = outcome.catch(() => undefined);
  try {
    return await outcome;
  } finally {
    await releaseReader(slot);
  }
};
