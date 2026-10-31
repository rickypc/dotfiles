import { basename, dirname, join, resolve } from 'node:path';

import { runWhenMainWithHelp } from '../utils/cli.js';
import { type FileSystem, nodeFileSystem, readText, writeText } from '../utils/filesystem.js';
import { matrixRatchetViolations } from '../utils/quality-engine/matrix.js';
import { fingerprint, renderActionPacket } from '../utils/quality-engine/packet.js';
import type { WorkflowState } from '../utils/quality-engine/state.js';
import {
  appendLedgerEntry,
  baselineEntryFor,
  blindBundleFor,
  blindDocumentBundleFor,
  buildSkillCatalog,
  candidateDescriptionOf,
  decideNeverWorseGate,
  decideRollbackGate,
  defaultLedgerRootFor,
  editorMeasurementOf,
  type GateDecision,
  type LedgerEntry,
  type LedgerEntryInput,
  type LedgerStatus,
  ledgerPathFor,
  loadResponses,
  loadTriggerQuerySet,
  matrixFingerprintForQuerySet,
  measurementFromRecords,
  parseTriggerQuerySet,
  queryRatchetViolations,
  readLedger,
  selectWinningAttempt,
  snapshotPathFor,
  type TriggerQuerySet,
  withCandidateDescription,
} from '../utils/quality-engine/train.js';
import {
  createSkillManagerPacket,
  evaluateSkillManagerBatch,
  evaluateSkillMatrix,
  initializeSkill,
  parseMatrixJsonl,
  reviewSkillProse,
  validateSkill,
  validateSkillEvaluations,
} from '../utils/skill-manager.js';

interface TrainFlags {
  attempt: number;
  ledgerRoot?: string;
  measureOnly: boolean;
  runs?: number;
  skillsRoot?: string;
  status?: LedgerStatus;
}

interface TrainSubject {
  readonly hardFailure: () => Promise<string | undefined>;
  readonly querySet: TriggerQuerySet;
  readonly sourcePath: string;
}

export const usage = (): string =>
  [
    'Usage:',
    '  bun <agents-root>/scripts/skill-manager.ts init <absolute-skill-path> <description>',
    '  bun <agents-root>/scripts/skill-manager.ts validate <absolute-skill-path>',
    '  bun <agents-root>/scripts/skill-manager.ts review <absolute-skill-or-static-root-path> [absolute-additional-static-root-path]',
    '  bun <agents-root>/scripts/skill-manager.ts evaluate <baseline-or-candidate-or-challenge> <absolute-matrix-jsonl-path> <absolute-skill-file-path>',
    '  bun <agents-root>/scripts/skill-manager.ts batch <review-id> <baseline-or-candidate> <absolute-matrix-jsonl-path> <absolute-skill-file-path> ...',
    '  bun <agents-root>/scripts/skill-manager.ts packet <review-id> <candidate-checked-or-candidate-requested-or-draft> <absolute-skill-path> [failed-assertion-ids]',
    '  bun <agents-root>/scripts/skill-manager.ts ratchet <absolute-previous-matrix-or-query-set-path> <absolute-next-path>',
    '  bun <agents-root>/scripts/skill-manager.ts train bundle <absolute-skill-path-or-comprehension-set-json> [--skills-root <absolute-path>]',
    '  bun <agents-root>/scripts/skill-manager.ts train measure <absolute-skill-path-or-comprehension-set-json> <absolute-responses-jsonl-path> [--attempt <n>] [--runs <n>] [--measure-only] [--status <applied|attempt|baseline|post-change|rollback>] [--ledger-root <absolute-path>] [--skills-root <absolute-path>]',
    '  bun <agents-root>/scripts/skill-manager.ts train select <absolute-skill-path-or-comprehension-set-json> [--ledger-root <absolute-path>]',
  ].join('\n');

const defaultRead = readText.bind(undefined, nodeFileSystem);

const batchPairsFor = (
  args: readonly string[],
): readonly {
  readonly matrixPath: string;
  readonly targetSkillPath: string;
}[] => {
  const pairs = args.slice(3);
  if (
    !args[1]
    || (args[2] !== 'baseline' && args[2] !== 'candidate')
    || pairs.length === 0
    || pairs.length % 2 !== 0
  ) {
    throw new Error(usage());
  }
  const parsed = Array.from({ length: pairs.length / 2 }, (_, index) => ({
    matrixPath: pairs[index * 2] ?? '',
    targetSkillPath: pairs[index * 2 + 1] ?? '',
  }));
  if (
    parsed.some(
      ({ matrixPath, targetSkillPath }) =>
        !matrixPath.startsWith('/')
        || !matrixPath.endsWith('.jsonl')
        || !targetSkillPath.startsWith('/')
        || !targetSkillPath.endsWith('/SKILL.md'),
    )
  ) {
    throw new Error(
      'batch requires absolute <matrix-jsonl-path> values and absolute <skill-file-path> values ending in /SKILL.md.',
    );
  }
  return parsed;
};

const phaseFor = (
  phase: string,
): 'baseline_recorded' | 'candidate_checked' | 'challenge_checked' => {
  if (phase === 'baseline') {
    return 'baseline_recorded';
  }
  if (phase === 'candidate') {
    return 'candidate_checked';
  }
  if (phase === 'challenge') {
    return 'challenge_checked';
  }
  throw new Error(usage());
};

const runInit = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  if (args.length !== 3 || !args[1]?.startsWith('/') || !args[2]) {
    throw new Error(usage());
  }
  write(JSON.stringify(await initializeSkill(fileSystem, args[1], args[2]), null, 2));
};

const runPacket = (args: readonly string[], write: (message: string) => void): void => {
  const [, reviewId, state, targetSkillPath, failedAssertionIds] = args;
  if (
    args[0] !== 'packet'
    || !reviewId
    || !state
    || !targetSkillPath
    || args.length < 4
    || args.length > 5
  ) {
    throw new Error(usage());
  }
  write(
    renderActionPacket(
      createSkillManagerPacket({
        failedAssertionIds: failedAssertionIds?.split(',').filter(Boolean) ?? [],
        reviewId,
        state: state as WorkflowState,
        targetSkillPath,
      }),
    ),
  );
};

const runReview = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
): Promise<void> => {
  const roots = args.slice(1);
  if (roots.length === 0 || roots.some((root) => !root.startsWith('/'))) {
    throw new Error(usage());
  }
  write(JSON.stringify(await reviewSkillProse(fileSystem, roots), null, 2));
};

const runValidate = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: Pick<FileSystem, 'readFile'>,
): Promise<void> => {
  if (args.length !== 2 || !args[1]?.startsWith('/')) {
    throw new Error(usage());
  }
  write(JSON.stringify(await validateSkill(fileSystem, args[1]), null, 2));
};

const ledgerStatuses = new Set<LedgerStatus>([
  'applied',
  'attempt',
  'baseline',
  'post-change',
  'rollback',
]);

const agentsRoot = (): string => dirname(import.meta.dir);

const trainValueFlags = new Set([
  '--attempt',
  '--runs',
  '--status',
  '--ledger-root',
  '--skills-root',
]);

const assertRebaselineAllowed = (
  baseline: LedgerEntry | undefined,
  matrixFingerprint: string,
  queryIds: readonly string[],
  ledgerPath: string,
): void => {
  if (!baseline) {
    return;
  }
  if (baseline.matrixFingerprint === matrixFingerprint) {
    throw new Error(
      `A baseline already exists for this frozen query set: ${ledgerPath}. Gate attempts against it.`,
    );
  }
  const ids = new Set(queryIds);
  if (baseline.measurement.perQuery.some(({ id }) => !ids.has(id))) {
    throw new Error(
      `A new baseline may only extend the query set; a recorded query was removed: ${ledgerPath}`,
    );
  }
};

const assertRecordable = (request: {
  readonly baseline: LedgerEntry | undefined;
  readonly hardFailure: string | undefined;
  readonly ledgerPath: string;
  readonly matrixFingerprint: string;
  readonly queryIds: readonly string[];
  readonly status: LedgerStatus;
}): void => {
  const { baseline, hardFailure, ledgerPath, matrixFingerprint, queryIds, status } = request;
  if (status !== 'baseline') {
    if (!baseline) {
      throw new Error(
        `A recorded baseline is required before a ${status} ledger entry: ${ledgerPath}`,
      );
    }
    return;
  }
  assertRebaselineAllowed(baseline, matrixFingerprint, queryIds, ledgerPath);
  if (hardFailure) {
    throw new Error(`Repair the deterministic failure before recording a baseline: ${hardFailure}`);
  }
};

const gateFor = (
  entries: readonly LedgerEntry[],
  baseline: LedgerEntry,
  input: LedgerEntryInput,
  hardFailure: string | undefined,
): GateDecision => {
  if (input.status === 'rollback') {
    return decideRollbackGate(baseline, input);
  }
  if (input.status === 'attempt') {
    return decideNeverWorseGate(baseline, input, { hardFailure, requireGain: true });
  }
  const winner = selectWinningAttempt(entries, baseline);
  const unmeasured =
    input.status === 'applied' && winner?.sourceFingerprint !== input.sourceFingerprint
      ? 'The applied source matches no accepted attempt snapshot.'
      : undefined;
  return decideNeverWorseGate(baseline, input, {
    hardFailure: hardFailure ?? unmeasured,
    requireGain: false,
  });
};

const hardFailureFor = async (
  fileSystem: FileSystem,
  skillPath: string,
): Promise<string | undefined> => {
  try {
    await validateSkill(fileSystem, skillPath);
    await validateSkillEvaluations(fileSystem, skillPath);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const documentHardFailure = async (
  fileSystem: FileSystem,
  sourcePath: string,
): Promise<string | undefined> => {
  const text = await fileSystem.readFile(sourcePath, 'utf8');
  if (!text.trim()) {
    return `The document is blank: ${sourcePath}`;
  }
  return basename(sourcePath) === 'SKILL.md'
    ? hardFailureFor(fileSystem, dirname(sourcePath))
    : undefined;
};

const liveStateFor = (
  liveFingerprint: string,
  baseline: LedgerEntry,
  winner: LedgerEntry | undefined,
  liveEntry: LedgerEntry | undefined,
): string => {
  if (liveFingerprint === baseline.sourceFingerprint) {
    return 'baseline';
  }
  if (winner?.sourceFingerprint === liveFingerprint) {
    return 'winner';
  }
  return liveEntry ? 'measured' : 'unrecorded';
};

const nextActionFor = (liveState: string, hasWinner: boolean): string => {
  if (liveState === 'unrecorded') {
    return 'The live source matches no recorded entry; measure it as an attempt or restore the baseline snapshot.';
  }
  if (liveState === 'winner') {
    return 'The winner is live; confirm it with --status applied, then run the suite post-change check.';
  }
  if (hasWinner) {
    return 'Copy the winner snapshot over the source file, then record the live source with --status applied.';
  }
  if (liveState === 'measured') {
    return 'The live source is a measured entry other than the baseline; keep it only if its latest gate was accepted, otherwise restore the baseline snapshot.';
  }
  return 'Keep the baseline; draft another attempt from train failures, or append harder queries when every query passes on every run.';
};

const positiveIntegerFlag = (value: string, minimum: number): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(usage());
  }
  return parsed;
};

const applyTrainFlag = (flags: TrainFlags, name: string, value: string): void => {
  if (name === '--attempt') {
    flags.attempt = positiveIntegerFlag(value, 1);
    return;
  }
  if (name === '--runs') {
    flags.runs = positiveIntegerFlag(value, 3);
    return;
  }
  if (name === '--status') {
    if (!ledgerStatuses.has(value as LedgerStatus)) {
      throw new Error(usage());
    }
    flags.status = value as LedgerStatus;
    return;
  }
  if (name === '--ledger-root') {
    flags.ledgerRoot = value;
    return;
  }
  flags.skillsRoot = value;
};

const consumeTrainFlag = (
  args: readonly string[],
  index: number,
  flags: TrainFlags,
  positionals: string[],
): number => {
  const arg = args[index] ?? '';
  if (arg === '--measure-only') {
    flags.measureOnly = true;
    return index;
  }
  if (trainValueFlags.has(arg)) {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(usage());
    }
    applyTrainFlag(flags, arg, value);
    return index + 1;
  }
  if (arg.startsWith('--')) {
    throw new Error(usage());
  }
  positionals.push(arg);
  return index;
};

const runBatch = async (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer>,
  write: (message: string) => void,
): Promise<void> => {
  const pairs = batchPairsFor(args);
  const sources = await Promise.all(
    pairs.map(async ({ matrixPath, targetSkillPath }) => {
      const [matrixContent, sourceContent] = await Promise.all([
        read(matrixPath),
        read(targetSkillPath),
      ]);
      return {
        matrix: parseMatrixJsonl(String(matrixContent)),
        matrixPath,
        sourceText: String(sourceContent),
        targetSkillPath,
      };
    }),
  );
  write(
    JSON.stringify(
      evaluateSkillManagerBatch(args[1] ?? '', args[2] as 'baseline' | 'candidate', sources),
      null,
      2,
    ),
  );
};

const runEvaluate = async (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer>,
  write: (message: string) => void,
): Promise<void> => {
  const [, phase, matrixPath, skillFilePath] = args;
  if (!phase || !matrixPath || !skillFilePath || args.length !== 4) {
    throw new Error(usage());
  }
  const [matrixContent, sourceContent] = await Promise.all([read(matrixPath), read(skillFilePath)]);
  const sourceText = String(sourceContent);
  const receipt = evaluateSkillMatrix(
    parseMatrixJsonl(String(matrixContent)),
    { delegatedChecks: {}, ownedFiles: new Set(), text: sourceText },
    fingerprint(sourceText),
    phaseFor(phase),
  );
  write(JSON.stringify(receipt, null, 2));
};

const runRatchet = async (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer>,
  write: (message: string) => void,
): Promise<void> => {
  const [, previousPath, nextPath] = args;
  const extension = previousPath?.endsWith('.jsonl') ? '.jsonl' : '.json';
  if (
    args.length !== 3
    || !previousPath?.startsWith('/')
    || !nextPath?.startsWith('/')
    || !previousPath.endsWith(extension)
    || !nextPath.endsWith(extension)
  ) {
    throw new Error(usage());
  }
  const [previous, next] = (await Promise.all([read(previousPath), read(nextPath)])).map(String);
  const violations =
    extension === '.jsonl'
      ? matrixRatchetViolations(parseMatrixJsonl(previous ?? ''), parseMatrixJsonl(next ?? ''))
      : queryRatchetViolations(
          parseTriggerQuerySet(previous ?? '', previousPath),
          parseTriggerQuerySet(next ?? '', nextPath),
        );
  if (violations.length > 0) {
    throw new Error(`Ratchet violations: ${violations.join(' ')}`);
  }
  write(JSON.stringify({ nextPath, previousPath, status: 'ratchet-ok', violations }, null, 2));
};

const statusFor = (flags: TrainFlags): LedgerStatus =>
  flags.status ?? (flags.measureOnly ? 'baseline' : 'attempt');

const subjectFor = async (fileSystem: FileSystem, path: string): Promise<TrainSubject> => {
  if (!path.endsWith('.json')) {
    return {
      hardFailure: () => hardFailureFor(fileSystem, path),
      querySet: await loadTriggerQuerySet(fileSystem, join(path, 'evals', 'trigger-queries.json')),
      sourcePath: join(path, 'SKILL.md'),
    };
  }
  const querySet = await loadTriggerQuerySet(fileSystem, path);
  if (querySet.kind !== 'comprehension') {
    throw new Error(`A .json train subject must be a comprehension set: ${path}`);
  }
  const sourcePath = resolve(dirname(path), querySet.target ?? '');
  return { hardFailure: () => documentHardFailure(fileSystem, sourcePath), querySet, sourcePath };
};

const runTrainBundle = async (
  skillPath: string,
  flags: TrainFlags,
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  if (flags.runs || flags.status) {
    throw new Error(usage());
  }
  const { querySet, sourcePath } = await subjectFor(fileSystem, skillPath);
  const sourceText = await fileSystem.readFile(sourcePath, 'utf8');
  if (querySet.kind === 'comprehension') {
    write(JSON.stringify(blindDocumentBundleFor(querySet, sourceText), null, 2));
    return;
  }
  const skillsRoot = flags.skillsRoot ?? join(agentsRoot(), 'skills');
  const catalog = withCandidateDescription(
    await buildSkillCatalog(fileSystem, skillsRoot),
    querySet.skillName,
    candidateDescriptionOf(sourceText),
  );
  write(JSON.stringify(blindBundleFor(querySet, catalog), null, 2));
};

const runTrainMeasure = async (
  skillPath: string,
  responsesPath: string,
  flags: TrainFlags,
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  if (
    !skillPath.startsWith('/')
    || !responsesPath.startsWith('/')
    || !responsesPath.endsWith('.jsonl')
  ) {
    throw new Error(usage());
  }
  const subject = await subjectFor(fileSystem, skillPath);
  const scoredSet = {
    ...subject.querySet,
    runsPerQuery: flags.runs ?? subject.querySet.runsPerQuery,
  };
  const records = await loadResponses(fileSystem, responsesPath);
  const measurement = measurementFromRecords(scoredSet, records);
  const sourceText = await fileSystem.readFile(subject.sourcePath, 'utf8');
  const status = statusFor(flags);
  const ledgerRoot = flags.ledgerRoot ?? defaultLedgerRootFor(agentsRoot());
  const ledgerPath = ledgerPathFor(ledgerRoot, scoredSet.skillName);
  const priorEntries = await readLedger(fileSystem, ledgerPath);
  const baseline = baselineEntryFor(priorEntries);
  const hardFailure = await subject.hardFailure();
  const matrixFingerprint = matrixFingerprintForQuerySet(scoredSet);
  assertRecordable({
    baseline,
    hardFailure,
    ledgerPath,
    matrixFingerprint,
    queryIds: scoredSet.queries.map(({ id }) => id),
    status,
  });
  const input: LedgerEntryInput = {
    attempt: flags.attempt,
    boundary: measurement.boundary,
    ...(hardFailure ? { hardFailure } : {}),
    matrixFingerprint,
    measurement,
    sourceFingerprint: fingerprint(sourceText),
    status,
    timestamp: new Date().toISOString(),
  };
  const gate =
    baseline && status !== 'baseline'
      ? gateFor(priorEntries, baseline, input, hardFailure)
      : undefined;
  const entry = await appendLedgerEntry(fileSystem, ledgerPath, input);
  const snapshot = snapshotPathFor(ledgerRoot, entry.id);
  await writeText(fileSystem, snapshot, sourceText);
  write(
    JSON.stringify(
      {
        boundary: measurement.boundary,
        decision: gate,
        ledger: { entries: priorEntries.length + 1, entryId: entry.id, path: ledgerPath, snapshot },
        matrixFingerprint,
        measurement: editorMeasurementOf(measurement),
        sourceFingerprint: input.sourceFingerprint,
        status,
        subject: skillPath,
      },
      null,
      2,
    ),
  );
};

const runTrainSelect = async (
  skillPath: string,
  flags: TrainFlags,
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  if (flags.runs || flags.status || flags.skillsRoot || flags.measureOnly) {
    throw new Error(usage());
  }
  const { querySet, sourcePath } = await subjectFor(fileSystem, skillPath);
  const ledgerRoot = flags.ledgerRoot ?? defaultLedgerRootFor(agentsRoot());
  const ledgerPath = ledgerPathFor(ledgerRoot, querySet.skillName);
  const entries = await readLedger(fileSystem, ledgerPath);
  const baseline = baselineEntryFor(entries);
  if (!baseline) {
    throw new Error(`A recorded baseline is required before selection: ${ledgerPath}`);
  }
  const generation = entries.slice(entries.lastIndexOf(baseline));
  const winner = selectWinningAttempt(generation, baseline);
  const liveFingerprint = fingerprint(await fileSystem.readFile(sourcePath, 'utf8'));
  const liveEntry = generation.findLast((entry) => entry.sourceFingerprint === liveFingerprint);
  const liveState = liveStateFor(liveFingerprint, baseline, winner, liveEntry);
  const summary = (entry: LedgerEntry) => ({
    entryId: entry.id,
    snapshot: snapshotPathFor(ledgerRoot, entry.id),
    sourceFingerprint: entry.sourceFingerprint,
    train: entry.measurement.train.score,
    validation: entry.measurement.validation.score,
  });
  write(
    JSON.stringify(
      {
        attempts: generation
          .filter(({ status }) => status === 'attempt')
          .map((entry) => {
            const { decision, reason } = decideNeverWorseGate(baseline, entry, {
              hardFailure: entry.hardFailure,
              requireGain: true,
            });
            return { attempt: entry.attempt, decision, entryId: entry.id, reason };
          }),
        baseline: summary(baseline),
        decision: winner ? 'apply' : 'keep-baseline',
        liveEntry: liveEntry ? { entryId: liveEntry.id, status: liveEntry.status } : undefined,
        liveFingerprint,
        liveState,
        nextAction: nextActionFor(liveState, winner !== undefined),
        winner: winner ? summary(winner) : undefined,
      },
      null,
      2,
    ),
  );
};

const trainFlagsFor = (args: readonly string[]): { flags: TrainFlags; positionals: string[] } => {
  const flags: TrainFlags = { attempt: 1, measureOnly: false };
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    index = consumeTrainFlag(args, index, flags, positionals);
  }
  return { flags, positionals };
};

const runTrain = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  const { flags, positionals } = trainFlagsFor(args);
  const mode = positionals[1];
  const skillPath = positionals[2];
  if (!skillPath?.startsWith('/')) {
    throw new Error(usage());
  }
  if (mode === 'bundle') {
    await runTrainBundle(skillPath, flags, write, fileSystem);
    return;
  }
  if (mode === 'measure') {
    const responsesPath = positionals[3];
    if (!responsesPath) {
      throw new Error(usage());
    }
    await runTrainMeasure(skillPath, responsesPath, flags, write, fileSystem);
    return;
  }
  if (mode === 'select') {
    await runTrainSelect(skillPath, flags, write, fileSystem);
    return;
  }
  throw new Error(usage());
};

export const run = async (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer> = defaultRead,
  write: (message: string) => void = console.log,
  fileSystem: FileSystem = nodeFileSystem,
): Promise<void> => {
  const [command] = args;
  if (command === 'init') {
    return runInit(args, write, fileSystem);
  }
  if (command === 'validate') {
    return runValidate(args, write, fileSystem);
  }
  if (command === 'review') {
    return runReview(args, write, fileSystem);
  }
  if (command === 'batch') {
    return runBatch(args, read, write);
  }
  if (command === 'evaluate') {
    return runEvaluate(args, read, write);
  }
  if (command === 'train') {
    return runTrain(args, write, fileSystem);
  }
  if (command === 'ratchet') {
    return runRatchet(args, read, write);
  }
  return runPacket(args, write);
};

export { runWhenMain } from '../utils/cli.js';

void runWhenMainWithHelp(import.meta.main, Bun.argv.slice(2), usage, run);
