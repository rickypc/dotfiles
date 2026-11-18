import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { agentsRootOf } from '../../utils/agents-root.js';
import type { CommandDeclaration } from '../../utils/cli/declaration.js';
import { errorMessage } from '../../utils/cli/errors.js';
import { runMain } from '../../utils/cli/index.js';
import { type FileSystem, nodeFileSystem, readText, writeText } from '../../utils/filesystem.js';
import { auditAtoms } from '../../utils/quality-engine/atom/audit.js';
import { rebuildAtomMaps } from '../../utils/quality-engine/atom/build.js';
import { parseEvaluationCasesJsonl } from '../../utils/quality-engine/evaluation-cases.js';
import type { MatrixCase } from '../../utils/quality-engine/matrix.js';
import { matrixFingerprintFor } from '../../utils/quality-engine/matrix.js';
import { fingerprint, renderActionPacket } from '../../utils/quality-engine/packet.js';
import {
  skillHistoryPathsFor,
  temporarySnapshotRootFor,
} from '../../utils/quality-engine/skill-history-paths.js';
import type { WorkflowState } from '../../utils/quality-engine/state.js';
import {
  changeSummaryOf,
  DEFAULT_EDIT_CAPS,
  editCapViolation,
  editSizeOf,
} from '../../utils/quality-engine/train/edit.js';
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
  ledgerEntriesForSubject,
  loadResponses,
  loadTriggerQuerySet,
  matrixFingerprintForQuerySet,
  measurementFromMatrix,
  measurementFromRecords,
  readBaselineSnapshot,
  readLedger,
  rejectedEditFor,
  selectWinningAttempt,
  snapshotPathFor,
  type TriggerMeasurement,
  type TriggerQuerySet,
  withCandidateDescription,
} from '../../utils/quality-engine/train/index.js';
import {
  createSkillManagerPacket,
  evaluateSkillManagerBatch,
  initializeSkill,
  parseMatrixJsonl,
  reviewSkillProse,
  skillEvaluationPathsFor,
  validateSkill,
  validateSkillEvaluations,
} from '../../utils/skill-manager/index.js';
import { atomGateDeps, atomGateProblems } from './atom-gate.js';
import { buildCommand, type SkillManagerOverrides } from './command.js';
import { runSkillManagerEvaluation, runSkillManagerRatchet } from './evaluation.js';
import { defaultLibrarianDeps, runLibrarian } from './librarian.js';
import { defaultSealDeps, runSeal } from './seal.js';

interface ContractSubject {
  readonly cases: readonly MatrixCase[];
  readonly hardFailure: () => Promise<string | undefined>;
  readonly skillName: string;
  readonly sourcePath: string;
}

interface HistoryPaths {
  readonly ledgerPath: string;
  readonly snapshotRoot: string;
}

type Route = (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer>,
  write: (message: string) => void,
  fileSystem: FileSystem,
) => Promise<void>;

interface ScoredSubject {
  readonly hardFailure: () => Promise<string | undefined>;
  readonly matrixFingerprint: string;
  readonly measurement: TriggerMeasurement;
  readonly queryIds: readonly string[];
  readonly skillName: string;
  readonly sourcePath: string;
}

interface TrainFlags {
  attempt: number;
  ledgerRoot?: string;
  maxBodyLines?: number;
  maxDescriptionChange?: number;
  measureOnly: boolean;
  runs?: number;
  skillsRoot?: string;
  status?: LedgerStatus;
  track?: 'contract';
}

interface TrainSubject {
  readonly hardFailure: () => Promise<string | undefined>;
  readonly querySet: TriggerQuerySet;
  readonly sourcePath: string;
}

export const usage = (): string =>
  [
    'Usage:',
    '  bun <agents-root>/scripts/skill-manager/index.ts audit <absolute-agents-root> [owner-id | --check]',
    '  bun <agents-root>/scripts/skill-manager/index.ts atoms <absolute-agents-root> [owner-id] [--write]',
    '  bun <agents-root>/scripts/skill-manager/index.ts propose <absolute-agents-root> <absolute-proposal-json>',
    '  bun <agents-root>/scripts/skill-manager/index.ts check <absolute-agents-root> <batch-id> [--allow-swap <reason>]',
    '  bun <agents-root>/scripts/skill-manager/index.ts commit <absolute-agents-root> <batch-id>',
    '  bun <agents-root>/scripts/skill-manager/index.ts seal <absolute-agents-root> <owner-id> <case-id> <absolute-capture-json> <document-sha256>',
    '  bun <agents-root>/scripts/skill-manager/index.ts init <absolute-skill-path> <description>',
    '  bun <agents-root>/scripts/skill-manager/index.ts validate <absolute-skill-path>',
    '  bun <agents-root>/scripts/skill-manager/index.ts review <absolute-skill-or-static-root-path> [absolute-additional-static-root-path]',
    '  bun <agents-root>/scripts/skill-manager/index.ts evaluate <baseline-or-candidate-or-challenge> <absolute-matrix-jsonl-path> <absolute-skill-file-path>',
    '  bun <agents-root>/scripts/skill-manager/index.ts batch <review-id> <baseline-or-candidate> <absolute-matrix-jsonl-path> <absolute-skill-file-path> ...',
    '  bun <agents-root>/scripts/skill-manager/index.ts packet <review-id> <candidate-checked-or-candidate-requested-or-draft> <absolute-skill-path> [failed-assertion-ids]',
    '  bun <agents-root>/scripts/skill-manager/index.ts ratchet <absolute-previous-matrix-or-query-set-path> <absolute-next-path> [absolute-retirements.json]',
    '  bun <agents-root>/scripts/skill-manager/index.ts train bundle <absolute-skill-path-or-comprehension-set-json> [--skills-root <absolute-path>]',
    '  bun <agents-root>/scripts/skill-manager/index.ts train measure <absolute-skill-path-or-comprehension-set-json> <absolute-responses-jsonl-path> [--attempt <n>] [--runs <n>] [--measure-only] [--status <applied|attempt|baseline|post-change|rollback>] [--max-description-change <percent>] [--max-body-lines <n>] [--ledger-root <absolute-path>] [--skills-root <absolute-path>]',
    '  bun <agents-root>/scripts/skill-manager/index.ts train measure <absolute-skill-path> --track contract [--attempt <n>] [--measure-only] [--status <applied|attempt|baseline|post-change|rollback>] [--max-description-change <percent>] [--max-body-lines <n>] [--ledger-root <absolute-path>]',
    '  bun <agents-root>/scripts/skill-manager/index.ts train select <absolute-skill-path-or-comprehension-set-json> [--track contract] [--ledger-root <absolute-path>]',
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

const runAtoms = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  const flags = args.slice(1).filter((arg) => arg === '--write');
  const [agentsRoot, ownerId, ...extra] = args.slice(1).filter((arg) => arg !== '--write');
  if (flags.length > 1 || extra.length > 0 || !agentsRoot?.startsWith('/')) {
    throw new Error(usage());
  }
  const report = await rebuildAtomMaps(fileSystem, agentsRoot, {
    ownerId,
    write: flags.length === 1,
  });
  write(JSON.stringify(report, null, 2));
};

const runAudit = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
): Promise<void> => {
  const check = args.includes('--check');
  const [, agentsRoot, ownerId, ...extra] = args.filter((arg) => arg !== '--check');
  if (!agentsRoot?.startsWith('/') || extra.length > 0 || (check && ownerId !== undefined)) {
    throw new Error(usage());
  }
  if (check) {
    const problems = await atomGateProblems(atomGateDeps(fileSystem, agentsRoot), fileSystem);
    if (problems.length > 0) {
      throw new Error(`Atom gate failed:\n${problems.join('\n')}`);
    }
    write('atom-maps: passed - every instruction document has an atom map that audits clean.');
    return;
  }
  write(JSON.stringify({ owners: await auditAtoms(fileSystem, agentsRoot, ownerId) }, null, 2));
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

const agentsRoot = (): string => agentsRootOf(import.meta.dir);

const relativePathWithin = (root: string, path: string): string | undefined => {
  const candidate = relative(root, resolve(path));
  return candidate === '..' || candidate.startsWith(`..${sep}`) || candidate.startsWith(sep)
    ? undefined
    : candidate;
};

const rootDocumentScopeFor = (root: string, sourceRelative: string): string | undefined => {
  const isRootMarkdown = !sourceRelative.includes(sep) && extname(sourceRelative) === '.md';
  return isRootMarkdown || sourceRelative === join('evals', 'rubric.md')
    ? join(root, 'evals')
    : undefined;
};

const skillNameForHistorySource = (sourceRelative: string): string | undefined => {
  const parts = sourceRelative.split(sep);
  if (parts[0] === 'skills') {
    return parts[1];
  }
  if (parts[0] === 'evals' && parts[1] === 'skills') {
    return parts[2];
  }
  return undefined;
};

const centralOwnerRootFor = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  sourcePath: string,
): Promise<string | undefined> => {
  const root = resolve(agentsRoot());
  if (root !== resolve(join(homedir(), '.agents'))) {
    return undefined;
  }
  const sourceRelative = relativePathWithin(root, sourcePath);
  if (!sourceRelative) {
    return undefined;
  }
  const rootDocumentScope = rootDocumentScopeFor(root, sourceRelative);
  if (rootDocumentScope) {
    return rootDocumentScope;
  }
  const skillName = skillNameForHistorySource(sourceRelative);
  if (!skillName || skillName === '_catalog') {
    return undefined;
  }
  const paths = await skillEvaluationPathsFor(fileSystem, join(root, 'skills', skillName));
  return paths.central
    && paths.comprehensionSets.some((set) => resolve(set.sourcePath) === resolve(sourcePath))
    ? dirname(paths.matrixPaths[0] ?? '')
    : undefined;
};

const historyPathsFor = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  sourcePath: string,
  skillName: string,
  overrideRoot?: string,
): Promise<HistoryPaths> => {
  const root = resolve(agentsRoot());
  const ownerRoot = overrideRoot ? undefined : await centralOwnerRootFor(fileSystem, sourcePath);
  const ledgerOwnerRoot = resolve(ownerRoot ?? overrideRoot ?? defaultLedgerRootFor(root));
  const temporarySnapshotRoot = temporarySnapshotRootFor(
    {
      ownerRoot: ledgerOwnerRoot,
      repositoryRoot: root,
      skillName,
      temporaryDirectory: tmpdir(),
    },
    join,
    fingerprint,
  );
  return skillHistoryPathsFor(
    {
      legacyRoot: defaultLedgerRootFor(root),
      ...(ownerRoot ? { ownerRoot } : {}),
      ...(overrideRoot ? { overrideRoot } : {}),
      skillName,
      temporarySnapshotRoot,
    },
    join,
  );
};

const trainValueFlags = new Set([
  '--attempt',
  '--runs',
  '--status',
  '--ledger-root',
  '--max-body-lines',
  '--max-description-change',
  '--skills-root',
  '--track',
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
    return errorMessage(error);
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

const scopeFlagSetters: Readonly<
  Record<string, ((flags: TrainFlags, value: string) => void) | undefined>
> = {
  '--max-body-lines': (flags, value) => {
    flags.maxBodyLines = positiveIntegerFlag(value, 1);
  },
  '--max-description-change': (flags, value) => {
    flags.maxDescriptionChange = positiveIntegerFlag(value, 1);
  },
  '--track': (flags, value) => {
    if (value !== 'contract') {
      throw new Error(usage());
    }
    flags.track = value;
  },
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
  const applyScopeFlag = scopeFlagSetters[name];
  if (applyScopeFlag) {
    applyScopeFlag(flags, value);
    return;
  }
  flags.skillsRoot = value;
};

const assertMeasureArguments = (
  skillPath: string,
  responsesPath: string | undefined,
  flags: TrainFlags,
): void => {
  const valid =
    flags.track === 'contract'
      ? responsesPath === undefined && flags.runs === undefined
      : responsesPath?.startsWith('/') && responsesPath.endsWith('.jsonl');
  if (!skillPath.startsWith('/') || !valid) {
    throw new Error(usage());
  }
};

const assertWithinEditCap = async (
  fileSystem: FileSystem,
  snapshotRoot: string,
  baseline: LedgerEntry,
  sourceText: string,
  flags: TrainFlags,
): Promise<string> => {
  const size = editSizeOf(
    await readBaselineSnapshot(fileSystem, snapshotRoot, baseline),
    sourceText,
  );
  const violation = editCapViolation(size, {
    maxBodyLines: flags.maxBodyLines ?? DEFAULT_EDIT_CAPS.maxBodyLines,
    maxDescriptionPercent: flags.maxDescriptionChange ?? DEFAULT_EDIT_CAPS.maxDescriptionPercent,
  });
  if (violation) {
    throw new Error(`Edit cap exceeded; nothing was recorded: ${violation}`);
  }
  return changeSummaryOf(size);
};

const changeSummaryFor = async (
  status: LedgerStatus,
  request: {
    readonly baseline: LedgerEntry;
    readonly fileSystem: FileSystem;
    readonly flags: TrainFlags;
    readonly snapshotRoot: string;
    readonly sourceText: string;
  },
): Promise<string | undefined> =>
  status === 'attempt'
    ? assertWithinEditCap(
        request.fileSystem,
        request.snapshotRoot,
        request.baseline,
        request.sourceText,
        request.flags,
      )
    : undefined;

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

const librarian: Route = (args, _read, write) => runLibrarian(args, write, defaultLibrarianDeps);

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

const statusFor = (flags: TrainFlags): LedgerStatus =>
  flags.status ?? (flags.measureOnly ? 'baseline' : 'attempt');

const structuralFailureFor = async (
  fileSystem: FileSystem,
  skillPath: string,
): Promise<string | undefined> => {
  try {
    await validateSkill(fileSystem, skillPath);
    return undefined;
  } catch (error) {
    return errorMessage(error);
  }
};

const contractSubjectFor = async (
  fileSystem: FileSystem,
  skillPath: string,
): Promise<ContractSubject> => {
  const paths = await skillEvaluationPathsFor(fileSystem, skillPath);
  const matrixText = await fileSystem.readFile(paths.matrixPaths[0] ?? '', 'utf8');
  if (
    paths.central
    && paths.fingerprints
    && fingerprint(matrixText) !== paths.fingerprints.casesSha256
  ) {
    throw new Error(`Skill case-matrix fingerprint is stale: ${paths.matrixPaths[0]}`);
  }
  const cases = paths.central
    ? parseEvaluationCasesJsonl(matrixText)
        .filter((evaluationCase) => evaluationCase.kind === 'contract')
        .map((evaluationCase) => ({
          assertions: evaluationCase.assertions,
          failureMode: evaluationCase.failureMode,
          id: evaluationCase.id,
          independentVerifier: evaluationCase.independentVerifier,
          repairBoundary: evaluationCase.repairBoundary,
          scenario: evaluationCase.scenario,
          visibility: evaluationCase.visibility,
        }))
    : parseMatrixJsonl(matrixText);
  return {
    cases,
    hardFailure: () => structuralFailureFor(fileSystem, skillPath),
    skillName: `${basename(skillPath)}-contract`,
    sourcePath: join(skillPath, 'SKILL.md'),
  };
};

const subjectFor = async (fileSystem: FileSystem, path: string): Promise<TrainSubject> => {
  if (!path.endsWith('.json')) {
    const evaluationPaths = await skillEvaluationPathsFor(fileSystem, path);
    const triggerText = await fileSystem.readFile(evaluationPaths.triggerQueriesPath, 'utf8');
    if (
      evaluationPaths.central
      && evaluationPaths.fingerprints
      && fingerprint(triggerText) !== evaluationPaths.fingerprints.activationQueriesSha256
    ) {
      throw new Error(
        `Skill activation-query fingerprint is stale: ${evaluationPaths.triggerQueriesPath}`,
      );
    }
    return {
      hardFailure: () => hardFailureFor(fileSystem, path),
      querySet: await loadTriggerQuerySet(fileSystem, evaluationPaths.triggerQueriesPath),
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

const ledgerSubjectFor = async (
  fileSystem: FileSystem,
  skillPath: string,
  flags: TrainFlags,
): Promise<{ readonly skillName: string; readonly sourcePath: string }> => {
  if (flags.track === 'contract') {
    return contractSubjectFor(fileSystem, skillPath);
  }
  const { querySet, sourcePath } = await subjectFor(fileSystem, skillPath);
  return { skillName: querySet.skillName, sourcePath };
};

const runTrainBundle = async (
  skillPath: string,
  flags: TrainFlags,
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  if (
    flags.runs
    || flags.status
    || flags.track
    || flags.maxBodyLines
    || flags.maxDescriptionChange
  ) {
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

const runTrainSelect = async (
  skillPath: string,
  flags: TrainFlags,
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  if (
    flags.runs
    || flags.status
    || flags.skillsRoot
    || flags.measureOnly
    || flags.maxBodyLines
    || flags.maxDescriptionChange
  ) {
    throw new Error(usage());
  }
  const { skillName, sourcePath } = await ledgerSubjectFor(fileSystem, skillPath, flags);
  const paths = await historyPathsFor(fileSystem, sourcePath, skillName, flags.ledgerRoot);
  const { ledgerPath, snapshotRoot } = paths;
  const entries = ledgerEntriesForSubject(await readLedger(fileSystem, ledgerPath), skillName);
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
    snapshot: snapshotPathFor(snapshotRoot, entry.id),
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
        doNotRetry: generation
          .filter(({ rejected, status }) => status === 'attempt' && rejected !== undefined)
          .map(({ attempt, id, rejected }) => ({ attempt, entryId: id, ...rejected })),
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

const scoredSubjectFor = async (
  skillPath: string,
  responsesPath: string | undefined,
  flags: TrainFlags,
  fileSystem: FileSystem,
): Promise<ScoredSubject> => {
  if (flags.track === 'contract') {
    const subject = await contractSubjectFor(fileSystem, skillPath);
    const measurement = measurementFromMatrix(
      subject.skillName,
      subject.cases,
      await fileSystem.readFile(subject.sourcePath, 'utf8'),
    );
    return {
      hardFailure: subject.hardFailure,
      matrixFingerprint: matrixFingerprintFor(subject.cases),
      measurement,
      queryIds: measurement.perQuery.map(({ id }) => id),
      skillName: subject.skillName,
      sourcePath: subject.sourcePath,
    };
  }
  const subject = await subjectFor(fileSystem, skillPath);
  const scoredSet = {
    ...subject.querySet,
    runsPerQuery: flags.runs ?? subject.querySet.runsPerQuery,
  };
  const records = await loadResponses(fileSystem, responsesPath ?? '');
  return {
    hardFailure: subject.hardFailure,
    matrixFingerprint: matrixFingerprintForQuerySet(scoredSet),
    measurement: measurementFromRecords(scoredSet, records),
    queryIds: scoredSet.queries.map(({ id }) => id),
    skillName: scoredSet.skillName,
    sourcePath: subject.sourcePath,
  };
};

const runTrainMeasure = async (
  skillPath: string,
  responsesPath: string | undefined,
  flags: TrainFlags,
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  assertMeasureArguments(skillPath, responsesPath, flags);
  const subject = await scoredSubjectFor(skillPath, responsesPath, flags, fileSystem);
  const { matrixFingerprint, measurement } = subject;
  const sourceText = await fileSystem.readFile(subject.sourcePath, 'utf8');
  const status = statusFor(flags);
  const paths = await historyPathsFor(
    fileSystem,
    subject.sourcePath,
    subject.skillName,
    flags.ledgerRoot,
  );
  const { ledgerPath, snapshotRoot } = paths;
  const ledgerEntries = await readLedger(fileSystem, ledgerPath);
  const priorEntries = ledgerEntriesForSubject(ledgerEntries, subject.skillName);
  const baseline = baselineEntryFor(priorEntries);
  const hardFailure = await subject.hardFailure();
  assertRecordable({
    baseline,
    hardFailure,
    ledgerPath,
    matrixFingerprint,
    queryIds: subject.queryIds,
    status,
  });
  const changeSummary = baseline
    ? await changeSummaryFor(status, { baseline, fileSystem, flags, snapshotRoot, sourceText })
    : undefined;
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
  const rejected =
    baseline && gate && changeSummary !== undefined
      ? rejectedEditFor(baseline, input, gate, changeSummary)
      : undefined;
  const entry = await appendLedgerEntry(
    fileSystem,
    ledgerPath,
    rejected ? { ...input, rejected } : input,
  );
  const snapshot = snapshotPathFor(snapshotRoot, entry.id);
  await writeText(fileSystem, snapshot, sourceText);
  write(
    JSON.stringify(
      {
        boundary: measurement.boundary,
        decision: gate,
        ledger: {
          entries: ledgerEntries.length + 1,
          entryId: entry.id,
          path: ledgerPath,
          snapshot,
        },
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
    if (!responsesPath && flags.track !== 'contract') {
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

const ROUTES: Readonly<Record<string, Route>> = {
  atoms: (args, _read, write, fileSystem) => runAtoms(args, write, fileSystem),
  audit: (args, _read, write, fileSystem) => runAudit(args, write, fileSystem),
  batch: (args, read, write) => runBatch(args, read, write),
  check: librarian,
  commit: librarian,
  evaluate: (args, read, write) => runSkillManagerEvaluation(args, read, write, usage),
  init: (args, _read, write, fileSystem) => runInit(args, write, fileSystem),
  propose: librarian,
  ratchet: (args, read, write) => runSkillManagerRatchet(args, read, write, usage),
  review: (args, _read, write, fileSystem) => runReview(args, write, fileSystem),
  seal: (args, _read, write) => runSeal(args, write, defaultSealDeps()),
  train: (args, _read, write, fileSystem) => runTrain(args, write, fileSystem),
  validate: (args, _read, write, fileSystem) => runValidate(args, write, fileSystem),
};

export const run = async (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer> = defaultRead,
  write: (message: string) => void = console.log,
  fileSystem: FileSystem = nodeFileSystem,
): Promise<void> => {
  const [command] = args;
  if (command !== undefined && Object.hasOwn(ROUTES, command)) {
    return ROUTES[command](args, read, write, fileSystem);
  }
  return runPacket(args, write);
};

export const createCommand = (overrides: SkillManagerOverrides = {}): CommandDeclaration<unknown> =>
  buildCommand(run, overrides);

export const command = createCommand();

void runMain(command, import.meta.main);
