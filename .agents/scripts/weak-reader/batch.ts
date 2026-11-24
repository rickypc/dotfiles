import path from 'node:path';

import type { ModelHandle, ReaderBundle, ReaderDependencies, ReaderFailure } from './index.js';

export interface BatchHooks {
  readonly answerAll: (
    model: ModelHandle,
    bundle: ReaderBundle,
    deps: ReaderDependencies,
  ) => Promise<{ readonly lines: readonly string[]; readonly rawLines: readonly string[] }>;
  readonly fail: (message: string) => Error;
  readonly parseBundle: (content: string, sourcePath: string) => ReaderBundle;
  readonly retain: (bundle: ReaderBundle) => Promise<() => Promise<void>>;
  readonly suggest: (
    model: ModelHandle,
    bundle: ReaderBundle,
    failure: ReaderFailure,
  ) => Promise<string>;
  readonly usage: () => string;
  readonly withSession: <Value>(
    bundle: ReaderBundle,
    run: (model: ModelHandle) => Promise<Value>,
  ) => Promise<Value>;
}

export interface BatchItem {
  readonly answersPath: string;
  readonly bundlePath: string;
  readonly expected?: Readonly<Record<string, string>>;
  readonly rawRepliesPath?: string;
  readonly suggestionsPath?: string;
}

interface Loaded {
  readonly bundle: ReaderBundle;
  readonly item: BatchItem;
}

const failuresOf = (
  bundle: ReaderBundle,
  lines: readonly string[],
  rawLines: readonly string[],
  expected: Readonly<Record<string, string>>,
): readonly ReaderFailure[] => {
  const given = new Map<string, string>();
  for (const line of lines) {
    const entry = JSON.parse(line) as { answer?: string; query_id: string; skill_name?: string };
    given.set(entry.query_id, entry.answer ?? entry.skill_name ?? '');
  }
  const raw = new Map<string, string>(
    rawLines.map((line) => {
      const entry = JSON.parse(line) as { query_id: string; raw_reply: string };
      return [entry.query_id, entry.raw_reply];
    }),
  );
  return Object.entries(expected)
    .filter(([id, letter]) => given.has(id) && given.get(id) !== letter)
    .map(([id, letter]) => ({
      expected: letter,
      given: given.get(id) ?? '',
      id,
      query: bundle.prompts.find((prompt) => prompt.query_id === id)?.query ?? '',
      rawReply: raw.get(id),
    }));
};

const answerItem = async (
  model: ModelHandle,
  { bundle, item }: Loaded,
  deps: ReaderDependencies,
  hooks: BatchHooks,
): Promise<number> => {
  const { lines, rawLines } = await hooks.answerAll(model, bundle, deps);
  const joined = (values: readonly string[]): string => values.map((line) => `${line}\n`).join('');
  await deps.writeText(item.answersPath, joined(lines));
  if (item.rawRepliesPath !== undefined) {
    await deps.writeText(item.rawRepliesPath, joined(rawLines));
  }
  if (item.suggestionsPath !== undefined) {
    const suggestions: string[] = [];
    for (const failure of failuresOf(bundle, lines, rawLines, item.expected ?? {})) {
      const suggestion = await hooks.suggest(model, bundle, failure);
      suggestions.push(JSON.stringify({ id: failure.id, suggestion }));
    }
    await deps.writeText(item.suggestionsPath, joined(suggestions));
  }
  return lines.length;
};

// A fresh model per document keeps every answer identical to the single-document `record` path.
// One shared session kept the previous document's cached prefix, and prefilling the next document
// after it rounds differently from a clean prefill, which flipped a borderline probe in the first
// parity run. The model weights load from the local cache, so the extra loads cost seconds.
const answerDocument = async (
  entry: Loaded,
  deps: ReaderDependencies,
  hooks: BatchHooks,
): Promise<void> => {
  await hooks.withSession(entry.bundle, async (model) => {
    await model.warmup();
    const probes = await answerItem(model, entry, deps, hooks);
    deps.log(`GPU ready; answered ${probes} probes for ${entry.item.bundlePath}`);
  });
};

const isBatchItem = (value: unknown): value is BatchItem => {
  const item = value as Partial<Record<keyof BatchItem, unknown>> | null;
  const optional = [item?.rawRepliesPath, item?.suggestionsPath];
  return (
    typeof item === 'object'
    && item !== null
    && [item.answersPath, item.bundlePath].every(
      (entry) => typeof entry === 'string' && path.isAbsolute(entry),
    )
    && optional.every(
      (entry) => entry === undefined || (typeof entry === 'string' && path.isAbsolute(entry)),
    )
    && (item.expected === undefined
      || (typeof item.expected === 'object' && item.expected !== null))
  );
};

export const parseBatchManifest = (
  content: string,
  sourcePath: string,
  fail: (message: string) => Error,
): readonly BatchItem[] => {
  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(content) as { items?: unknown };
  } catch {
    throw fail(`${sourcePath} is not valid JSON.`);
  }
  const items = parsed.items;
  if (!Array.isArray(items) || items.length === 0 || !items.every(isBatchItem)) {
    throw fail(
      `${sourcePath} must hold a non-empty items array of objects with absolute bundlePath and answersPath.`,
    );
  }
  return items;
};

export const runBatch = async (
  args: readonly string[],
  deps: ReaderDependencies,
  hooks: BatchHooks,
): Promise<void> => {
  const [manifestPath] = args;
  if (args.length !== 1 || !path.isAbsolute(manifestPath as string)) {
    throw hooks.fail(hooks.usage());
  }
  const items = parseBatchManifest(
    await deps.readText(manifestPath as string),
    manifestPath as string,
    hooks.fail,
  );
  const loaded = await Promise.all(
    items.map(async (item) => ({
      bundle: hooks.parseBundle(await deps.readText(item.bundlePath), item.bundlePath),
      item,
    })),
  );
  const holds: (() => Promise<void>)[] = [];
  try {
    for (const entry of loaded) {
      holds.push(await hooks.retain(entry.bundle));
      await answerDocument(entry, deps, hooks);
    }
  } finally {
    for (const release of holds.reverse()) {
      await release();
    }
  }
};
