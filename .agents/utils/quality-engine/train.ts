import { join } from 'node:path';
import matter from 'gray-matter';

import type { FileSystem } from '../filesystem.js';
import { readText, writeText } from '../filesystem.js';
import { fingerprint } from './packet.js';
import type {
  ResponderProblem,
  ResponderResult,
  RouterPrompt,
  SkillCatalogEntry,
} from './provider.js';
import { askRouter, routerPromptFor } from './provider.js';
import { LedgerError, MeasurementError, TriggerQuerySetError } from './train-errors.js';

export type BoundaryCall = (prompt: RouterPrompt) => Promise<string>;

export interface GateDecision {
  readonly baseline: LedgerEntry;
  readonly candidate: { readonly attempt: number; readonly sourceFingerprint: string };
  readonly decision: 'accepted' | 'blocked';
  readonly reason: string;
}

export interface LedgerEntry extends LedgerEntryInput {
  readonly id: string;
}

export interface LedgerEntryInput {
  readonly attempt: number;
  readonly boundary: string;
  readonly matrixFingerprint: string;
  readonly measurement: TriggerMeasurement;
  readonly sourceFingerprint: string;
  readonly status: LedgerStatus;
  readonly timestamp: string;
}

export type LedgerStatus =
  | 'applied'
  | 'attempt'
  | 'baseline'
  | 'blocked'
  | 'post-change'
  | 'rollback';

export type MeasurementOutcome =
  | { readonly measurement: TriggerMeasurement; readonly status: 'measured' }
  | ({ readonly status: 'blocked' } & ResponderProblem);

export interface PerQueryRate {
  readonly hits: number;
  readonly id: string;
  readonly passed: boolean;
  readonly rate: number;
  readonly runs: number;
  readonly shouldTrigger: boolean;
  readonly split: QuerySplit;
}

interface QuerySetEnvelope {
  readonly passThreshold: number;
  readonly queries: unknown[];
  readonly runsPerQuery: number;
  readonly skillName: string;
  readonly splits: Readonly<Record<string, string>>;
}

export type QuerySplit = 'train' | 'validation';

export interface RouterAnswerRecord {
  readonly queryId: string;
  readonly run: number;
  readonly skillName: string;
}

export interface SplitScore {
  readonly passedQueries: number;
  readonly score: number;
  readonly totalQueries: number;
}

interface StringScanner {
  escaped: boolean;
  inString: boolean;
}

export interface TriggerMeasurement {
  readonly boundary: string;
  readonly passThreshold: number;
  readonly perQuery: readonly PerQueryRate[];
  readonly runsPerQuery: number;
  readonly skillName: string;
  readonly train: SplitScore;
  readonly validation: SplitScore;
}

export interface TriggerQuery {
  readonly id: string;
  readonly query: string;
  readonly shouldTrigger: boolean;
  readonly split: QuerySplit;
}

export interface TriggerQuerySet {
  readonly passThreshold: number;
  readonly queries: readonly TriggerQuery[];
  readonly runsPerQuery: number;
  readonly skillName: string;
  readonly sourcePath: string;
  readonly splits: Readonly<Record<string, string>>;
}

export { LedgerError, MeasurementError, TriggerQuerySetError };

const IN_SESSION_BOUNDARY = 'in-session';

const querySplits: Readonly<Record<QuerySplit, true>> = { train: true, validation: true };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const lineFor = (content: string, index: number): number =>
  content.slice(0, Math.max(index, 0)).split('\n').length;

const nonEmptyString = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '';

const structuralCharacters = new Set([
  '{',
  '}',
  '[',
  ']',
  ',',
  ':',
  '.',
  '"',
  '-',
  '+',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  ' ',
  '\t',
  '\n',
  '\r',
  't',
  'r',
  'u',
  'e',
  'f',
  'a',
  'l',
  's',
  'n',
]);

export const baselineEntryFor = (entries: readonly LedgerEntry[]): LedgerEntry | undefined =>
  entries.find(({ status }) => status === 'baseline');

export const decideNeverWorseGate = (
  baseline: LedgerEntry,
  candidate: LedgerEntryInput,
): GateDecision => {
  const compared = { attempt: candidate.attempt, sourceFingerprint: candidate.sourceFingerprint };
  const strictlyBetterTrain = candidate.measurement.train.score > baseline.measurement.train.score;
  const validationFloor =
    candidate.measurement.validation.score >= baseline.measurement.validation.score;
  if (strictlyBetterTrain && validationFloor) {
    return {
      baseline,
      candidate: compared,
      decision: 'accepted',
      reason: `Train ${candidate.measurement.train.score} > baseline ${baseline.measurement.train.score} and validation ${candidate.measurement.validation.score} >= baseline ${baseline.measurement.validation.score}.`,
    };
  }
  return {
    baseline,
    candidate: compared,
    decision: 'blocked',
    reason: strictlyBetterTrain
      ? `Train ${candidate.measurement.train.score} > baseline ${baseline.measurement.train.score} but validation ${candidate.measurement.validation.score} < baseline ${baseline.measurement.validation.score}.`
      : `Train ${candidate.measurement.train.score} <= baseline ${baseline.measurement.train.score}.`,
  };
};

const envelopeFor = (parsed: Record<string, unknown>, sourcePath: string): QuerySetEnvelope => {
  const skillName = nonEmptyString(parsed.skill_name);
  const queries = parsed.queries;
  if (!skillName || !Array.isArray(queries) || queries.length === 0) {
    throw new TriggerQuerySetError(
      `${sourcePath}: a trigger query set requires a skill name and a nonempty query array.`,
    );
  }
  const runsPerQuery = parsed.runs_per_query;
  if (typeof runsPerQuery !== 'number' || !Number.isSafeInteger(runsPerQuery) || runsPerQuery < 3) {
    throw new TriggerQuerySetError(
      `${sourcePath}: runs_per_query must be an integer of at least 3.`,
    );
  }
  const passThreshold = parsed.pass_threshold;
  if (typeof passThreshold !== 'number' || passThreshold <= 0 || passThreshold >= 1) {
    throw new TriggerQuerySetError(
      `${sourcePath}: pass_threshold must be a number strictly between 0 and 1.`,
    );
  }
  const splits = parsed.splits;
  if (
    splits !== undefined
    && (!isRecord(splits) || Object.values(splits).some((value) => typeof value !== 'string'))
  ) {
    throw new TriggerQuerySetError(
      `${sourcePath}: splits must map split names to nonempty guidance strings.`,
    );
  }
  return {
    passThreshold,
    queries,
    runsPerQuery,
    skillName,
    splits: (splits ?? {}) as Readonly<Record<string, string>>,
  };
};

const frontmatterString = (parsed: matter.GrayMatterFile<string>, key: string): string => {
  const value = (parsed.data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
};

export const buildSkillCatalog = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  skillsRoot: string,
): Promise<readonly SkillCatalogEntry[]> => {
  const readdir = fileSystem.readdir;
  if (!readdir) {
    throw new MeasurementError('Skill catalog discovery requires directory listing support.');
  }
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const catalogs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillFile = join(skillsRoot, entry.name, 'SKILL.md');
        try {
          const parsed = matter(await fileSystem.readFile(skillFile, 'utf8'));
          const name = frontmatterString(parsed, 'name') || entry.name;
          const description = frontmatterString(parsed, 'description');
          return { description, name };
        } catch {
          return undefined;
        }
      }),
  );
  const catalog = catalogs.filter((entry): entry is SkillCatalogEntry => entry !== undefined);
  return catalog.sort((left, right) => left.name.localeCompare(right.name, 'en'));
};

export const ledgerPathFor = (ledgerRoot: string, skillName: string): string =>
  join(ledgerRoot, `${skillName}.json`);

export const matrixFingerprintForQuerySet = (querySet: TriggerQuerySet): string =>
  fingerprint({
    passThreshold: querySet.passThreshold,
    queries: querySet.queries
      .map(({ id, query, shouldTrigger, split }) => ({ id, query, shouldTrigger, split }))
      .sort((left, right) => left.id.localeCompare(right.id, 'en')),
    runsPerQuery: querySet.runsPerQuery,
    skillName: querySet.skillName,
  });

export const parseResponses = (
  content: string,
  sourcePath: string,
): readonly RouterAnswerRecord[] => {
  const records = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new MeasurementError(`${sourcePath}:${index + 1} is not valid JSON.`);
      }
      if (!isRecord(parsed)) {
        throw new MeasurementError(`${sourcePath}:${index + 1} is not a router answer object.`);
      }
      const queryId = nonEmptyString(parsed.query_id ?? parsed.id);
      const skillName = nonEmptyString(parsed.skill_name ?? parsed.answer);
      const run = parsed.run;
      if (!queryId || !skillName || typeof run !== 'number' || !Number.isSafeInteger(run)) {
        throw new MeasurementError(
          `${sourcePath}:${index + 1} requires query_id, run, and skill_name fields.`,
        );
      }
      return { queryId, run, skillName };
    });
  const seen = new Set<string>();
  for (const record of records) {
    const key = `${record.queryId}#${record.run}`;
    if (seen.has(key)) {
      throw new MeasurementError(`${sourcePath}: duplicate router answer ${key}.`);
    }
    seen.add(key);
  }
  return records;
};

export const loadResponses = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  path: string,
): Promise<readonly RouterAnswerRecord[]> => {
  try {
    return parseResponses(await fileSystem.readFile(path, 'utf8'), path);
  } catch (error) {
    if (error instanceof MeasurementError) {
      throw error;
    }
    throw new MeasurementError(
      `${path}: the router responses file is missing; no fabricated answers are accepted.`,
    );
  }
};

export const plansIndexFor = (agentsRoot: string): string =>
  agentsRoot.replace(/^\/+/u, '').replaceAll('/', '-');

export const defaultLedgerRootFor = (agentsRoot: string): string =>
  join(agentsRoot, 'plans', plansIndexFor(agentsRoot), 'quality');

export const promptsFor = (querySet: TriggerQuerySet, catalog: readonly SkillCatalogEntry[]) =>
  querySet.queries.flatMap((triggerQuery) =>
    Array.from({ length: querySet.runsPerQuery }, (_, runIndex) => ({
      prompt: routerPromptFor(triggerQuery.query, catalog),
      queryId: triggerQuery.id,
      run: runIndex + 1,
    })),
  );

const queryPassed = (rate: number, shouldTrigger: boolean, passThreshold: number): boolean =>
  shouldTrigger ? rate >= passThreshold : rate < passThreshold;

const rateFor = (hits: number, runs: number): number => (runs === 0 ? 0 : hits / runs);

export const measurementFromRecords = (
  querySet: TriggerQuerySet,
  records: readonly RouterAnswerRecord[],
  boundary: string = IN_SESSION_BOUNDARY,
): TriggerMeasurement => {
  const byQuery = new Map<string, RouterAnswerRecord[]>();
  for (const record of records) {
    const existing = byQuery.get(record.queryId);
    if (existing) {
      existing.push(record);
    } else {
      byQuery.set(record.queryId, [record]);
    }
  }
  const perQuery: PerQueryRate[] = querySet.queries.map((triggerQuery) => {
    const queryRecords = (byQuery.get(triggerQuery.id) ?? []).filter(
      (record) => Number.isSafeInteger(record.run) && record.run >= 1,
    );
    const hits = queryRecords.filter((record) => record.skillName === querySet.skillName).length;
    const runs = queryRecords.length;
    const rate = rateFor(hits, runs);
    return {
      hits,
      id: triggerQuery.id,
      passed: queryPassed(rate, triggerQuery.shouldTrigger, querySet.passThreshold),
      rate,
      runs,
      shouldTrigger: triggerQuery.shouldTrigger,
      split: triggerQuery.split,
    };
  });
  const missingRuns = querySet.queries.flatMap((triggerQuery, index) => {
    const runs = perQuery[index]?.runs ?? 0;
    return runs === querySet.runsPerQuery
      ? []
      : [`${triggerQuery.id} has ${runs} of ${querySet.runsPerQuery} runs`];
  });
  if (missingRuns.length > 0) {
    throw new MeasurementError(`Incomplete router answers: ${missingRuns.join('; ')}.`);
  }
  const splitQueries = perQuery.filter(({ split }) => split === 'train');
  const validationQueries = perQuery.filter(({ split }) => split === 'validation');
  if (splitQueries.length === 0 || validationQueries.length === 0) {
    throw new MeasurementError('A trigger query set requires train and validation queries.');
  }
  const scoreFor = (values: readonly PerQueryRate[]): SplitScore => ({
    passedQueries: values.filter(({ passed }) => passed).length,
    score: values.filter(({ passed }) => passed).length / values.length,
    totalQueries: values.length,
  });
  return {
    boundary,
    passThreshold: querySet.passThreshold,
    perQuery,
    runsPerQuery: querySet.runsPerQuery,
    skillName: querySet.skillName,
    train: scoreFor(splitQueries),
    validation: scoreFor(validationQueries),
  };
};

export const measureTriggerBehavior = async (
  querySet: TriggerQuerySet,
  catalog: readonly SkillCatalogEntry[],
  boundary: BoundaryCall,
): Promise<MeasurementOutcome> => {
  const records: RouterAnswerRecord[] = [];
  for (const { prompt, queryId, run } of promptsFor(querySet, catalog)) {
    const result: ResponderResult = await askRouter(prompt, boundary);
    if (result.status !== 'answered') {
      return { ...result, status: 'blocked' as const };
    }
    records.push({ queryId, run, skillName: result.skillName });
  }
  return { measurement: measurementFromRecords(querySet, records), status: 'measured' };
};

export const readLedger = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  path: string,
): Promise<readonly LedgerEntry[]> => {
  let content: string;
  try {
    content = await fileSystem.readFile(path, 'utf8');
  } catch {
    return [];
  }
  return content
    .split('\n')
    .map((line, lineNumber) => ({ line: line.trim(), lineNumber: lineNumber + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNumber }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new LedgerError(`${path}:${lineNumber} is not valid JSON.`);
      }
      if (!isRecord(parsed) || typeof parsed.id !== 'string' || !parsed.id.trim()) {
        throw new LedgerError(`${path}:${lineNumber} is not a ledger entry with an id.`);
      }
      return parsed as unknown as LedgerEntry;
    });
};

export const appendLedgerEntry = async (
  fileSystem: FileSystem,
  path: string,
  input: LedgerEntryInput,
): Promise<LedgerEntry> => {
  const entries = await readLedger(fileSystem, path);
  const entry: LedgerEntry = {
    ...input,
    id: `${input.measurement.skillName}-${input.status}-${entries.length + 1}`,
  };
  const existing = await readText(fileSystem, path).catch(() => '');
  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  await writeText(fileSystem, path, `${existing}${separator}${JSON.stringify(entry)}\n`);
  return entry;
};

const scanStringChar = (scanner: StringScanner, character: string): void => {
  if (scanner.escaped) {
    scanner.escaped = false;
    return;
  }
  if (character === '\\') {
    scanner.escaped = true;
    return;
  }
  if (character === '"') {
    scanner.inString = false;
  }
};

const invalidTokenLine = (content: string): number | undefined => {
  const scanner: StringScanner = { escaped: false, inString: false };
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? '';
    if (scanner.inString) {
      scanStringChar(scanner, character);
      continue;
    }
    if (character === '"') {
      scanner.inString = true;
      continue;
    }
    if (!structuralCharacters.has(character)) {
      return lineFor(content, index);
    }
  }
  return undefined;
};

const jsonErrorLine = (content: string): number => invalidTokenLine(content) ?? 1;

const parseJson = (content: string, sourcePath: string): Record<string, unknown> => {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TriggerQuerySetError(
      `${sourcePath}:${jsonErrorLine(content)} is not valid JSON: ${message}`,
    );
  }
};

export const selectWinningAttempt = (
  entries: readonly LedgerEntry[],
  baseline: LedgerEntry,
): LedgerEntry | undefined => {
  const attempts = entries.filter(({ status }) => status === 'attempt');
  const accepted = attempts
    .map((entry) => ({ decision: decideNeverWorseGate(baseline, entry), entry }))
    .filter(({ decision }) => decision.decision === 'accepted')
    .map(({ entry }) => entry);
  return accepted.sort(
    (left, right) =>
      right.measurement.validation.score - left.measurement.validation.score
      || left.attempt - right.attempt,
  )[0];
};

const triggerQueryFrom = (
  entry: unknown,
  index: number,
  sourcePath: string,
  seenIds: ReadonlySet<string>,
): TriggerQuery => {
  const position = index + 1;
  if (!isRecord(entry)) {
    throw new TriggerQuerySetError(`${sourcePath}: query ${position} is not an object.`);
  }
  const id = nonEmptyString(entry.id);
  const query = nonEmptyString(entry.query);
  const shouldTrigger = entry.should_trigger;
  if (!id || !query || typeof shouldTrigger !== 'boolean') {
    throw new TriggerQuerySetError(
      `${sourcePath}: query ${position} requires an id, a query string, and a boolean should_trigger.`,
    );
  }
  if (seenIds.has(id)) {
    throw new TriggerQuerySetError(`${sourcePath}: duplicate query id ${id}.`);
  }
  const split = entry.split;
  if (typeof split !== 'string' || !Object.hasOwn(querySplits, split)) {
    throw new TriggerQuerySetError(
      `${sourcePath}: query ${id} uses an unknown split ${String(split)}; expected train or validation.`,
    );
  }
  return { id, query, shouldTrigger, split: split as QuerySplit };
};

export const parseTriggerQuerySet = (content: string, sourcePath: string): TriggerQuerySet => {
  const parsed = parseJson(content, sourcePath);
  const envelope = envelopeFor(parsed, sourcePath);
  const ids = new Set<string>();
  const queries = envelope.queries.map((entry, index) => {
    const triggerQuery = triggerQueryFrom(entry, index, sourcePath, ids);
    ids.add(triggerQuery.id);
    return triggerQuery;
  });
  return { ...envelope, queries, sourcePath };
};

export const loadTriggerQuerySet = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  path: string,
): Promise<TriggerQuerySet> => {
  let content: string;
  try {
    content = await fileSystem.readFile(path, 'utf8');
  } catch {
    throw new TriggerQuerySetError(
      `${path}: the trigger query set is missing; no fabricated query set is accepted.`,
    );
  }
  return parseTriggerQuerySet(content, path);
};
