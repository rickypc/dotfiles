import { runAidlcCliWhenMain } from '../utils/aidlc/cli.js';
import {
  type AidlcIntent,
  acceptanceChecklistFor,
  aidlcIntentStatusFor,
  appendAidlcAuditEvent,
  approveAidlcIntent,
  assertNoIntentCollision,
  completeAidlcStage,
  createAidlcIntent,
  intentPathFor,
  loadAidlcIntent,
  retireAidlcIntent,
  saveAidlcIntent,
  skipAidlcStage,
  supersedeAidlcIntent,
  updateAidlcIntent,
} from '../utils/aidlc/intent.js';
import { inventoryAidlcIntents } from '../utils/aidlc/queue.js';
import { stagePacketFor } from '../utils/aidlc/stage.js';
import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import {
  assertKnownCbmProject,
  cbmCommands,
  resolveCbmProjectForRoot,
} from '../utils/codebase-memory.js';
import { nodeFileSystem } from '../utils/filesystem.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';
import { resolveFinalGate } from './aidlc/gate.js';

interface AidlcRecordInput {
  readonly evidence: string;
  readonly outcome: 'complete' | 'skip';
  readonly stage: string;
}

const agentsRootForIntent = (intentPath: string): string => {
  const marker = '/aidlc/';
  const markerIndex = intentPath.lastIndexOf(marker);
  if (!intentPath.startsWith('/') || markerIndex <= 0) {
    throw new Error(
      'AIDLC intent path must be under an absolute <agents-root>/aidlc directory.',
    );
  }
  return intentPath.slice(0, markerIndex);
};

const assertRecordCanContinue = (
  intent: AidlcIntent,
  remainingCount: number,
): void => {
  if (
    remainingCount > 0 &&
    (intent.stage === 'approval-handoff' ||
      (intent.stage === 'reverse-engineering' && !intent.kbContext.resolvedAt))
  ) {
    throw new Error(
      'AIDLC record cannot cross an approval or knowledge-context boundary.',
    );
  }
};

const isPrepare = (
  args: readonly string[],
): args is
  | readonly [string, string, string, string, string]
  | readonly [string, string, string, string, string, '--ui'] =>
  args[0] === 'prepare' &&
  (args.length === 5 || (args.length === 6 && args[5] === '--ui')) &&
  args.slice(1, 5).every(Boolean);

const isStart = (
  args: readonly string[],
): args is
  | readonly [string, string, string, string]
  | readonly [string, string, string, string, '--ui'] =>
  args[0] === 'start' &&
  (args.length === 4 || (args.length === 5 && args[4] === '--ui')) &&
  args.slice(1, 4).every(Boolean);

const nextActionFor = (intentPath: string, intent: AidlcIntent): object => {
  if (aidlcIntentStatusFor(intent) === 'completed') {
    return { intent, next: { action: 'knowledge-base-closeout-and-retire' } };
  }
  if (intent.stage === 'approval-handoff' && intent.approval !== 'approved') {
    return {
      intent,
      next: { action: 'await-user-approval', stage: intent.stage },
    };
  }
  if (intent.stage === 'reverse-engineering' && !intent.kbContext.resolvedAt) {
    return {
      intent,
      next: {
        action: 'resolve-knowledge-context',
        contextRequired: true,
        stage: intent.stage,
      },
    };
  }
  return {
    intent,
    stagePacket: stagePacketFor(agentsRootForIntent(intentPath), intent),
  };
};

const parseRecordInputs = (value: string): readonly AidlcRecordInput[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('AIDLC record inputs must be valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AIDLC record requires one or more stage outcomes.');
  }
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Each AIDLC record outcome must be an object.');
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.stage !== 'string' ||
      typeof record.evidence !== 'string' ||
      (record.outcome !== 'complete' && record.outcome !== 'skip')
    ) {
      throw new Error(
        'Each AIDLC record outcome requires stage, outcome (complete|skip), and evidence strings.',
      );
    }
    return {
      evidence: record.evidence,
      outcome: record.outcome,
      stage: record.stage,
    };
  });
};

const rejectAdvance = (command: string | undefined): void => {
  if (command === 'advance') {
    throw new Error(
      'Use complete with evidence or skip with a reason; advance cannot bypass a stage.',
    );
  }
};

export const resolveCbmIndexForStart = (
  projectRoot: string,
  execute: CommandExecutor = bunExecutor,
): Promise<string> => resolveCbmProjectForRoot(projectRoot, execute);

const runApprove = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, intentPath] = args;
  if (command !== 'approve' || !intentPath || args.length !== 2) return false;
  const intent = await load(nodeFileSystem, intentPath);
  const next = approveAidlcIntent(intent);
  await update(nodeFileSystem, intentPath, next);
  await appendAudit(nodeFileSystem, intentPath, {
    at: new Date().toISOString(),
    detail: 'User approval recorded.',
    stage: intent.stage,
    type: 'approval-granted',
  });
  write(JSON.stringify(nextActionFor(intentPath, next), null, 2));
  return true;
};

const runQueue = async (
  args: readonly string[],
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, agentsRoot, cbmIndex] = args;
  if (command !== 'queue' || !agentsRoot || !cbmIndex || args.length !== 3)
    return false;
  write(
    JSON.stringify(
      await inventoryAidlcIntents(nodeFileSystem, agentsRoot, cbmIndex),
    ),
  );
  return true;
};

const runReplan = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, intentPath, evidence] = args;
  if (command !== 'replan' || !intentPath || !evidence || args.length !== 3)
    return false;
  const intent = await load(nodeFileSystem, intentPath);
  await appendAudit(nodeFileSystem, intentPath, {
    at: new Date().toISOString(),
    detail: evidence,
    stage: intent.stage,
    type: 'intent-replanned',
  });
  write(JSON.stringify(nextActionFor(intentPath, intent), null, 2));
  return true;
};

const runRetire = async (
  args: readonly string[],
  retire: typeof retireAidlcIntent,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, intentPath] = args;
  if (command !== 'retire' || !intentPath || args.length < 2) return false;
  const [kbRoot, ...kbReferences] = args.slice(2);
  await retire(nodeFileSystem, intentPath, kbRoot, kbReferences);
  write(
    JSON.stringify({ intentPath, next: { action: 'done', status: 'retired' } }),
  );
  return true;
};

const runStage = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, intentPath, evidence] = args;
  if (
    (command !== 'complete' && command !== 'skip') ||
    !intentPath ||
    !evidence ||
    args.length !== 3
  )
    return false;
  const intent = await load(nodeFileSystem, intentPath);
  const next =
    command === 'complete'
      ? completeAidlcStage(intent, evidence)
      : skipAidlcStage(intent, evidence);
  await update(nodeFileSystem, intentPath, next);
  await appendAudit(nodeFileSystem, intentPath, {
    at: new Date().toISOString(),
    detail: evidence,
    stage: intent.stage,
    type: command === 'complete' ? 'stage-completed' : 'stage-skipped',
  });
  write(JSON.stringify(nextActionFor(intentPath, next), null, 2));
  return true;
};

const runSupersede = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, intentPath, replacementId] = args;
  if (
    command !== 'supersede' ||
    !intentPath ||
    !replacementId ||
    args.length !== 3
  )
    return false;
  const intent = await load(nodeFileSystem, intentPath);
  const next = supersedeAidlcIntent(intent, replacementId);
  await update(nodeFileSystem, intentPath, next);
  await appendAudit(nodeFileSystem, intentPath, {
    at: new Date().toISOString(),
    detail: `Superseded by ${replacementId}.`,
    stage: intent.stage,
    type: 'intent-superseded',
  });
  write(
    JSON.stringify({
      intent: next,
      next: { action: 'start-replacement-intent', replacementId },
    }),
  );
  return true;
};

const transitionForRecord = (
  intent: AidlcIntent,
  entry: AidlcRecordInput,
): AidlcIntent => {
  if (entry.stage !== intent.stage) {
    throw new Error(
      `AIDLC record outcomes must be consecutive; expected ${intent.stage}, received ${entry.stage}.`,
    );
  }
  return entry.outcome === 'complete'
    ? completeAidlcStage(intent, entry.evidence)
    : skipAidlcStage(intent, entry.evidence);
};

export const usage = (): string =>
  [
    'Usage: bun ~/.agents/scripts/aidlc.ts <command> ...',
    '',
    'Commands:',
    '  start <agents-root> <absolute-project-root> <intent-summary> [--ui]',
    '    Required bootstrap. Resolves the explicit CBM index, creates/resumes the intent, records 0.1-0.3, and returns the queue and 1.1 packet.',
    '  complete <intent-path> <evidence>',
    '    Records the active non-gated stage and returns the next actionable packet.',
    '  skip <intent-path> <reason>',
    '    Factually skips the active non-gated stage and returns the next actionable packet.',
    "  record <intent-path> '<stage-outcomes-json>'",
    '    Records consecutive complete/skip outcomes in one call; it stops before approval and knowledge-context boundaries.',
    '  approve <intent-path>',
    '    Records the user approval at 1.7 and returns the next required action.',
    '  replan <intent-path> <evidence> | supersede <intent-path> <replacement-id>',
    '    Lifecycle corrections only; use when the user changes the approved direction.',
    '  retire <intent-path> [<private-kb-root> <concept-path>...]',
    '    Removes a completed temporary intent after knowledge-base closeout.',
    '  queue <agents-root> <cbm-index>',
    '    Diagnostics only. start already returns this snapshot.',
    '  prepare <agents-root> <cbm-index> <absolute-project-root> <intent-summary> [--ui]',
    '    Legacy compatibility only. Never use it for a new run; start resolves the index safely.',
    '',
    'Do not run which codebase-memory-mcp or command --help probes. start and lifecycle commands provide the needed state.',
  ].join('\n');

const runHelp = (
  args: readonly string[],
  write: (message: string) => void,
): boolean => {
  if (
    !(
      (args.length === 1 && (args[0] === 'help' || args[0] === '--help')) ||
      (args.length === 2 && args[1] === '--help')
    )
  ) {
    return false;
  }
  write(usage());
  return true;
};

const runPrepare = async (
  args: readonly string[],
  save: typeof saveAidlcIntent,
  write: (message: string) => void,
  load: typeof loadAidlcIntent,
  verify: (index: string) => Promise<void>,
): Promise<void> => {
  if (!isPrepare(args)) throw new Error(usage());
  const [, agentsRoot, cbmIndex, projectRoot, summary, uiFlag] = args;
  await verify(cbmIndex);
  let intent: AidlcIntent = createAidlcIntent(cbmIndex, summary, {
    projectRoot,
    uiRequired: uiFlag === '--ui',
  });
  const path = intentPathFor(agentsRoot, cbmIndex, intent.id);
  let existing: AidlcIntent | undefined;
  try {
    existing = await load(nodeFileSystem, path);
  } catch (error) {
    if (
      !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    ) {
      throw error;
    }
  }
  assertNoIntentCollision(existing, summary);
  intent = completeAidlcStage(
    intent,
    'Workspace scaffolded: validated temporary intent path and CBM project index.',
  );
  intent = completeAidlcStage(
    intent,
    `Workspace detected: project root ${projectRoot}; final gate ${resolveFinalGate(projectRoot)}.`,
  );
  intent = completeAidlcStage(
    intent,
    'State initialized: selected four-phase route and deterministic UI applicability recorded.',
  );
  await save(nodeFileSystem, path, intent);
  write(
    JSON.stringify(
      {
        acceptanceChecklist: acceptanceChecklistFor(summary, uiFlag === '--ui'),
        cbmIndex,
        finalGate: resolveFinalGate(projectRoot),
        intentPath: path,
        queue: await inventoryAidlcIntents(
          nodeFileSystem,
          agentsRoot,
          cbmIndex,
        ),
        stagePacket: stagePacketFor(agentsRoot, intent),
      },
      null,
    ),
  );
};

const runStart = async (
  args: readonly string[],
  save: typeof saveAidlcIntent,
  write: (message: string) => void,
  load: typeof loadAidlcIntent,
  resolve: (projectRoot: string) => Promise<string>,
): Promise<boolean> => {
  if (!isStart(args)) return false;
  const [, agentsRoot, projectRoot, summary, uiFlag] = args;
  const cbmIndex = await resolve(projectRoot);
  await runPrepare(
    [
      'prepare',
      agentsRoot,
      cbmIndex,
      projectRoot,
      summary,
      ...(uiFlag ? [uiFlag] : []),
    ],
    save,
    write,
    load,
    async () => undefined,
  );
  return true;
};

const validateRecordTransitions = (
  intent: AidlcIntent,
  transitions: readonly AidlcRecordInput[],
): void => {
  let updated = intent;
  for (const [index, entry] of transitions.entries()) {
    updated = transitionForRecord(updated, entry);
    assertRecordCanContinue(updated, transitions.length - index - 1);
  }
};

const runRecord = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, intentPath, input] = args;
  if (command !== 'record' || !intentPath || !input || args.length !== 3)
    return false;
  const intent = await load(nodeFileSystem, intentPath);
  const transitions = parseRecordInputs(input);
  validateRecordTransitions(intent, transitions);
  let persisted = intent;
  for (const entry of transitions) {
    const next = transitionForRecord(persisted, entry);
    await update(nodeFileSystem, intentPath, next);
    await appendAudit(nodeFileSystem, intentPath, {
      at: new Date().toISOString(),
      detail: entry.evidence,
      stage: persisted.stage,
      type: entry.outcome === 'complete' ? 'stage-completed' : 'stage-skipped',
    });
    persisted = next;
  }
  write(JSON.stringify(nextActionFor(intentPath, persisted), null, 2));
  return true;
};

const runHandledCommand = async (
  args: readonly string[],
  save: typeof saveAidlcIntent,
  write: (message: string) => void,
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  retire: typeof retireAidlcIntent,
  resolve: (projectRoot: string) => Promise<string>,
): Promise<boolean> => {
  if (runHelp(args, write)) return true;
  if (await runStart(args, save, write, load, resolve)) return true;
  if (await runRetire(args, retire, write)) return true;
  if (await runQueue(args, write)) return true;
  if (await runSupersede(args, load, update, appendAudit, write)) return true;
  if (await runReplan(args, load, appendAudit, write)) return true;
  if (await runApprove(args, load, update, appendAudit, write)) return true;
  if (await runRecord(args, load, update, appendAudit, write)) return true;
  return runStage(args, load, update, appendAudit, write);
};

export const run = async (
  args: readonly string[],
  save: typeof saveAidlcIntent = saveAidlcIntent,
  write: (message: string) => void = console.log,
  load: typeof loadAidlcIntent = loadAidlcIntent,
  update: typeof updateAidlcIntent = updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent = appendAidlcAuditEvent,
  retire: typeof retireAidlcIntent = retireAidlcIntent,
  verify?: (index: string) => Promise<void>,
  resolve?: (projectRoot: string) => Promise<string>,
): Promise<void> => {
  const resolveProject =
    resolve ??
    (() =>
      Promise.reject(
        new Error('AIDLC start requires CBM project resolution.'),
      ));
  if (
    await runHandledCommand(
      args,
      save,
      write,
      load,
      update,
      appendAudit,
      retire,
      resolveProject,
    )
  )
    return;
  rejectAdvance(args[0]);
  if (!isPrepare(args)) throw new Error(usage());
  if (!verify)
    throw new Error('AIDLC prepare requires CBM project validation.');
  await runPrepare(args, save, write, load, verify);
};

export async function verifyCbmIndex(
  index: string,
  execute: CommandExecutor = bunExecutor,
): Promise<void> {
  const result = await execute(cbmCommands.listProjects());
  if (result.code !== 0) throw new Error('CBM project list is unavailable.');
  assertKnownCbmProject(index, `${result.stdout}\n${result.stderr}`);
}

export const runWhenMain = runCliWhenMain;

export const runMain = (args: readonly string[]): Promise<void> =>
  run(
    args,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    verifyCbmIndex,
    resolveCbmIndexForStart,
  );

runAidlcCliWhenMain(import.meta.main, Bun.argv.slice(2), runMain);
