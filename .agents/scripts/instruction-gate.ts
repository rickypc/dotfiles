import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS_ROOT_FLAG, splitAgentsRoot } from '../utils/agents-root.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';
import {
  MAX_NEW_TOKENS,
  MODEL_REVISION,
  READER_VERSION,
  ROUTER_VERSION,
  VENDORED_BUNDLE_SHA256,
} from './weak-reader.js';

export interface Baseline {
  readonly trainPassed: readonly string[];
  readonly validationPassed: number;
}

interface DecideOptions extends RecordOptions {
  // Routing compares score totals: the router reads every description, so one edit moves other
  // skills' probes; a per-probe rule would reject edits for noise the editor cannot control.
  readonly aggregate?: boolean;
  readonly fingerprintChanged: boolean;
}

export type Decision = 'allowed-equal' | 'baseline' | 'improved' | 'perfect' | 'rebaseline';

export interface DirectoryItem {
  readonly isDirectory: boolean;
  readonly name: string;
}

export interface Fingerprint {
  readonly bundleSha256: string;
  readonly maxNewTokens: number;
  readonly modelRevision: string;
  readonly readerVersion: string;
}

export interface GateDependencies {
  // The content root: documents, skills, comprehension sets, and receipts live under it.
  readonly agentsRoot: string;
  readonly executor: CommandExecutor;
  readonly listDirectory: (directory: string) => Promise<readonly DirectoryItem[]>;
  readonly makeTempDir: () => Promise<string>;
  readonly readText: (file: string) => Promise<string | undefined>;
  readonly sha256: (text: string) => string;
  // The package root: executable helpers (`scripts/<name>`) always resolve from it.
  readonly toolsRoot: string;
  readonly write: (message: string) => void;
  readonly writeText: (file: string, content: string) => Promise<void>;
}

interface GateTarget {
  readonly document: string;
  readonly receiptPath: string;
  readonly setPath: string;
  // Set for a skill-description (routing) target; absent for an instruction document.
  readonly skill?: string;
}

interface Inputs {
  readonly documentText: string;
  readonly setText: string;
}

type JsonFormatter = (value: unknown, indent: number, lead: number) => string;

interface Measured {
  readonly answers: string;
  readonly bundle: string;
  readonly measurement: Measurement;
  readonly readerLog: string;
  readonly work: string;
}

export interface Measurement {
  readonly trainFailed: readonly string[];
  readonly trainPassed: readonly string[];
  readonly validationPassed: number;
  readonly validationTotal: number;
}

interface ProbeDetail {
  readonly evidence?: string;
  readonly expected?: string;
  readonly id: string;
  readonly query?: string;
  readonly should_trigger?: boolean;
}

interface ProbeSet {
  readonly queries?: readonly {
    readonly id: string;
    readonly retired?: unknown;
    readonly split?: string;
  }[];
}

export interface Receipt {
  readonly baseline: Baseline | null;
  readonly decision: Decision;
  readonly document: string;
  readonly documentSha256: string;
  readonly fingerprint: Fingerprint;
  readonly measurement: Measurement;
  readonly reason: string;
  readonly schema: 1;
  readonly selfSha256: string;
  readonly setPath: string;
  readonly setSha256: string;
}

export interface RecordOptions {
  readonly allowEqualReason?: string;
  readonly rebaselineReason?: string;
}

interface RoutingInputs {
  readonly catalogHash: string;
  readonly setSha: string;
  readonly sets: ReadonlyMap<string, string>;
  readonly skills: readonly string[];
}

export interface Verdict {
  readonly accepted: boolean;
  readonly decision?: Decision;
  readonly problems: readonly string[];
}

export const RECEIPT_DIRECTORY = path.join('evals', 'receipts');
export const DESCRIPTION_PREFIX = 'description:';
export const ROUTING_TOKEN = 'descriptions';
export const ROUTING_RECEIPT = path.join(RECEIPT_DIRECTORY, 'activation.json');
export const ROUTING_BATCH = 4;
export const ROOT_DOCUMENT_PATTERN = /^(AGENTS|CLAUDE|GEMINI)[^/]*\.md$/u;

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const activeTrainIds = (set: ProbeSet): readonly string[] =>
  (set.queries ?? [])
    .filter((query) => query.split === 'train' && query.retired === undefined)
    .map((query) => query.id);

const baselineOf = (previous: Receipt | undefined): Baseline | null =>
  previous === undefined
    ? null
    : {
        trainPassed: previous.measurement.trainPassed,
        validationPassed: previous.measurement.validationPassed,
      };

export const currentFingerprint = (routing = false): Fingerprint => ({
  bundleSha256: VENDORED_BUNDLE_SHA256,
  maxNewTokens: MAX_NEW_TOKENS,
  modelRevision: MODEL_REVISION,
  readerVersion: routing ? `${READER_VERSION}+${ROUTER_VERSION}` : READER_VERSION,
});

export const defaultDependencies = (agentsRoot = PACKAGE_ROOT): GateDependencies => ({
  agentsRoot,
  executor: bunExecutor,
  listDirectory: async (directory) =>
    (await readdir(directory, { withFileTypes: true })).map((entry) => ({
      isDirectory: entry.isDirectory(),
      name: entry.name,
    })),
  makeTempDir: () => mkdtemp(path.join(tmpdir(), 'instruction-gate-')),
  readText: async (file) => {
    try {
      return await readFile(file, 'utf8');
    } catch {
      return undefined;
    }
  },
  sha256: (text) => createHash('sha256').update(text).digest('hex'),
  toolsRoot: PACKAGE_ROOT,
  write: (message) => process.stdout.write(message),
  writeText: async (file, content) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, 'utf8');
  },
});

export const fingerprintMatches = (left: Fingerprint, right: Fingerprint): boolean =>
  left.bundleSha256 === right.bundleSha256
  && left.maxNewTokens === right.maxNewTokens
  && left.modelRevision === right.modelRevision
  && left.readerVersion === right.readerVersion;

const gainedScore = (
  candidate: Measurement,
  baseline: Baseline,
  aggregate: boolean | undefined,
): boolean =>
  (aggregate
    ? candidate.trainPassed.length > baseline.trainPassed.length
    : candidate.trainPassed.some((id) => !baseline.trainPassed.includes(id)))
  || candidate.validationPassed > baseline.validationPassed;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// Keys are sorted at every depth so the stored file satisfies the repository's sorted-keys lint and
// the seal does not depend on object construction order.
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  return isRecord(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonicalize(value[key])]),
      )
    : value;
};

const measurementOf = (stdout: string): Measurement => {
  const parsed: unknown = JSON.parse(stdout);
  const measurement = isRecord(parsed) ? parsed.measurement : undefined;
  const train = isRecord(measurement) ? measurement.trainQueries : undefined;
  const validation = isRecord(measurement) ? measurement.validation : undefined;
  if (!Array.isArray(train) || !isRecord(validation)) {
    throw new Error('train measure returned no trainQueries or validation.');
  }
  const entries = train as readonly { readonly id: string; readonly passed: boolean }[];
  return {
    trainFailed: entries.filter((entry) => !entry.passed).map((entry) => entry.id),
    trainPassed: entries.filter((entry) => entry.passed).map((entry) => entry.id),
    validationPassed: Number(validation.passedQueries),
    validationTotal: Number(validation.totalQueries),
  };
};

const measureDocument = async (target: GateTarget, deps: GateDependencies): Promise<Measured> => {
  const work = await deps.makeTempDir();
  const set = target.skill
    ? path.join(deps.agentsRoot, 'skills', target.skill)
    : path.join(deps.agentsRoot, target.setPath);
  const script = (name: string): string => path.join(deps.toolsRoot, 'scripts', name);
  const bundle = path.join(work, 'bundle.json');
  const answers = path.join(work, 'answers.jsonl');
  const built = await deps.executor({
    args: [script('skill-manager.ts'), 'train', 'bundle', set],
    command: 'bun',
  });
  if (built.code !== 0) {
    throw new Error(`train bundle failed: ${built.stderr.trim()}`);
  }
  await deps.writeText(bundle, built.stdout);
  const read = await deps.executor({
    args: [script('weak-reader.ts'), bundle, answers],
    command: 'bun',
    timeoutMs: 20 * 60 * 1000,
  });
  if (read.code !== 0) {
    const hint = read.code === 2 ? ' (no GPU adapter: run this command outside the sandbox)' : '';
    throw new Error(`weak reader exited ${read.code}${hint}: ${read.stderr.trim().slice(-300)}`);
  }
  const measured = await deps.executor({
    args: [
      script('skill-manager.ts'),
      'train',
      'measure',
      set,
      answers,
      '--measure-only',
      '--ledger-root',
      path.join(work, 'ledger'),
    ],
    command: 'bun',
  });
  if (measured.code !== 0) {
    throw new Error(`train measure failed: ${measured.stderr.trim()}`);
  }
  return {
    answers,
    bundle,
    measurement: measurementOf(measured.stdout),
    readerLog: read.stderr,
    work,
  };
};

const optionValue = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  const value = index === -1 ? undefined : args[index + 1];
  return value?.startsWith('--') ? undefined : value;
};

const parseReceipt = (content: string): Receipt | undefined => {
  try {
    const value: unknown = JSON.parse(content);
    return isRecord(value) && value.schema === 1 ? (value as unknown as Receipt) : undefined;
  } catch {
    return undefined;
  }
};

const reasonProblems = (receipt: Receipt): string[] =>
  ['allowed-equal', 'rebaseline'].includes(receipt.decision) && receipt.reason.trim() === ''
    ? [`The ${receipt.decision} decision has no recorded reason.`]
    : [];

export const receiptPathFor = (document: string): string =>
  path.join(RECEIPT_DIRECTORY, `${document.replace(/\.md$/u, '').replaceAll('/', '--')}.json`);

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && [...left].sort().join('\n') === [...right].sort().join('\n');

const worseProblems = (
  candidate: Measurement,
  baseline: Baseline,
  aggregate: boolean | undefined,
): string[] => {
  const problems = aggregate
    ? candidate.trainPassed.length < baseline.trainPassed.length
      ? [
          `Train score fell from ${baseline.trainPassed.length} to ${candidate.trainPassed.length} passing probes.`,
        ]
      : []
    : baseline.trainPassed
        .filter((id) => candidate.trainFailed.includes(id))
        .map((id) => `Train probe ${id} passed at baseline and now fails.`);
  if (candidate.validationPassed < baseline.validationPassed) {
    problems.push(
      `Held-out validation fell from ${baseline.validationPassed} to ${candidate.validationPassed} passing probes.`,
    );
  }
  return problems;
};

// The never-worse rule: nothing that passed at baseline may fail now, held-out validation may not
// lose a pass, and a target that still has failing train probes must gain at least one pass.
export const decide = (
  candidate: Measurement,
  baseline: Baseline | null,
  options: DecideOptions,
): Verdict => {
  if (baseline === null) {
    return { accepted: true, decision: 'baseline', problems: [] };
  }
  if (options.fingerprintChanged) {
    return options.rebaselineReason
      ? { accepted: true, decision: 'rebaseline', problems: [] }
      : {
          accepted: false,
          problems: [
            'The reader changed since the baseline, so scores are not comparable; rerun with --rebaseline <reason>.',
          ],
        };
  }
  const problems = worseProblems(candidate, baseline, options.aggregate);
  if (problems.length > 0) {
    return { accepted: false, problems };
  }
  if (gainedScore(candidate, baseline, options.aggregate)) {
    return { accepted: true, decision: 'improved', problems: [] };
  }
  if (candidate.trainFailed.length === 0) {
    return { accepted: true, decision: 'perfect', problems: [] };
  }
  return options.allowEqualReason
    ? { accepted: true, decision: 'allowed-equal', problems: [] }
    : {
        accepted: false,
        problems: [
          'The edit did not improve a target that still has failing probes; rewrite until a probe newly passes, or rerun with --allow-equal <reason>.',
        ],
      };
};

const comparisonProblems = (receipt: Receipt, aggregate: boolean): string[] => {
  if (receipt.baseline === null || ['baseline', 'rebaseline'].includes(receipt.decision)) {
    return [];
  }
  const verdict = decide(receipt.measurement, receipt.baseline, {
    aggregate,
    allowEqualReason: receipt.decision === 'allowed-equal' ? receipt.reason : undefined,
    fingerprintChanged: false,
  });
  return verdict.problems.map((problem) => `Recorded result is worse: ${problem}`);
};

const JSON_LINE_WIDTH = 100;

export const activationSkills = async (deps: GateDependencies): Promise<readonly string[]> => {
  const skills = await deps.listDirectory(path.join(deps.agentsRoot, 'skills'));
  const named = await Promise.all(
    skills
      .filter((item) => item.isDirectory)
      .map(async (item) => {
        const entries = await deps.listDirectory(path.join(deps.agentsRoot, 'skills', item.name));
        return entries.some((entry) => entry.name === 'SKILL.md') ? [item.name] : [];
      }),
  );
  return named.flat().sort();
};

// The router reads every description, so one catalog hash stales the routing receipt.
export const catalogSha = async (
  deps: GateDependencies,
  skills: readonly string[],
): Promise<string | undefined> => {
  const first = skills[0];
  if (first === undefined) {
    return undefined;
  }
  const built = await deps.executor({
    args: [
      path.join(deps.toolsRoot, 'scripts', 'skill-manager.ts'),
      'train',
      'bundle',
      path.join(deps.agentsRoot, 'skills', first),
    ],
    command: 'bun',
  });
  try {
    return built.code === 0
      ? deps.sha256(JSON.stringify((JSON.parse(built.stdout) as { catalog: unknown }).catalog))
      : undefined;
  } catch {
    return undefined;
  }
};

const formatArray = (
  value: readonly unknown[],
  indent: number,
  lead: number,
  formatChild: JsonFormatter,
): string => {
  if (value.length === 0) {
    return '[]';
  }
  const inline = JSON.stringify(value).replaceAll(',', ', ');
  if (value.every((item) => !isRecord(item)) && lead + inline.length + 1 <= JSON_LINE_WIDTH) {
    return inline;
  }
  const pad = ' '.repeat(indent);
  const items = value.map((item) => `${pad}  ${formatChild(item, indent + 2, indent + 2)}`);
  return `[\n${items.join(',\n')}\n${pad}]`;
};

const formatObject = (
  value: Record<string, unknown>,
  indent: number,
  formatChild: JsonFormatter,
): string => {
  const pad = ' '.repeat(indent);
  const entries = Object.entries(value).map(([key, child]) => {
    const head = `${pad}  ${JSON.stringify(key)}: `;
    return `${head}${formatChild(child, indent + 2, head.length)}`;
  });
  return entries.length === 0 ? '{}' : `{\n${entries.join(',\n')}\n${pad}}`;
};

function formatJsonValue(value: unknown, indent: number, lead: number): string {
  if (Array.isArray(value)) {
    return formatArray(value, indent, lead, formatJsonValue);
  }
  return isRecord(value) ? formatObject(value, indent, formatJsonValue) : JSON.stringify(value);
}

// Matches the repository's Biome JSON format: short arrays stay on one line.
export const formatReceipt = (receipt: Receipt): string => `${formatJsonValue(receipt, 0, 0)}\n`;

const isCustomRoot = (deps: GateDependencies): boolean => deps.agentsRoot !== deps.toolsRoot;

const mergeRouting = (skills: readonly string[], parts: readonly Measured[]): Measurement => ({
  trainFailed: parts.flatMap((part, index) =>
    part.measurement.trainFailed.map((id) => `${skills[index]}/${id}`),
  ),
  trainPassed: parts.flatMap((part, index) =>
    part.measurement.trainPassed.map((id) => `${skills[index]}/${id}`),
  ),
  validationPassed: parts.reduce((sum, part) => sum + part.measurement.validationPassed, 0),
  validationTotal: parts.reduce((sum, part) => sum + part.measurement.validationTotal, 0),
});

const missingInput = (
  target: GateTarget,
  documentText: string | undefined,
  setText: string | undefined,
): string | undefined =>
  documentText === undefined || setText === undefined
    ? `${target.document}: missing document or comprehension set ${target.setPath}`
    : undefined;

const queriesOf = (setText: string): readonly ProbeDetail[] =>
  (JSON.parse(setText) as { queries: readonly ProbeDetail[] }).queries;

const failureEntries = async (
  measured: Measured,
  setText: string,
  target: GateTarget,
  deps: GateDependencies,
): Promise<readonly { expected: string; given: string; id: string; query: string }[]> => {
  const queries = queriesOf(setText);
  const answerLines = ((await deps.readText(measured.answers)) ?? '').split('\n').filter(Boolean);
  const given = new Map<string, string>();
  for (const line of answerLines) {
    const entry = JSON.parse(line) as { answer?: string; query_id?: string; skill_name?: string };
    given.set(entry.query_id ?? '', entry.answer ?? entry.skill_name ?? '');
  }
  return measured.measurement.trainFailed.map((id) => {
    const probe = queries.find((query) => query.id === id);
    const expected = target.skill
      ? probe?.should_trigger
        ? target.skill
        : `anything but ${target.skill}`
      : (probe?.expected ?? '');
    return {
      expected,
      given: given.get(id) ?? '',
      id,
      query: probe?.query ?? '',
    };
  });
};

// Everything the next rewrite needs, in one block: each failing probe with the weak reader's own view.
const diagnose = async (
  target: GateTarget,
  measured: Measured,
  setText: string,
  deps: GateDependencies,
  baselineRegression = false,
): Promise<string> => {
  const failures = await failureEntries(measured, setText, target, deps);
  if (failures.length === 0) {
    return '';
  }
  const failuresPath = path.join(measured.work, 'failures.json');
  const suggestionsPath = path.join(measured.work, 'suggestions.jsonl');
  await deps.writeText(failuresPath, JSON.stringify(failures));
  const suggested = await deps.executor({
    args: [
      path.join(deps.toolsRoot, 'scripts', 'weak-reader.ts'),
      'suggest',
      measured.bundle,
      failuresPath,
      suggestionsPath,
    ],
    command: 'bun',
    timeoutMs: 20 * 60 * 1000,
  });
  const text = suggested.code === 0 ? await deps.readText(suggestionsPath) : undefined;
  const suggestions = new Map<string, string>(
    (text ?? '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const entry = JSON.parse(line) as { id: string; suggestion: string };
        return [entry.id, entry.suggestion];
      }),
  );
  const queries = queriesOf(setText);
  const blocks = failures.map((failure) => {
    const evidence = target.skill
      ? `the description of ${target.skill} in the router catalog`
      : (queries.find((query) => query.id === failure.id)?.evidence ?? '');
    return [
      `--- ${failure.id}: expected ${failure.expected}, the reader answered ${failure.given}`,
      failure.query,
      `Source rule: ${evidence}`,
      `Reader's view: ${suggestions.get(failure.id) ?? '(no suggestion available)'}`,
    ].join('\n');
  });
  const subject = target.skill ? `${DESCRIPTION_PREFIX}${target.skill}` : target.document;
  const advice = target.skill
    ? 'Rewrite the description so a router picks this skill for these queries and no other skill does, then record again.'
    : baselineRegression
      ? 'A baseline-passing train probe regressed. Preserve wording outside the cited rule; make only '
        + 'the smallest local edit to that rule, then record again.'
      : 'Make the smallest local edit to the cited passage, preserve surrounding rules, and record again.';
  const odd = measured.readerLog
    .split('\n')
    .filter((line) => line.includes('unparseable reply'))
    .slice(0, 5);
  const replies =
    odd.length > 0
      ? `Replies the reader gave that were not a skill name or letter:\n${odd.join('\n')}\n`
      : '';
  return `DIAGNOSIS ${subject}: failing train probes. ${advice}\n${blocks.join('\n')}\n${replies}`;
};

const routingIds = (inputs: RoutingInputs): readonly string[] =>
  inputs.skills.flatMap((skill) =>
    activeTrainIds(JSON.parse(inputs.sets.get(skill) ?? '{}') as ProbeSet).map(
      (id) => `${skill}/${id}`,
    ),
  );

const routingScore = (skills: readonly string[], parts: readonly Measured[]): string =>
  skills
    .map((skill, index) => {
      const part = parts[index]?.measurement;
      const train = (part?.trainPassed.length ?? 0) + (part?.trainFailed.length ?? 0);
      return `${skill} ${part?.trainPassed.length}/${train}`;
    })
    .join(', ');

export const routingSkillTarget = (skill: string): GateTarget => ({
  document: path.join('skills', skill, 'SKILL.md'),
  receiptPath: ROUTING_RECEIPT,
  setPath: path.join('skills', skill, 'evals', 'trigger-queries.json'),
  skill,
});

const measureRouting = async (
  skills: readonly string[],
  deps: GateDependencies,
): Promise<readonly Measured[]> => {
  const parts: Measured[] = [];
  for (let start = 0; start < skills.length; start += ROUTING_BATCH) {
    const batch = skills.slice(start, start + ROUTING_BATCH);
    parts.push(
      ...(await Promise.all(
        batch.map((skill) => measureDocument(routingSkillTarget(skill), deps)),
      )),
    );
  }
  return parts;
};

const readRoutingInputs = async (deps: GateDependencies): Promise<RoutingInputs | string> => {
  const skills = await activationSkills(deps);
  if (skills.length === 0) {
    return 'No skills found under skills/.';
  }
  const texts = await Promise.all(
    skills.map((skill) =>
      deps.readText(path.join(deps.agentsRoot, routingSkillTarget(skill).setPath)),
    ),
  );
  const missing = skills.find((_skill, index) => texts[index] === undefined);
  if (missing !== undefined) {
    return `No trigger query set at ${routingSkillTarget(missing).setPath}; create it before editing.`;
  }
  const catalogHash = await catalogSha(deps, skills);
  if (catalogHash === undefined) {
    return 'Could not read the skill catalog from `train bundle`.';
  }
  const sets = new Map(skills.map((skill, index) => [skill, texts[index] ?? ''] as const));
  const setSha = deps.sha256(skills.map((skill) => `${skill}\0${sets.get(skill)}`).join('\n'));
  return { catalogHash, setSha, sets, skills };
};

const routingDiagnosis = async (
  inputs: RoutingInputs,
  parts: readonly Measured[],
  deps: GateDependencies,
): Promise<string> => {
  const blocks: string[] = [];
  for (const [index, skill] of inputs.skills.entries()) {
    const part = parts[index];
    if (part !== undefined && part.measurement.trainFailed.length > 0) {
      blocks.push(
        await diagnose(routingSkillTarget(skill), part, inputs.sets.get(skill) ?? '', deps),
      );
    }
  }
  return blocks.join('');
};

const sealedFields = (receipt: Omit<Receipt, 'selfSha256'>): string =>
  JSON.stringify(canonicalize(receipt));

export const sealReceipt = (
  receipt: Omit<Receipt, 'selfSha256'>,
  sha256: (text: string) => string,
): Receipt => canonicalize({ ...receipt, selfSha256: sha256(sealedFields(receipt)) }) as Receipt;

const recordRouting = async (options: RecordOptions, deps: GateDependencies): Promise<boolean> => {
  const inputs = await readRoutingInputs(deps);
  if (typeof inputs === 'string') {
    deps.write(`${ROUTING_TOKEN}: ${inputs}\n`);
    return false;
  }
  const previousText = await deps.readText(path.join(deps.agentsRoot, ROUTING_RECEIPT));
  const previous = previousText === undefined ? undefined : parseReceipt(previousText);
  const parts = await measureRouting(inputs.skills, deps);
  const measurement = mergeRouting(inputs.skills, parts);
  const verdict = decide(measurement, baselineOf(previous), {
    ...options,
    aggregate: true,
    fingerprintChanged:
      previous !== undefined && !fingerprintMatches(previous.fingerprint, currentFingerprint(true)),
  });
  const total = measurement.trainPassed.length + measurement.trainFailed.length;
  const score = `train ${measurement.trainPassed.length}/${total}, validation ${measurement.validationPassed}/${measurement.validationTotal}; ${routingScore(inputs.skills, parts)}`;
  if (!verdict.accepted || verdict.decision === undefined) {
    deps.write(
      `REJECTED ${ROUTING_TOKEN} (${score})\n${verdict.problems.map((p) => `  - ${p}`).join('\n')}\n`,
    );
    deps.write(await routingDiagnosis(inputs, parts, deps));
    return false;
  }
  const reason = options.rebaselineReason ?? options.allowEqualReason ?? '';
  const receipt = sealReceipt(
    {
      baseline: baselineOf(previous),
      decision: verdict.decision,
      document: 'skills/*/SKILL.md',
      documentSha256: inputs.catalogHash,
      fingerprint: currentFingerprint(true),
      measurement,
      reason: ['allowed-equal', 'rebaseline'].includes(verdict.decision) ? reason : '',
      schema: 1,
      setPath: 'skills/*/evals/trigger-queries.json',
      setSha256: inputs.setSha,
    },
    deps.sha256,
  );
  await deps.writeText(path.join(deps.agentsRoot, ROUTING_RECEIPT), formatReceipt(receipt));
  deps.write(`ACCEPTED ${ROUTING_TOKEN} (${score}) as ${verdict.decision}\n`);
  deps.write(await routingDiagnosis(inputs, parts, deps));
  return true;
};

const recordTarget = async (
  target: GateTarget,
  options: RecordOptions,
  deps: GateDependencies,
): Promise<boolean> => {
  const [documentText, setText, previousText] = await Promise.all([
    deps.readText(path.join(deps.agentsRoot, target.document)),
    deps.readText(path.join(deps.agentsRoot, target.setPath)),
    deps.readText(path.join(deps.agentsRoot, target.receiptPath)),
  ]);
  const missing = missingInput(target, documentText, setText);
  if (missing !== undefined || documentText === undefined || setText === undefined) {
    deps.write(`${missing}\n`);
    return false;
  }
  const previous = previousText === undefined ? undefined : parseReceipt(previousText);
  const measured = await measureDocument(target, deps);
  const { measurement } = measured;
  const baseline = baselineOf(previous);
  const verdict = decide(measurement, baseline, {
    ...options,
    fingerprintChanged:
      previous !== undefined && !fingerprintMatches(previous.fingerprint, currentFingerprint()),
  });
  const baselineRegression = verdict.problems.some((problem) =>
    problem.includes('passed at baseline and now fails'),
  );
  const score = `train ${measurement.trainPassed.length}/${measurement.trainPassed.length + measurement.trainFailed.length}, validation ${measurement.validationPassed}/${measurement.validationTotal}`;
  if (!verdict.accepted || verdict.decision === undefined) {
    deps.write(
      `REJECTED ${target.document} (${score})\n${verdict.problems.map((p) => `  - ${p}`).join('\n')}\n`,
    );
    deps.write(await diagnose(target, measured, setText, deps, baselineRegression));
    return false;
  }
  const reason = options.rebaselineReason ?? options.allowEqualReason ?? '';
  const receipt = sealReceipt(
    {
      baseline: baselineOf(previous),
      decision: verdict.decision,
      document: target.document,
      documentSha256: deps.sha256(documentText),
      fingerprint: currentFingerprint(),
      measurement,
      reason: ['allowed-equal', 'rebaseline'].includes(verdict.decision) ? reason : '',
      schema: 1,
      setPath: target.setPath,
      setSha256: deps.sha256(setText),
    },
    deps.sha256,
  );
  await deps.writeText(path.join(deps.agentsRoot, target.receiptPath), formatReceipt(receipt));
  deps.write(`ACCEPTED ${target.document} (${score}) as ${verdict.decision}\n`);
  deps.write(await diagnose(target, measured, setText, deps));
  return true;
};

export const setPathFor = (document: string): string => {
  if (!document.includes('/')) {
    return path.join('evals', `${document.replace(/\.md$/u, '')}.json`);
  }
  const [, skill, ...rest] = document.split('/');
  return path.join(
    'skills',
    skill ?? '',
    'evals',
    'comprehension',
    `${rest.join('-').replace(/\.md$/u, '')}.json`,
  );
};

const staleProblems = (receipt: Receipt, inputs: Inputs, deps: GateDependencies): string[] => {
  const stale: string[] = [];
  if (receipt.documentSha256 !== deps.sha256(inputs.documentText)) {
    stale.push('The document changed after its receipt was recorded.');
  }
  if (receipt.setSha256 !== deps.sha256(inputs.setText)) {
    stale.push('The comprehension set changed after its receipt was recorded.');
  }
  return stale;
};

const targetOf = (document: string): GateTarget => ({
  document,
  receiptPath: receiptPathFor(document),
  setPath: setPathFor(document),
});

const recordSafely = async (
  token: string,
  options: RecordOptions,
  deps: GateDependencies,
): Promise<boolean> => {
  try {
    return token === ROUTING_TOKEN
      ? await recordRouting(options, deps)
      : await recordTarget(targetOf(token), options, deps);
  } catch (error) {
    deps.write(`FAILED ${token}: ${error instanceof Error ? error.message : String(error)}\n`);
    return false;
  }
};

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/instruction-gate.ts verify [--agents-root <absolute-path>]; '
  + 'bun <agents-root>/scripts/instruction-gate.ts record [--agents-root <absolute-path>] '
  + '[--allow-equal <reason>] [--rebaseline <reason>] [<instruction-path> | descriptions]... '
  + '--agents-root selects the content root (documents, skills, sets, receipts) for a '
  + 'project-local agents root; scripts still run from the gate package. '
  + 'The routing of skill descriptions is gated only for the default global root: '
  + 'with --agents-root, verify skips it and record rejects `descriptions`.';

export const parseRecordArguments = (
  args: readonly string[],
): { readonly documents: readonly string[]; readonly options: RecordOptions } => {
  const options: RecordOptions = {
    allowEqualReason: optionValue(args, '--allow-equal'),
    rebaselineReason: optionValue(args, '--rebaseline'),
  };
  for (const flag of ['--allow-equal', '--rebaseline']) {
    if (args.includes(flag) && !optionValue(args, flag)?.trim()) {
      throw new Error(`${flag} needs a written reason. ${usage()}`);
    }
  }
  const values = new Set([options.allowEqualReason, options.rebaselineReason]);
  const documents = args.filter((arg) => !arg.startsWith('--') && !values.has(arg));
  return { documents, options };
};

const walk = async (deps: GateDependencies, relative: string): Promise<readonly string[]> => {
  const items = await deps.listDirectory(path.join(deps.agentsRoot, relative));
  const nested = await Promise.all(
    items.map(async (item) => {
      const child = path.join(relative, item.name);
      if (item.isDirectory) {
        return walk(deps, child);
      }
      return item.name.endsWith('.md') ? [child] : [];
    }),
  );
  return nested.flat();
};

export const instructionDocuments = async (deps: GateDependencies): Promise<readonly string[]> => {
  const root = await deps.listDirectory(deps.agentsRoot);
  const rootDocuments = root
    .filter((item) => !item.isDirectory && ROOT_DOCUMENT_PATTERN.test(item.name))
    .map((item) => item.name);
  const skills = await deps.listDirectory(path.join(deps.agentsRoot, 'skills'));
  const skillDocuments = await Promise.all(
    skills
      .filter((item) => item.isDirectory)
      .map((item) => walk(deps, path.join('skills', item.name))),
  );
  return [...rootDocuments, ...skillDocuments.flat()].sort();
};

const withoutSeal = (receipt: Receipt): Omit<Receipt, 'selfSha256'> => {
  const { selfSha256: _seal, ...rest } = receipt;
  return rest;
};

const recordedProblems = (
  receipt: Receipt,
  deps: GateDependencies,
  expected: {
    readonly fingerprint: Fingerprint;
    readonly ids: readonly string[];
    readonly routing: boolean;
  },
): string[] => {
  const recordedIds = [...receipt.measurement.trainPassed, ...receipt.measurement.trainFailed];
  const checks: readonly [boolean, string][] = [
    [
      receipt.selfSha256 !== deps.sha256(sealedFields(withoutSeal(receipt))),
      'The receipt was edited by hand: its seal does not match.',
    ],
    [
      !fingerprintMatches(receipt.fingerprint, expected.fingerprint),
      'The receipt was recorded by a different reader; rerun record with --rebaseline <reason>.',
    ],
    [
      !sameIds(recordedIds, expected.ids),
      'The receipt does not cover exactly the active train probes of the set.',
    ],
  ];
  return [
    ...checks.filter(([failing]) => failing).map(([, message]) => message),
    ...comparisonProblems(receipt, expected.routing),
    ...reasonProblems(receipt),
  ];
};

export const verifyRouting = async (deps: GateDependencies): Promise<readonly string[]> => {
  const inputs = await readRoutingInputs(deps);
  if (typeof inputs === 'string') {
    return [inputs];
  }
  const receiptText = await deps.readText(path.join(deps.agentsRoot, ROUTING_RECEIPT));
  const receipt = receiptText === undefined ? undefined : parseReceipt(receiptText);
  if (receipt === undefined) {
    return [`No valid receipt at ${ROUTING_RECEIPT}; run record where a GPU adapter exists.`];
  }
  const stale: string[] = [];
  if (receipt.documentSha256 !== inputs.catalogHash) {
    stale.push(
      'A skill description changed after the routing receipt was recorded; the router reads every description.',
    );
  }
  if (receipt.setSha256 !== inputs.setSha) {
    stale.push('A trigger query set changed after the routing receipt was recorded.');
  }
  return [
    ...stale,
    ...recordedProblems(receipt, deps, {
      fingerprint: currentFingerprint(true),
      ids: routingIds(inputs),
      routing: true,
    }),
  ];
};

export const verifyTarget = async (
  target: GateTarget,
  deps: GateDependencies,
): Promise<readonly string[]> => {
  const [documentText, setText, receiptText] = await Promise.all([
    deps.readText(path.join(deps.agentsRoot, target.document)),
    deps.readText(path.join(deps.agentsRoot, target.setPath)),
    deps.readText(path.join(deps.agentsRoot, target.receiptPath)),
  ]);
  if (documentText === undefined) {
    return ['The instruction document is missing.'];
  }
  if (setText === undefined) {
    return [
      `No comprehension set at ${target.setPath}; create it (one probe per rule) before editing.`,
    ];
  }
  const receipt = receiptText === undefined ? undefined : parseReceipt(receiptText);
  if (receipt === undefined) {
    return [`No valid receipt at ${target.receiptPath}; run record where a GPU adapter exists.`];
  }
  return [
    ...staleProblems(receipt, { documentText, setText }, deps),
    ...recordedProblems(receipt, deps, {
      fingerprint: currentFingerprint(),
      ids: activeTrainIds(JSON.parse(setText) as ProbeSet),
      routing: false,
    }),
  ];
};

const recordPlan = async (
  documents: readonly string[],
  deps: GateDependencies,
): Promise<readonly string[]> => {
  if (documents.length > 0) {
    return documents;
  }
  const stale: string[] = [];
  for (const document of await instructionDocuments(deps)) {
    if ((await verifyTarget(targetOf(document), deps)).length > 0) {
      stale.push(document);
    }
  }
  return isCustomRoot(deps) || (await verifyRouting(deps)).length === 0
    ? stale
    : [...stale, ROUTING_TOKEN];
};

export const record = async (
  documents: readonly string[],
  options: RecordOptions,
  deps: GateDependencies,
): Promise<number> => {
  let failures = 0;
  for (const token of await recordPlan(documents, deps)) {
    failures += (await recordSafely(token, options, deps)) ? 0 : 1;
  }
  deps.write(
    failures === 0
      ? 'instruction-gate: record complete.\n'
      : `instruction-gate: ${failures} target(s) not accepted.\n`,
  );
  return failures === 0 ? 0 : 1;
};

export const verify = async (deps: GateDependencies): Promise<number> => {
  const documents = await instructionDocuments(deps);
  if (documents.length === 0) {
    deps.write(
      'instruction-gate: failed - no instruction documents found under the agents root.\n',
    );
    return 1;
  }
  const checks: (readonly [string, readonly string[]])[] = [];
  for (const document of documents) {
    checks.push([document, await verifyTarget(targetOf(document), deps)]);
  }
  if (!isCustomRoot(deps)) {
    checks.push([ROUTING_TOKEN, await verifyRouting(deps)]);
  }
  const failing = checks.filter(([, problems]) => problems.length > 0);
  for (const [name, problems] of failing) {
    deps.write(`instruction-gate: ${name}\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  }
  if (failing.length > 0) {
    deps.write(
      `instruction-gate: failed - ${failing.length} of ${checks.length} checks need a receipt. `
        + 'Run `bun scripts/instruction-gate.ts record` where a GPU adapter exists.\n',
    );
    return 1;
  }
  deps.write(
    `instruction-gate: passed - ${documents.length} instruction documents${isCustomRoot(deps) ? '' : ' and the skill description routing'} have current, never-worse receipts.\n`,
  );
  return 0;
};

export const run = async (args: readonly string[], base: GateDependencies): Promise<number> => {
  const [command, ...given] = args;
  const { rest, root } = await splitAgentsRoot(given, base.listDirectory);
  const deps = root === undefined ? base : { ...base, agentsRoot: root };
  if (command === 'verify' && rest.length === 0) {
    return verify(deps);
  }
  if (command === 'record') {
    const parsed = parseRecordArguments(rest);
    if (isCustomRoot(deps) && parsed.documents.includes(ROUTING_TOKEN)) {
      throw new Error(
        `${ROUTING_TOKEN} is gated only for the default root, not with ${AGENTS_ROOT_FLAG}.`,
      );
    }
    return record(parsed.documents, parsed.options, deps);
  }
  throw new Error(usage());
};

export const processExit = {
  setExitCode: (code: number, target: { exitCode?: number | string | null } = process): void => {
    target.exitCode = code;
  },
};

export const runCli = async (
  args: readonly string[],
  deps: GateDependencies = defaultDependencies(),
  setExitCode: (code: number) => void = (code) => processExit.setExitCode(code),
): Promise<void> => {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    deps.write(`${usage()}\n`);
    return;
  }
  try {
    setExitCode(await run(args, deps));
  } catch (error) {
    deps.write(`${error instanceof Error ? error.message : String(error)}\n`);
    setExitCode(1);
  }
};

void (import.meta.main ? runCli(process.argv.slice(2)) : undefined);
