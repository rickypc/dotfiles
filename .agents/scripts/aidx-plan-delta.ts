import { runWhenMainWithHelp } from '../utils/cli.js';
import { type FileSystem, nodeFileSystem, readText, writeText } from '../utils/filesystem.js';

export const DEVIATION_CLASSES = [
  'contradiction',
  'env-fact',
  'scope-change',
  'cap-exceeded',
  'unplanned-step',
  'noise-retry',
  'stale-evidence',
] as const;

export interface CapUse {
  readonly id: string;
  readonly planned: number;
  readonly used: number;
}

export interface DeltaRecord {
  readonly caps: readonly CapUse[];
  readonly deviations: readonly Deviation[];
  readonly plan: string;
  readonly schemaVersion: 1;
  readonly score: number;
  readonly steps: StepCounts;
  readonly unforeseen: number;
}

export interface Deviation {
  readonly class: DeviationClass;
  readonly note: string;
  readonly registerId?: string;
}

export type DeviationClass = (typeof DEVIATION_CLASSES)[number];

export interface StepCounts {
  readonly completed: number;
  readonly planned: number;
  readonly skipped: number;
}

const WORKFLOW_HEADING = '## 3. CHRONOLOGICAL WORKFLOW';
const NEXT_HEADING = '\n## 4. ';
const STEP_ITEM = /^\s*- \[([ x-])\]\s+\S/u;
const REGISTER_ID = /^\|\s*(PD-\d+)\s*\|/gmu;
const PATH_MESSAGE =
  'Plan path must be an absolute Markdown file under .agents/plans/ and observations path must be absolute.';

const count = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
};

const countSteps = (plan: string): StepCounts => {
  const start = plan.indexOf(WORKFLOW_HEADING);
  const end = plan.indexOf(NEXT_HEADING, start);
  const section = start < 0 ? '' : plan.slice(start, end < 0 ? plan.length : end);
  const states = section
    .split('\n')
    .map((line) => STEP_ITEM.exec(line)?.[1])
    .filter((state) => state !== undefined);
  return {
    completed: states.filter((state) => state === 'x').length,
    planned: states.length,
    skipped: states.filter((state) => state === '-').length,
  };
};

export const deltaPathFor = (planPath: string): string => planPath.replace(/\.md$/u, '.delta.json');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const listDirectory = async (fileSystem: FileSystem, path: string) => {
  try {
    return (await fileSystem.readdir?.(path, { withFileTypes: true })) ?? [];
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const deltaFiles = async (
  fileSystem: FileSystem,
  agentsRoot: string,
  index: string | undefined,
): Promise<readonly string[]> => {
  const plansRoot = `${agentsRoot}/plans`;
  const indexes = index
    ? [index]
    : (await listDirectory(fileSystem, plansRoot))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
  const groups = await Promise.all(
    indexes.map(async (name) =>
      (await listDirectory(fileSystem, `${plansRoot}/${name}`))
        .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.delta.json'))
        .map((entry) => `${plansRoot}/${name}/${entry.name}`),
    ),
  );
  return groups.flat().sort();
};

const parseList = <Item>(
  value: unknown,
  label: string,
  parse: (item: unknown, index: number) => Item,
): readonly Item[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map(parse);
};

const ratio = (numerator: number, denominator: number): number =>
  Math.round((numerator / denominator) * 10_000) / 10_000;

const capMaxima = (records: readonly DeltaRecord[]): readonly string[] => {
  const maxima = new Map<string, number>();
  for (const cap of records.flatMap((record) => record.caps)) {
    const used = ratio(cap.used, Math.max(cap.planned, 1));
    maxima.set(cap.id, Math.max(maxima.get(cap.id) ?? 0, used));
  }
  return [...maxima]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, value]) => `cap ${id}: max used/planned ${value}`);
};

const sortedKeys = (_key: string, value: unknown): unknown =>
  isRecord(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
    : value;

export const renderDelta = (record: DeltaRecord): string =>
  `${JSON.stringify(record, sortedKeys, 2)}\n`;

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
};

const parseCap = (value: unknown, index: number): CapUse => {
  if (!isRecord(value)) {
    throw new Error(`caps[${index}] must be an object.`);
  }
  return {
    id: text(value.id, `caps[${index}].id`),
    planned: count(value.planned, `caps[${index}].planned`),
    used: count(value.used, `caps[${index}].used`),
  };
};

const parseDeviation = (
  value: unknown,
  index: number,
  known: ReadonlySet<string> | undefined,
): Deviation => {
  if (!isRecord(value)) {
    throw new Error(`deviations[${index}] must be an object.`);
  }
  const deviationClass = DEVIATION_CLASSES.find((candidate) => candidate === value.class);
  if (!deviationClass) {
    throw new Error(`deviations[${index}].class must be one of: ${DEVIATION_CLASSES.join(', ')}.`);
  }
  const note = text(value.note, `deviations[${index}].note`);
  if (value.registerId === undefined) {
    return { class: deviationClass, note };
  }
  const registerId = text(value.registerId, `deviations[${index}].registerId`);
  if (known && !known.has(registerId)) {
    throw new Error(
      `deviations[${index}].registerId ${registerId} is not a Predicted deviations id of the plan.`,
    );
  }
  return { class: deviationClass, note, registerId };
};

const unforeseenCount = (deviations: readonly Deviation[]): number =>
  deviations.filter((deviation) => deviation.registerId === undefined).length;

export const buildDeltaRecord = (
  planContent: string,
  planName: string,
  observations: unknown,
): DeltaRecord => {
  const steps = countSteps(planContent);
  if (steps.planned === 0) {
    throw new Error('Plan has no workflow steps to measure.');
  }
  if (!isRecord(observations)) {
    throw new Error('Observations must be a JSON object with caps and deviations arrays.');
  }
  const known = new Set([...planContent.matchAll(REGISTER_ID)].map((match) => match[1]));
  const caps = parseList(observations.caps, 'caps', parseCap);
  const deviations = parseList(observations.deviations, 'deviations', (item, index) =>
    parseDeviation(item, index, known),
  );
  const unforeseen = unforeseenCount(deviations);
  return {
    caps,
    deviations,
    plan: planName,
    schemaVersion: 1,
    score: ratio(unforeseen, steps.planned),
    steps,
    unforeseen,
  };
};

export const parseDeltaRecord = (content: string): DeltaRecord => {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Delta record must be valid JSON.');
  }
  if (!isRecord(raw) || raw.schemaVersion !== 1) {
    throw new Error('Delta record must be an object with schemaVersion 1.');
  }
  const steps = isRecord(raw.steps) ? raw.steps : {};
  const parsedSteps = {
    completed: count(steps.completed, 'steps.completed'),
    planned: count(steps.planned, 'steps.planned'),
    skipped: count(steps.skipped, 'steps.skipped'),
  };
  const caps = parseList(raw.caps, 'caps', parseCap);
  const deviations = parseList(raw.deviations, 'deviations', (item, index) =>
    parseDeviation(item, index, undefined),
  );
  const unforeseen = count(raw.unforeseen, 'unforeseen');
  const expected = unforeseenCount(deviations);
  if (unforeseen !== expected) {
    throw new Error(
      `Delta record unforeseen ${unforeseen} does not match the ${expected} deviations without registerId.`,
    );
  }
  if (raw.score !== ratio(unforeseen, parsedSteps.planned)) {
    throw new Error('Delta record score does not match unforeseen over planned steps.');
  }
  return {
    caps,
    deviations,
    plan: text(raw.plan, 'plan'),
    schemaVersion: 1,
    score: raw.score,
    steps: parsedSteps,
    unforeseen,
  };
};

const loadDelta = async (fileSystem: FileSystem, path: string): Promise<DeltaRecord | string> => {
  try {
    return parseDeltaRecord(await readText(fileSystem, path));
  } catch (error) {
    return `malformed ${path}: ${error instanceof Error ? error.message : String(error)}`;
  }
};

export const deltaHistory = async (
  fileSystem: FileSystem,
  agentsRoot: string,
  index?: string,
): Promise<string> => {
  const paths = await deltaFiles(fileSystem, agentsRoot, index);
  if (paths.length === 0) {
    return 'no history';
  }
  const loaded = await Promise.all(paths.map((path) => loadDelta(fileSystem, path)));
  const records = loaded.filter((entry) => typeof entry !== 'string');
  const malformed = loaded.filter((entry) => typeof entry === 'string');
  return [
    `runs: ${records.length}`,
    ...capMaxima(records),
    ...records.map(
      (record) => `run ${record.plan}: unforeseen ${record.unforeseen} score ${record.score}`,
    ),
    ...malformed,
  ].join('\n');
};

export const recordDelta = async (
  fileSystem: FileSystem,
  planPath: string,
  observationsPath: string,
): Promise<DeltaRecord> => {
  if (
    !planPath.startsWith('/')
    || !planPath.endsWith('.md')
    || !planPath.includes('/.agents/plans/')
    || !observationsPath.startsWith('/')
  ) {
    throw new Error(PATH_MESSAGE);
  }
  const planContent = await readText(fileSystem, planPath);
  const rawObservations = await readText(fileSystem, observationsPath);
  let observations: unknown;
  try {
    observations = JSON.parse(rawObservations);
  } catch {
    throw new Error('Observations file must be valid JSON.');
  }
  const record = buildDeltaRecord(
    planContent,
    planPath.slice(planPath.lastIndexOf('/') + 1),
    observations,
  );
  await writeText(fileSystem, deltaPathFor(planPath), renderDelta(record));
  return record;
};

export const usage = (): string =>
  [
    'Usage:',
    'bun <agents-root>/scripts/aidx-plan-delta.ts record <absolute-plan-path> <absolute-observations-path>',
    'bun <agents-root>/scripts/aidx-plan-delta.ts history <agents-root> [repo-search-index]',
  ].join('\n');

export const run = async (
  args: readonly string[],
  fileSystem: FileSystem = nodeFileSystem,
  write: (message: string) => void = console.log,
): Promise<void> => {
  const [command, first, second, ...rest] = args;
  if (command === 'record' && first && second && rest.length === 0) {
    write(renderDelta(await recordDelta(fileSystem, first, second)));
    return;
  }
  if (command === 'history' && first && rest.length === 0) {
    write(await deltaHistory(fileSystem, first, second));
    return;
  }
  throw new Error(usage());
};

await runWhenMainWithHelp(import.meta.main, Bun.argv.slice(2), usage, run);
