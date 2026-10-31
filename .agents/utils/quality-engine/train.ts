import { join } from 'node:path';
import matter from 'gray-matter';

import type { FileSystem } from '../filesystem.js';
import { readText, writeText } from '../filesystem.js';
import type { MatrixCase } from './matrix.js';
import { casesFor, evaluateMatrix } from './matrix.js';
import { fingerprint } from './packet.js';
import type {
  ResponderProblem,
  ResponderResult,
  RouterPrompt,
  SkillCatalogEntry,
} from './provider.js';
import {
  askRouter,
  DOCUMENT_INSTRUCTIONS,
  ROUTER_INSTRUCTIONS,
  routerPromptFor,
} from './provider.js';
import { LedgerError, MeasurementError, TriggerQuerySetError } from './train-errors.js';

export interface BlindBundle {
  readonly boundary: string;
  readonly catalog: readonly SkillCatalogEntry[];
  readonly instructions: string;
  readonly prompts: readonly BlindPrompt[];
  readonly responseContract: string;
}

export interface BlindDocumentBundle {
  readonly boundary: string;
  readonly document: string;
  readonly instructions: string;
  readonly prompts: readonly BlindPrompt[];
  readonly responseContract: string;
}

export interface BlindPrompt {
  readonly query: string;
  readonly query_id: string;
  readonly run: number;
}

export type BoundaryCall = (prompt: RouterPrompt) => Promise<string>;

export interface EditorMeasurement {
  readonly boundary: string;
  readonly clear: boolean;
  readonly runsPerQuery: number;
  readonly skillName: string;
  readonly train: SplitScore;
  readonly trainQueries: readonly PerQueryRate[];
  readonly validation: SplitScore;
  readonly validationFailures: number;
}

export interface GateDecision {
  readonly candidate: { readonly attempt: number; readonly sourceFingerprint: string };
  readonly decision: 'accepted' | 'blocked';
  readonly gained: SplitCounts;
  readonly reason: string;
  readonly regressed: SplitCounts;
}

export interface GateOptions {
  readonly hardFailure?: string;
  readonly requireGain: boolean;
}

export interface LedgerEntry extends LedgerEntryInput {
  readonly id: string;
}

export interface LedgerEntryInput {
  readonly attempt: number;
  readonly boundary: string;
  readonly hardFailure?: string;
  readonly matrixFingerprint: string;
  readonly measurement: TriggerMeasurement;
  readonly rejected?: RejectedEdit;
  readonly sourceFingerprint: string;
  readonly status: LedgerStatus;
  readonly timestamp: string;
}

export type LedgerStatus = 'applied' | 'attempt' | 'baseline' | 'post-change' | 'rollback';

export type MeasurementOutcome =
  | { readonly measurement: TriggerMeasurement; readonly status: 'measured' }
  | ({ readonly status: 'blocked' } & ResponderProblem);

export interface PerQueryRate {
  readonly detail?: string;
  readonly hits: number;
  readonly id: string;
  readonly passed: boolean;
  readonly rate: number;
  readonly runs: number;
  readonly shouldTrigger: boolean;
  readonly split: QuerySplit;
  readonly unstable: boolean;
}

interface QuerySetEnvelope {
  readonly kind: QuerySetKind;
  readonly queries: unknown[];
  readonly runsPerQuery: number;
  readonly skillName: string;
  readonly splits: Readonly<Record<string, string>>;
  readonly target?: string;
}

export type QuerySetKind = 'comprehension' | 'routing';

export type QuerySplit = 'train' | 'validation';

export interface RejectedEdit {
  readonly changeSummary: string;
  readonly gainedIds: readonly string[];
  readonly reason: string;
  readonly regressedIds: readonly string[];
}

export interface RouterAnswerRecord {
  readonly queryId: string;
  readonly run: number;
  readonly skillName: string;
}

export interface SplitCounts {
  readonly train: number;
  readonly validation: number;
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
  readonly perQuery: readonly PerQueryRate[];
  readonly runsPerQuery: number;
  readonly skillName: string;
  readonly train: SplitScore;
  readonly validation: SplitScore;
}

export interface TriggerQuery {
  readonly expected?: string;
  readonly id: string;
  readonly query: string;
  readonly retired?: string;
  readonly shouldTrigger: boolean;
  readonly split: QuerySplit;
}

export interface TriggerQuerySet {
  readonly kind: QuerySetKind;
  readonly queries: readonly TriggerQuery[];
  readonly runsPerQuery: number;
  readonly skillName: string;
  readonly sourcePath: string;
  readonly splits: Readonly<Record<string, string>>;
  readonly target?: string;
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

const NO_COUNTS: SplitCounts = { train: 0, validation: 0 };

export const activeQueriesOf = (querySet: TriggerQuerySet): readonly TriggerQuery[] =>
  querySet.queries.filter(({ retired }) => retired === undefined);

const answerLetterOf = (raw: string): string =>
  raw
    .trim()
    .replace(/^[\s"'`*([]+|[\s"'`*)\].:]+$/gu, '')
    .toUpperCase();

export const baselineEntryFor = (entries: readonly LedgerEntry[]): LedgerEntry | undefined =>
  entries.findLast(({ status }) => status === 'baseline');

const blindPromptsFor = (querySet: TriggerQuerySet): readonly BlindPrompt[] =>
  activeQueriesOf(querySet).flatMap(({ id, query }) =>
    Array.from({ length: querySet.runsPerQuery }, (_, runIndex) => ({
      query,
      query_id: id,
      run: runIndex + 1,
    })),
  );

export const blindBundleFor = (
  querySet: TriggerQuerySet,
  catalog: readonly SkillCatalogEntry[],
): BlindBundle => ({
  boundary: IN_SESSION_BOUNDARY,
  catalog,
  instructions: ROUTER_INSTRUCTIONS,
  prompts: blindPromptsFor(querySet),
  responseContract: 'one JSON object per line with query_id, run, and skill_name fields',
});

export const blindDocumentBundleFor = (
  querySet: TriggerQuerySet,
  document: string,
): BlindDocumentBundle => ({
  boundary: IN_SESSION_BOUNDARY,
  document,
  instructions: DOCUMENT_INSTRUCTIONS,
  prompts: blindPromptsFor(querySet),
  responseContract: 'one JSON object per line with query_id, run, and answer fields',
});

const comprehensionAnswerFrom = (
  entry: Record<string, unknown>,
  id: string,
  query: string,
  sourcePath: string,
  kind: QuerySetKind,
): string | undefined => {
  if (kind === 'routing') {
    return undefined;
  }
  const expected = entry.expected;
  if (
    typeof expected !== 'string'
    || !/^[A-F]$/u.test(expected)
    || !new RegExp(`(?:^|\\n)${expected}\\)`, 'u').test(query)
  ) {
    throw new TriggerQuerySetError(
      `${sourcePath}: probe ${id} needs an expected letter A-F that matches a lettered option line such as "B) ..." in its query.`,
    );
  }
  return expected;
};

const countBySplit = (queries: readonly PerQueryRate[]): SplitCounts => ({
  train: queries.filter(({ split }) => split === 'train').length,
  validation: queries.filter(({ split }) => split === 'validation').length,
});

export const decideRollbackGate = (
  baseline: LedgerEntry,
  candidate: LedgerEntryInput,
): GateDecision => {
  const restored = candidate.sourceFingerprint === baseline.sourceFingerprint;
  return {
    candidate: { attempt: candidate.attempt, sourceFingerprint: candidate.sourceFingerprint },
    decision: restored ? 'accepted' : 'blocked',
    gained: NO_COUNTS,
    reason: restored
      ? 'The restored source matches the baseline snapshot.'
      : 'The restored source differs from the baseline snapshot; copy the baseline snapshot back.',
    regressed: NO_COUNTS,
  };
};

const describeCounts = ({ train, validation }: SplitCounts): string =>
  `train ${train}, validation ${validation}`;

export const editorMeasurementOf = (measurement: TriggerMeasurement): EditorMeasurement => ({
  boundary: measurement.boundary,
  clear: measurement.perQuery.every(({ passed }) => passed),
  runsPerQuery: measurement.runsPerQuery,
  skillName: measurement.skillName,
  train: measurement.train,
  trainQueries: measurement.perQuery.filter(({ split }) => split === 'train'),
  validation: measurement.validation,
  validationFailures: measurement.perQuery.filter(
    ({ passed, split }) => split === 'validation' && !passed,
  ).length,
});

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

export const candidateDescriptionOf = (skillSource: string): string =>
  frontmatterString(matter(skillSource), 'description');

const hitFor = (
  querySet: TriggerQuerySet,
  triggerQuery: TriggerQuery,
  record: RouterAnswerRecord,
): boolean =>
  querySet.kind === 'comprehension'
    ? answerLetterOf(record.skillName) === triggerQuery.expected
    : record.skillName === querySet.skillName;

const kindFrom = (
  parsed: Record<string, unknown>,
  sourcePath: string,
): { readonly kind: QuerySetKind; readonly target?: string } => {
  const kind = parsed.kind ?? 'routing';
  if (kind !== 'routing' && kind !== 'comprehension') {
    throw new TriggerQuerySetError(`${sourcePath}: kind must be routing or comprehension.`);
  }
  const target = parsed.target;
  if (kind === 'routing') {
    return { kind };
  }
  if (typeof target !== 'string' || !target.trim()) {
    throw new TriggerQuerySetError(
      `${sourcePath}: a comprehension set requires a target path relative to the set file.`,
    );
  }
  return { kind, target };
};

export const ledgerPathFor = (ledgerRoot: string, skillName: string): string =>
  join(ledgerRoot, `${skillName}.json`);

const letterSpreadProblems = (inSplit: readonly TriggerQuery[], split: string): string[] => {
  const counts = new Map<string, number>();
  for (const { expected } of inSplit) {
    counts.set(expected ?? '', (counts.get(expected ?? '') ?? 0) + 1);
  }
  return inSplit.length >= 4 && Math.max(...counts.values()) * 2 > inSplit.length
    ? [`Split ${split} uses one answer letter for more than half of its probes.`]
    : [];
};

export const matrixFingerprintForQuerySet = (querySet: TriggerQuerySet): string =>
  fingerprint({
    kind: querySet.kind,
    queries: querySet.queries
      .map(({ expected, id, query, retired, shouldTrigger, split }) => ({
        expected,
        id,
        query,
        retired,
        shouldTrigger,
        split,
      }))
      .sort((left, right) => left.id.localeCompare(right.id, 'en')),
    runsPerQuery: querySet.runsPerQuery,
    skillName: querySet.skillName,
    target: querySet.target,
  });

const normalizedQuery = (query: string): string =>
  query.trim().toLowerCase().replaceAll(/\s+/gu, ' ');

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

const polarityProblems = (inSplit: readonly TriggerQuery[], split: string): string[] => {
  const positives = inSplit.filter(({ shouldTrigger }) => shouldTrigger).length;
  const negatives = inSplit.length - positives;
  return Math.min(positives, negatives) < 2 || Math.min(positives, negatives) * 3 < inSplit.length
    ? [
        `Split ${split} needs at least two should-trigger and two near-miss queries and at least one third of each polarity (${positives} positive, ${negatives} negative).`,
      ]
    : [];
};

export const promptsFor = (querySet: TriggerQuerySet, catalog: readonly SkillCatalogEntry[]) =>
  activeQueriesOf(querySet).flatMap((triggerQuery) =>
    Array.from({ length: querySet.runsPerQuery }, (_, runIndex) => ({
      prompt: routerPromptFor(triggerQuery.query, catalog),
      queryId: triggerQuery.id,
      run: runIndex + 1,
    })),
  );

const queryDifferencesOf = (
  baseline: LedgerEntry,
  candidate: LedgerEntryInput,
): { readonly gains: readonly PerQueryRate[]; readonly regressions: readonly PerQueryRate[] } => {
  const baselineById = new Map(baseline.measurement.perQuery.map((query) => [query.id, query]));
  const candidateById = new Map(candidate.measurement.perQuery.map((query) => [query.id, query]));
  return {
    gains: candidate.measurement.perQuery.filter(
      (query) => query.passed && !baselineById.get(query.id)?.passed,
    ),
    regressions: baseline.measurement.perQuery.filter(
      (query) => query.passed && !candidateById.get(query.id)?.passed,
    ),
  };
};

export const decideNeverWorseGate = (
  baseline: LedgerEntry,
  candidate: LedgerEntryInput,
  options: GateOptions = { requireGain: true },
): GateDecision => {
  const compared = { attempt: candidate.attempt, sourceFingerprint: candidate.sourceFingerprint };
  const blocked = (
    reason: string,
    regressed: SplitCounts = NO_COUNTS,
    gained: SplitCounts = NO_COUNTS,
  ): GateDecision => ({
    candidate: compared,
    decision: 'blocked',
    gained,
    reason,
    regressed,
  });
  if (options.hardFailure) {
    return blocked(`Deterministic check failed: ${options.hardFailure}`);
  }
  if (candidate.matrixFingerprint !== baseline.matrixFingerprint) {
    return blocked(
      'The frozen query set changed since the baseline; record a new baseline only after a query-set ratchet check passes.',
    );
  }
  if (candidate.sourceFingerprint === baseline.sourceFingerprint && options.requireGain) {
    return blocked('The candidate source is identical to the baseline source.');
  }
  const { gains, regressions } = queryDifferencesOf(baseline, candidate);
  const regressed = countBySplit(regressions);
  const gained = countBySplit(gains);
  if (regressions.length > 0) {
    return blocked(
      `Regressed ${regressions.length} previously passing queries (${describeCounts(regressed)}).`,
      regressed,
      gained,
    );
  }
  if (options.requireGain && gains.length === 0) {
    return blocked(
      baseline.measurement.perQuery.every(({ passed }) => passed)
        ? 'No headroom: the baseline passes every query on every run; append harder queries and record a new baseline.'
        : 'No query newly passes on every run.',
    );
  }
  return {
    candidate: compared,
    decision: 'accepted',
    gained,
    reason: `Gained ${gains.length} queries (${describeCounts(gained)}) with no regressions.`,
    regressed,
  };
};

const queryPassed = (hits: number, runs: number, shouldTrigger: boolean): boolean =>
  runs > 0 && (shouldTrigger ? hits === runs : hits === 0);

export const queryRatchetViolations = (
  previous: TriggerQuerySet,
  next: TriggerQuerySet,
): readonly string[] => {
  const nextById = new Map(next.queries.map((query) => [query.id, query]));
  const violations = previous.queries.flatMap((query) => {
    const kept = nextById.get(query.id);
    if (!kept) {
      return [`Query ${query.id} was removed.`];
    }
    return kept.query === query.query
      && kept.shouldTrigger === query.shouldTrigger
      && kept.split === query.split
      && kept.expected === query.expected
      ? []
      : [`Query ${query.id} was changed.`];
  });
  if (previous.skillName !== next.skillName) {
    violations.push('The skill name changed.');
  }
  if (previous.kind !== next.kind || previous.target !== next.target) {
    violations.push('The query-set kind or target changed.');
  }
  if (previous.runsPerQuery > next.runsPerQuery) {
    violations.push('The runs per query decreased.');
  }
  return violations;
};

export const querySetBalanceProblems = (querySet: TriggerQuerySet): readonly string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  const active = activeQueriesOf(querySet);
  for (const { id, query } of active) {
    const key = normalizedQuery(query);
    if (seen.has(key)) {
      problems.push(`Query ${id} duplicates the text of an earlier query.`);
    }
    seen.add(key);
  }
  for (const split of ['train', 'validation'] as const) {
    const inSplit = active.filter((query) => query.split === split);
    if (querySet.kind === 'comprehension') {
      problems.push(
        ...(inSplit.length < 2 ? [`Split ${split} needs at least two probes.`] : []),
        ...letterSpreadProblems(inSplit, split),
      );
    } else {
      problems.push(...polarityProblems(inSplit, split));
    }
  }
  return problems;
};

const rateFor = (hits: number, runs: number): number => (runs === 0 ? 0 : hits / runs);

export const readBaselineSnapshot = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  ledgerRoot: string,
  baseline: LedgerEntry,
): Promise<string> => {
  const path = snapshotPathFor(ledgerRoot, baseline.id);
  try {
    return await fileSystem.readFile(path, 'utf8');
  } catch {
    throw new MeasurementError(
      `The baseline snapshot is missing, so the edit size cannot be measured: ${path}`,
    );
  }
};

export const rejectedEditFor = (
  baseline: LedgerEntry,
  candidate: LedgerEntryInput,
  decision: GateDecision,
  changeSummary: string,
): RejectedEdit | undefined => {
  if (decision.decision !== 'blocked') {
    return undefined;
  }
  const { gains, regressions } = queryDifferencesOf(baseline, candidate);
  return {
    changeSummary,
    gainedIds: gains.map(({ id }) => id),
    reason: decision.reason,
    regressedIds: regressions.map(({ id }) => id),
  };
};

const scoreOf = (values: readonly PerQueryRate[]): SplitScore => ({
  passedQueries: values.filter(({ passed }) => passed).length,
  score: values.filter(({ passed }) => passed).length / values.length,
  totalQueries: values.length,
});

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
  const active = activeQueriesOf(querySet);
  const perQuery: PerQueryRate[] = active.map((triggerQuery) => {
    const queryRecords = (byQuery.get(triggerQuery.id) ?? []).filter(
      (record) => Number.isSafeInteger(record.run) && record.run >= 1,
    );
    const hits = queryRecords.filter((record) => hitFor(querySet, triggerQuery, record)).length;
    const runs = queryRecords.length;
    return {
      hits,
      id: triggerQuery.id,
      passed: queryPassed(hits, runs, triggerQuery.shouldTrigger),
      rate: rateFor(hits, runs),
      runs,
      shouldTrigger: triggerQuery.shouldTrigger,
      split: triggerQuery.split,
      unstable: hits !== 0 && hits !== runs,
    };
  });
  const missingRuns = active.flatMap((triggerQuery, index) => {
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
  return {
    boundary,
    perQuery,
    runsPerQuery: querySet.runsPerQuery,
    skillName: querySet.skillName,
    train: scoreOf(splitQueries),
    validation: scoreOf(validationQueries),
  };
};

const CONTRACT_BOUNDARY = 'deterministic-matrix';

const contractRecordsFor = (
  cases: readonly MatrixCase[],
  visibility: 'candidate' | 'challenge',
  sourceText: string,
): PerQueryRate[] => {
  const split: QuerySplit = visibility === 'candidate' ? 'train' : 'validation';
  return evaluateMatrix(casesFor(cases, visibility), {
    delegatedChecks: {},
    ownedFiles: new Set(),
    text: sourceText,
  }).map(({ detail, name, status }) => {
    const passed = status === 'passed';
    return {
      ...(!passed && split === 'train' ? { detail } : {}),
      hits: passed ? 1 : 0,
      id: name,
      passed,
      rate: passed ? 1 : 0,
      runs: 1,
      shouldTrigger: true,
      split,
      unstable: false,
    };
  });
};

export const measurementFromMatrix = (
  skillName: string,
  cases: readonly MatrixCase[],
  sourceText: string,
): TriggerMeasurement => {
  const train = contractRecordsFor(cases, 'candidate', sourceText);
  const validation = contractRecordsFor(cases, 'challenge', sourceText);
  if (train.length === 0 || validation.length === 0) {
    throw new MeasurementError(
      'A contract matrix requires candidate and challenge assertions to measure.',
    );
  }
  return {
    boundary: CONTRACT_BOUNDARY,
    perQuery: [...train, ...validation],
    runsPerQuery: 1,
    skillName,
    train: scoreOf(train),
    validation: scoreOf(validation),
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
    .map((entry) => ({
      decision: decideNeverWorseGate(baseline, entry, {
        hardFailure: entry.hardFailure,
        requireGain: true,
      }),
      entry,
    }))
    .filter(({ decision }) => decision.decision === 'accepted')
    .map(({ entry }) => entry);
  return accepted.sort(
    (left, right) =>
      right.measurement.validation.score - left.measurement.validation.score
      || right.measurement.train.score - left.measurement.train.score
      || left.attempt - right.attempt,
  )[0];
};

export const snapshotPathFor = (ledgerRoot: string, entryId: string): string =>
  join(ledgerRoot, `${entryId}.snapshot.md`);

const splitFrom = (entry: Record<string, unknown>, id: string, sourcePath: string): QuerySplit => {
  const split = entry.split;
  if (typeof split !== 'string' || !Object.hasOwn(querySplits, split)) {
    throw new TriggerQuerySetError(
      `${sourcePath}: query ${id} uses an unknown split ${String(split)}; expected train or validation.`,
    );
  }
  return split as QuerySplit;
};

const splitsFrom = (
  parsed: Record<string, unknown>,
  sourcePath: string,
): Readonly<Record<string, string>> => {
  const splits = parsed.splits;
  if (
    splits !== undefined
    && (!isRecord(splits) || Object.values(splits).some((value) => typeof value !== 'string'))
  ) {
    throw new TriggerQuerySetError(
      `${sourcePath}: splits must map split names to nonempty guidance strings.`,
    );
  }
  return (splits ?? {}) as Readonly<Record<string, string>>;
};

const envelopeFor = (parsed: Record<string, unknown>, sourcePath: string): QuerySetEnvelope => {
  const skillName = nonEmptyString(parsed.skill_name);
  const queries = parsed.queries;
  if (!skillName || !Array.isArray(queries) || queries.length === 0) {
    throw new TriggerQuerySetError(
      `${sourcePath}: a query set requires a skill name and a nonempty query array.`,
    );
  }
  const runsPerQuery = parsed.runs_per_query;
  if (typeof runsPerQuery !== 'number' || !Number.isSafeInteger(runsPerQuery) || runsPerQuery < 3) {
    throw new TriggerQuerySetError(
      `${sourcePath}: runs_per_query must be an integer of at least 3.`,
    );
  }
  return {
    ...kindFrom(parsed, sourcePath),
    queries,
    runsPerQuery,
    skillName,
    splits: splitsFrom(parsed, sourcePath),
  };
};

const triggerQueryFrom = (
  entry: unknown,
  index: number,
  sourcePath: string,
  seenIds: ReadonlySet<string>,
  kind: QuerySetKind,
): TriggerQuery => {
  const position = index + 1;
  if (!isRecord(entry)) {
    throw new TriggerQuerySetError(`${sourcePath}: query ${position} is not an object.`);
  }
  const id = nonEmptyString(entry.id);
  const query = nonEmptyString(entry.query);
  const shouldTrigger = kind === 'comprehension' ? true : entry.should_trigger;
  if (!id || !query || typeof shouldTrigger !== 'boolean') {
    throw new TriggerQuerySetError(
      `${sourcePath}: query ${position} requires an id, a query string, and a boolean should_trigger.`,
    );
  }
  if (seenIds.has(id)) {
    throw new TriggerQuerySetError(`${sourcePath}: duplicate query id ${id}.`);
  }
  const split = splitFrom(entry, id, sourcePath);
  const retired = entry.retired;
  if (retired !== undefined && !nonEmptyString(retired)) {
    throw new TriggerQuerySetError(`${sourcePath}: query ${id} retired needs a reason string.`);
  }
  const expected = comprehensionAnswerFrom(entry, id, query, sourcePath, kind);
  return {
    ...(expected ? { expected } : {}),
    id,
    query,
    ...(typeof retired === 'string' ? { retired } : {}),
    shouldTrigger,
    split,
  };
};

export const parseTriggerQuerySet = (content: string, sourcePath: string): TriggerQuerySet => {
  const parsed = parseJson(content, sourcePath);
  const envelope = envelopeFor(parsed, sourcePath);
  const ids = new Set<string>();
  const queries = envelope.queries.map((entry, index) => {
    const triggerQuery = triggerQueryFrom(entry, index, sourcePath, ids, envelope.kind);
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

export const withCandidateDescription = (
  catalog: readonly SkillCatalogEntry[],
  name: string,
  description: string,
): readonly SkillCatalogEntry[] =>
  [...catalog.filter((entry) => entry.name !== name), { description, name }].sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  );
