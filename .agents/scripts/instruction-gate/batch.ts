import path from 'node:path';
import type { CommandExecutor } from '../../utils/process.js';
import {
  blindDocumentBundleFor,
  editorMeasurementOf,
  measurementFromRecords,
  parseResponses,
  parseTriggerQuerySet,
  type TriggerQuerySet,
} from '../../utils/quality-engine/train/index.js';
import { isNoAdapterFailure } from '../weak-reader/index.js';
import {
  type Intent,
  type IntentResult,
  intentQuerySet,
  isIntent,
  MAX_INTENTS,
  scoreIntents,
} from './intent.js';

export interface BatchCandidateResult {
  readonly failures: readonly BatchFailure[];
  readonly id: string;
  readonly intents: readonly IntentResult[];
  readonly measurement: BatchMeasurement;
  readonly passed: Readonly<Record<string, boolean>>;
  readonly sourceSha256: string;
}

export interface BatchDeps {
  readonly agentsRoot: string;
  readonly executor: CommandExecutor;
  readonly makeTempDir: () => Promise<string>;
  readonly readText: (file: string) => Promise<string | undefined>;
  readonly sha256: (text: string) => string;
  readonly toolsRoot: string;
  readonly writeText: (file: string, content: string) => Promise<void>;
}

export interface BatchFailure {
  readonly expected: string;
  readonly given: string;
  readonly id: string;
  readonly query: string;
  readonly rawReply?: string;
  readonly suggestion?: string;
}

export interface BatchHooks<Fingerprint> {
  readonly fingerprint: () => Fingerprint;
  readonly measurementOf: (stdout: string) => BatchMeasurement;
  readonly targetOf: (document: string) => { readonly setPath: string; readonly skill?: string };
}

export interface BatchMeasurement {
  readonly trainFailed: readonly string[];
  readonly trainPassed: readonly string[];
  readonly validationPassed: number;
  readonly validationTotal: number;
}

export interface BatchRequest {
  readonly targets: readonly BatchTarget[];
}

export interface BatchResult<Fingerprint> {
  readonly fingerprint: Fingerprint;
  readonly reader: string;
  readonly schemaVersion: 1;
  readonly targets: readonly {
    readonly candidates: readonly BatchCandidateResult[];
    readonly document: string;
    readonly setSha256: string;
  }[];
}

export interface BatchTarget {
  readonly candidates: readonly {
    readonly id: string;
    readonly intents?: readonly Intent[];
    readonly source?: string;
  }[];
  readonly document: string;
}

interface LoadedTarget {
  readonly current: string;
  readonly querySet: TriggerQuerySet;
  readonly setSha256: string;
}

interface MadeCandidate {
  readonly entry: Prepared;
  readonly items: readonly object[];
}

interface Prepared {
  readonly answersPath: string;
  readonly candidateId: string;
  readonly document: string;
  readonly intent?: {
    readonly afterAnswers: string;
    readonly beforeAnswers: string;
    readonly intents: readonly Intent[];
  };
  readonly querySet: TriggerQuerySet;
  readonly rawRepliesPath: string;
  readonly setSha256: string;
  readonly sourceSha256: string;
  readonly suggestionsPath: string;
}

export const MAX_BATCH_CANDIDATES = 3;

const areIntents = (value: unknown): boolean =>
  value === undefined
  || (Array.isArray(value)
    && value.length <= MAX_INTENTS
    && value.every(isIntent)
    && new Set(value.map((intent: Intent) => intent.id)).size === value.length);

const expectedOf = (querySet: TriggerQuerySet): Record<string, string> =>
  Object.fromEntries(
    querySet.queries
      .filter(
        (query) =>
          query.split === 'train' && query.retired === undefined && query.expected !== undefined,
      )
      .map((query) => [query.id, query.expected as string]),
  );

const intentItems = async (
  base: string,
  intents: readonly Intent[],
  texts: { readonly after: string; readonly before: string },
  deps: BatchDeps,
): Promise<{
  readonly afterAnswers: string;
  readonly beforeAnswers: string;
  readonly items: object[];
}> => {
  const querySet = intentQuerySet(intents);
  const sides = [
    ['before', texts.before],
    ['after', texts.after],
  ] as const;
  const items: object[] = [];
  for (const [side, text] of sides) {
    await deps.writeText(
      `${base}.intent-${side}.bundle.json`,
      JSON.stringify(blindDocumentBundleFor(querySet, text)),
    );
    items.push({
      answersPath: `${base}.intent-${side}.answers.jsonl`,
      bundlePath: `${base}.intent-${side}.bundle.json`,
    });
  }
  return {
    afterAnswers: `${base}.intent-after.answers.jsonl`,
    beforeAnswers: `${base}.intent-before.answers.jsonl`,
    items,
  };
};

const intentResultsOf = async (
  entry: Prepared,
  deps: BatchDeps,
): Promise<readonly IntentResult[]> => {
  if (entry.intent === undefined) {
    return [];
  }
  const before = await deps.readText(entry.intent.beforeAnswers);
  const after = await deps.readText(entry.intent.afterAnswers);
  if (before === undefined || after === undefined) {
    throw new Error(
      `The reader wrote no intent answers for ${entry.document} (${entry.candidateId}).`,
    );
  }
  return scoreIntents(entry.intent.intents, { after, before });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCandidate = (value: unknown): value is BatchTarget['candidates'][number] =>
  isRecord(value)
  && typeof value.id === 'string'
  && value.id.trim().length > 0
  && (value.source === undefined || typeof value.source === 'string')
  && areIntents(value.intents);

const isTarget = (value: unknown): value is BatchTarget =>
  isRecord(value)
  && typeof value.document === 'string'
  && !path.isAbsolute(value.document)
  && !value.document.split('/').includes('..')
  && Array.isArray(value.candidates)
  && value.candidates.length >= 1
  && value.candidates.length <= MAX_BATCH_CANDIDATES
  && value.candidates.every(isCandidate)
  && new Set(value.candidates.map((candidate: { id: string }) => candidate.id)).size
    === value.candidates.length;

const jsonLines = (text: string | undefined): readonly Record<string, string>[] =>
  (text ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string>);

const loadTarget = async (
  document: string,
  deps: BatchDeps,
  hooks: BatchHooks<unknown>,
): Promise<LoadedTarget> => {
  const gate = hooks.targetOf(document);
  if (gate.skill !== undefined) {
    throw new Error(`evaluate-batch scores comprehension documents, not routing: ${document}`);
  }
  const setText = await deps.readText(path.join(deps.agentsRoot, gate.setPath));
  const current = await deps.readText(path.join(deps.agentsRoot, document));
  if (setText === undefined || current === undefined) {
    throw new Error(`Missing document or comprehension set for ${document}.`);
  }
  const querySet = parseTriggerQuerySet(setText, gate.setPath);
  if (querySet.kind !== 'comprehension') {
    throw new Error(`${gate.setPath} is not a comprehension set.`);
  }
  return { current, querySet, setSha256: deps.sha256(setText) };
};

const mapOf = (
  rows: readonly Record<string, string>[],
  key: string,
  value: (row: Record<string, string>) => string | undefined,
): Map<string, string> => new Map(rows.map((row) => [row[key] ?? '', value(row) ?? '']));

const failuresFor = async (
  entry: Prepared,
  measurement: BatchMeasurement,
  deps: BatchDeps,
): Promise<readonly BatchFailure[]> => {
  const answers = jsonLines(await deps.readText(entry.answersPath));
  const given = mapOf(answers, 'query_id', (row) => row.answer ?? row.skill_name);
  const raw = mapOf(
    jsonLines(await deps.readText(entry.rawRepliesPath)),
    'query_id',
    (row) => row.raw_reply,
  );
  const suggestions = mapOf(
    jsonLines(await deps.readText(entry.suggestionsPath)),
    'id',
    (row) => row.suggestion,
  );
  return measurement.trainFailed.map((id) => {
    const probe = entry.querySet.queries.find((query) => query.id === id);
    return {
      expected: probe?.expected ?? '',
      given: given.get(id) ?? '',
      id,
      query: probe?.query ?? '',
      rawReply: raw.get(id),
      suggestion: suggestions.get(id),
    };
  });
};

export const parseBatchRequest = (content: string): BatchRequest => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('The evaluate-batch request is not valid JSON.');
  }
  const targets = isRecord(parsed) ? parsed.targets : undefined;
  if (
    !isRecord(parsed)
    || parsed.schemaVersion !== 1
    || !Array.isArray(targets)
    || targets.length === 0
    || !targets.every(isTarget)
    || new Set(targets.map((target: BatchTarget) => target.document)).size !== targets.length
  ) {
    throw new Error(
      `The evaluate-batch request needs schemaVersion 1 and unique relative documents, each with 1 to ${MAX_BATCH_CANDIDATES} uniquely named candidates.`,
    );
  }
  return { targets } as BatchRequest;
};

const prepareCandidate = async (
  base: string,
  document: string,
  candidate: BatchTarget['candidates'][number],
  loaded: LoadedTarget,
  deps: BatchDeps,
): Promise<MadeCandidate> => {
  const source = candidate.source ?? loaded.current;
  const intents = candidate.intents ?? [];
  const planned =
    intents.length > 0
      ? await intentItems(base, intents, { after: source, before: loaded.current }, deps)
      : undefined;
  const entry: Prepared = {
    answersPath: `${base}.answers.jsonl`,
    candidateId: candidate.id,
    document,
    intent: planned && {
      afterAnswers: planned.afterAnswers,
      beforeAnswers: planned.beforeAnswers,
      intents,
    },
    querySet: loaded.querySet,
    rawRepliesPath: `${base}.raw.jsonl`,
    setSha256: loaded.setSha256,
    sourceSha256: deps.sha256(source),
    suggestionsPath: `${base}.suggestions.jsonl`,
  };
  await deps.writeText(
    `${base}.bundle.json`,
    JSON.stringify(blindDocumentBundleFor(loaded.querySet, source)),
  );
  const item = {
    answersPath: entry.answersPath,
    bundlePath: `${base}.bundle.json`,
    expected: expectedOf(loaded.querySet),
    rawRepliesPath: entry.rawRepliesPath,
    suggestionsPath: entry.suggestionsPath,
  };
  return { entry, items: [item, ...(planned?.items ?? [])] };
};

const prepareTarget = async (
  target: BatchTarget,
  offset: number,
  work: string,
  deps: BatchDeps,
  hooks: BatchHooks<unknown>,
): Promise<readonly MadeCandidate[]> => {
  const loaded = await loadTarget(target.document, deps, hooks);
  const made: MadeCandidate[] = [];
  for (const candidate of target.candidates) {
    const base = path.join(work, `${offset + made.length}`);
    made.push(await prepareCandidate(base, target.document, candidate, loaded, deps));
  }
  return made;
};

const scoreOf = async (
  entry: Prepared,
  deps: BatchDeps,
  hooks: BatchHooks<unknown>,
): Promise<BatchCandidateResult> => {
  const answers = await deps.readText(entry.answersPath);
  if (answers === undefined) {
    throw new Error(`The reader wrote no answers for ${entry.document} (${entry.candidateId}).`);
  }
  const scored = measurementFromRecords(entry.querySet, parseResponses(answers, entry.answersPath));
  const measurement = hooks.measurementOf(
    JSON.stringify({ measurement: editorMeasurementOf(scored) }),
  );
  return {
    failures: await failuresFor(entry, measurement, deps),
    id: entry.candidateId,
    intents: await intentResultsOf(entry, deps),
    measurement,
    passed: Object.fromEntries(scored.perQuery.map((query) => [query.id, query.passed])),
    sourceSha256: entry.sourceSha256,
  };
};

export const evaluateBatch = async <Fingerprint>(
  requestText: string,
  deps: BatchDeps,
  hooks: BatchHooks<Fingerprint>,
): Promise<BatchResult<Fingerprint>> => {
  const request = parseBatchRequest(requestText);
  const work = await deps.makeTempDir();
  const made: MadeCandidate[] = [];
  for (const target of request.targets) {
    made.push(...(await prepareTarget(target, made.length, work, deps, hooks)));
  }
  const manifestPath = path.join(work, 'batch.json');
  await deps.writeText(manifestPath, JSON.stringify({ items: made.flatMap(({ items }) => items) }));
  const read = await deps.executor({
    args: [path.join(deps.toolsRoot, 'scripts', 'weak-reader', 'index.ts'), 'batch', manifestPath],
    command: 'bun',
    timeoutMs: 40 * 60 * 1000,
  });
  if (read.code !== 0) {
    const hint = isNoAdapterFailure(read.stdout)
      ? ' (no GPU adapter: run this command outside the sandbox)'
      : '';
    const details = read.stderr.trim() || read.stdout.trim();
    throw new Error(`weak reader exited ${read.code}${hint}: ${details.slice(-300)}`);
  }
  const results = await Promise.all(made.map(({ entry }) => scoreOf(entry, deps, hooks)));
  return {
    fingerprint: hooks.fingerprint(),
    reader: read.stderr.trim(),
    schemaVersion: 1,
    targets: request.targets.map((target) => ({
      candidates: results.filter((_, index) => made[index]?.entry.document === target.document),
      document: target.document,
      setSha256:
        made.find(({ entry }) => entry.document === target.document)?.entry.setSha256 ?? '',
    })),
  };
};
