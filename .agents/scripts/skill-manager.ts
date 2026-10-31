import { dirname, join } from 'node:path';

import { runWhenMain as runCliWhenMain, runWhenMainWithHelp } from '../utils/cli.js';
import { type FileSystem, nodeFileSystem, readText } from '../utils/filesystem.js';
import { fingerprint, renderActionPacket } from '../utils/quality-engine/packet.js';
import { ROUTER_INSTRUCTIONS } from '../utils/quality-engine/provider.js';
import type { WorkflowState } from '../utils/quality-engine/state.js';
import {
  appendLedgerEntry,
  baselineEntryFor,
  buildSkillCatalog,
  decideNeverWorseGate,
  defaultLedgerRootFor,
  type LedgerStatus,
  ledgerPathFor,
  loadResponses,
  loadTriggerQuerySet,
  matrixFingerprintForQuerySet,
  measurementFromRecords,
  readLedger,
} from '../utils/quality-engine/train.js';
import {
  createSkillManagerPacket,
  evaluateSkillManagerBatch,
  evaluateSkillMatrix,
  initializeSkill,
  parseMatrixJsonl,
  reviewSkillProse,
  validateSkill,
} from '../utils/skill-manager.js';

interface TrainFlags {
  attempt: number;
  ledgerRoot?: string;
  measureOnly: boolean;
  runs?: number;
  skillsRoot?: string;
  status?: LedgerStatus;
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
    '  bun <agents-root>/scripts/skill-manager.ts train bundle <absolute-skill-path> [--skills-root <absolute-path>]',
    '  bun <agents-root>/scripts/skill-manager.ts train measure <absolute-skill-path> <absolute-responses-jsonl-path> [--attempt <n>] [--runs <n>] [--measure-only] [--status <ledger-status>] [--ledger-root <absolute-path>] [--skills-root <absolute-path>]',
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
  'blocked',
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

const runTrainBundle = async (
  skillPath: string,
  flags: TrainFlags,
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  if (flags.runs || flags.status) {
    throw new Error(usage());
  }
  const skillsRoot = flags.skillsRoot ?? join(agentsRoot(), 'skills');
  const querySet = await loadTriggerQuerySet(
    fileSystem,
    join(skillPath, 'evals', 'trigger-queries.json'),
  );
  const catalog = await buildSkillCatalog(fileSystem, skillsRoot);
  write(
    JSON.stringify(
      {
        boundary: 'in-session',
        catalog,
        instructions: ROUTER_INSTRUCTIONS,
        passThreshold: querySet.passThreshold,
        queries: querySet.queries,
        responseContract: 'one JSON object per line with query_id, run, and skill_name fields',
        runsPerQuery: querySet.runsPerQuery,
        skillName: querySet.skillName,
        sourcePath: querySet.sourcePath,
        splits: querySet.splits,
      },
      null,
      2,
    ),
  );
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
  const querySet = await loadTriggerQuerySet(
    fileSystem,
    join(skillPath, 'evals', 'trigger-queries.json'),
  );
  const scoredSet = flags.runs ? { ...querySet, runsPerQuery: flags.runs } : querySet;
  const records = await loadResponses(fileSystem, responsesPath);
  const measurement = measurementFromRecords(scoredSet, records);
  const sourceText = await fileSystem.readFile(join(skillPath, 'SKILL.md'), 'utf8');
  const sourceFingerprint = fingerprint(sourceText);
  const matrixFingerprint = matrixFingerprintForQuerySet(scoredSet);
  const status: LedgerStatus = flags.status ?? (flags.measureOnly ? 'baseline' : 'attempt');
  const boundary = measurement.boundary;
  const timestamp = new Date().toISOString();
  const ledgerRoot = flags.ledgerRoot ?? defaultLedgerRootFor(agentsRoot());
  const ledgerPath = ledgerPathFor(ledgerRoot, scoredSet.skillName);
  const priorEntries = await readLedger(fileSystem, ledgerPath);
  const baseline = baselineEntryFor(priorEntries);
  if (status !== 'baseline' && !baseline) {
    throw new Error(
      `A recorded baseline is required before a ${status} ledger entry: ${ledgerPath}`,
    );
  }
  const gate =
    baseline && status !== 'baseline'
      ? decideNeverWorseGate(baseline, {
          attempt: flags.attempt,
          boundary,
          matrixFingerprint,
          measurement,
          sourceFingerprint,
          status,
          timestamp,
        })
      : undefined;
  const entry = await appendLedgerEntry(fileSystem, ledgerPath, {
    attempt: flags.attempt,
    boundary,
    matrixFingerprint,
    measurement,
    sourceFingerprint,
    status,
    timestamp,
  });
  write(
    JSON.stringify(
      {
        boundary,
        decision: gate,
        ledger: { entries: priorEntries.length + 1, entryId: entry.id, path: ledgerPath },
        matrixFingerprint,
        measurement,
        skillPath,
        sourceFingerprint,
        status,
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
  throw new Error(usage());
};

export const run = async (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer> = defaultRead,
  write: (message: string) => void = console.log,
  fileSystem: FileSystem = nodeFileSystem,
): Promise<void> => {
  const [command, first, second, third, fourth] = args;
  if (command === 'init') {
    await runInit(args, write, fileSystem);
    return;
  }
  if (command === 'validate') {
    await runValidate(args, write, fileSystem);
    return;
  }
  if (command === 'review') {
    await runReview(args, write, fileSystem);
    return;
  }
  if (command === 'batch') {
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
        evaluateSkillManagerBatch(first ?? '', second as 'baseline' | 'candidate', sources),
        null,
        2,
      ),
    );
    return;
  }
  if (command === 'evaluate') {
    if (!first || !second || !third || fourth || args.length !== 4) {
      throw new Error(usage());
    }
    const [matrixContent, sourceContent] = await Promise.all([read(second), read(third)]);
    const matrixJsonl = String(matrixContent);
    const sourceText = String(sourceContent);
    const receipt = evaluateSkillMatrix(
      parseMatrixJsonl(matrixJsonl),
      { delegatedChecks: {}, ownedFiles: new Set(), text: sourceText },
      fingerprint(sourceText),
      phaseFor(first),
    );
    write(JSON.stringify(receipt, null, 2));
    return;
  }
  if (command === 'train') {
    await runTrain(args, write, fileSystem);
    return;
  }
  runPacket(args, write);
};

export const runWhenMain = runCliWhenMain;

void runWhenMainWithHelp(import.meta.main, Bun.argv.slice(2), usage, run);
