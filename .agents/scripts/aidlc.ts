import { runAidlcCliWhenMain } from '../utils/aidlc/cli.js';
import {
  type AidlcGateExecutor,
  executeFinalGate,
  resolveAidlcGate,
  resolveFinalGate,
} from '../utils/aidlc/gate.js';
import {
  type AidlcIntent,
  type AidlcKnowledgeCloseout,
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
  validateAidlcKnowledgeCloseoutReferences,
  withAidlcKnowledgeCloseout,
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

const assertManualStageCommandAllowed = (
  command: string,
  intent: AidlcIntent,
): void => {
  if (command !== 'complete') return;
  if (intent.stage === 'build-and-test') {
    throw new Error(
      'Build and Test runs its configured final gate automatically; use complete <intent-path> with no evidence.',
    );
  }
  if (intent.stage === 'approval-handoff') {
    throw new Error(
      'Approval Handoff is completed atomically by approve <intent-path> "<handoff evidence>" after explicit user approval.',
    );
  }
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

const closeoutFor = async (
  disposition: string,
  details: readonly string[],
): Promise<AidlcKnowledgeCloseout> => {
  if (disposition === '--no-durable-lesson') {
    const [evidence] = details;
    if (!evidence?.trim() || details.length !== 1) {
      throw new Error(
        'No-capture knowledge closeout requires one factual assessment: closeout <intent-path> --no-durable-lesson "<knowledge-base assessment>".',
      );
    }
    return {
      completedAt: new Date().toISOString(),
      disposition: 'no-durable-lesson',
      evidence,
      references: [],
    };
  } else if (disposition === '--captured') {
    const [kbRoot, ...references] = details;
    if (!kbRoot || references.length === 0) {
      throw new Error(
        'Captured knowledge closeout requires: closeout <intent-path> --captured <private-kb-root> <concept-path>.',
      );
    }
    await validateAidlcKnowledgeCloseoutReferences(
      nodeFileSystem,
      kbRoot,
      references,
    );
    return {
      completedAt: new Date().toISOString(),
      disposition: 'captured',
      evidence: `Captured and validated KB concepts: ${references.join(', ')}.`,
      references,
    };
  }
  throw new Error(
    'Knowledge closeout must use --captured or --no-durable-lesson.',
  );
};

const isAutomaticBuildAndTest = (
  args: readonly string[],
): args is readonly ['complete', string] =>
  args[0] === 'complete' && args.length === 2 && Boolean(args[1]);

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
    return {
      intent,
      next: intent.kbCloseout
        ? { action: 'retire' }
        : { action: 'knowledge-base-closeout-and-retire' },
    };
  }
  if (intent.stage === 'approval-handoff') {
    const status = intent.route.find(
      (record) => record.slug === intent.stage,
    )?.status;
    if (status === 'awaiting-approval' && intent.approval !== 'approved') {
      return {
        intent,
        next: { action: 'await-user-approval', stage: intent.stage },
      };
    }
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
        'Each AIDLC record outcome requires string stage, evidence, and outcome (complete|skip).',
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
  const [command, intentPath, evidence] = args;
  if (
    command !== 'approve' ||
    !intentPath ||
    args.length < 2 ||
    args.length > 3
  )
    return false;
  const intent = await load(nodeFileSystem, intentPath);
  const activeApprovalHandoff =
    intent.stage === 'approval-handoff' &&
    intent.route.find((record) => record.slug === intent.stage)?.status ===
      'active';
  if (activeApprovalHandoff && !evidence?.trim()) {
    throw new Error(
      'Approval Handoff is active. After the user explicitly approves, call approve <intent-path> "<handoff evidence>" once; do not call complete first.',
    );
  }
  if (!activeApprovalHandoff && evidence !== undefined) {
    throw new Error(
      'Approval evidence is accepted only while Approval Handoff is active.',
    );
  }
  const next = activeApprovalHandoff
    ? approveAidlcIntent(completeAidlcStage(intent, evidence ?? ''))
    : approveAidlcIntent(intent);
  await update(nodeFileSystem, intentPath, next);
  await appendAudit(nodeFileSystem, intentPath, {
    at: new Date().toISOString(),
    detail: activeApprovalHandoff
      ? `User approval recorded with handoff evidence: ${evidence}`
      : 'User approval recorded for a legacy awaiting-approval intent.',
    stage: intent.stage,
    type: 'approval-granted',
  });
  write(JSON.stringify(nextActionFor(intentPath, next), null, 2));
  return true;
};

const runBuildAndTest = async (
  intentPath: string,
  intent: AidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
  executeGate?: AidlcGateExecutor,
): Promise<void> => {
  if (!intent.projectRoot) {
    throw new Error('Build and Test requires an absolute project root.');
  }
  const result = executeFinalGate(
    intent.projectRoot,
    resolveFinalGate(intent.projectRoot),
    executeGate,
  );
  if (result.exitCode === 0) {
    const next = completeAidlcStage(intent, result.receipt);
    await update(nodeFileSystem, intentPath, next);
    await appendAudit(nodeFileSystem, intentPath, {
      at: new Date().toISOString(),
      detail: result.receipt,
      stage: intent.stage,
      type: 'stage-completed',
    });
    write(
      JSON.stringify(
        { finalGate: result, ...nextActionFor(intentPath, next) },
        null,
      ),
    );
    return;
  }
  await appendAudit(nodeFileSystem, intentPath, {
    at: new Date().toISOString(),
    detail: result.receipt,
    stage: intent.stage,
    type: 'final-gate-failed',
  });
  write(
    JSON.stringify(
      {
        finalGate: result,
        intent,
        next: {
          action: 'repair-and-rerun-final-gate',
          stage: intent.stage,
        },
      },
      null,
    ),
  );
  process.exitCode = result.exitCode;
};

const runCloseout = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, intentPath, disposition, ...details] = args;
  if (command !== 'closeout') return false;
  if (!intentPath || !disposition) return false;
  const intent = await load(nodeFileSystem, intentPath);
  const closeout = await closeoutFor(disposition, details);
  const next = withAidlcKnowledgeCloseout(intent, closeout);
  await update(nodeFileSystem, intentPath, next);
  await appendAudit(nodeFileSystem, intentPath, {
    at: closeout.completedAt,
    detail: closeout.evidence,
    stage: intent.stage,
    type: 'knowledge-closeout',
  });
  write(
    JSON.stringify(
      { intent: next, knowledgeCloseout: closeout, next: { action: 'retire' } },
      null,
      2,
    ),
  );
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
  if (command !== 'retire' || !intentPath || args.length !== 2) return false;
  await retire(nodeFileSystem, intentPath);
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
  executeGate?: AidlcGateExecutor,
): Promise<boolean> => {
  const [command, intentPath, evidence] = args;
  if (isAutomaticBuildAndTest(args)) {
    const [, buildIntentPath] = args;
    const intent = await load(nodeFileSystem, buildIntentPath);
    if (intent.stage !== 'build-and-test') return false;
    await runBuildAndTest(
      buildIntentPath,
      intent,
      update,
      appendAudit,
      write,
      executeGate,
    );
    return true;
  }
  if (
    (command !== 'complete' && command !== 'skip') ||
    !intentPath ||
    !evidence ||
    args.length !== 3
  )
    return false;
  const intent = await load(nodeFileSystem, intentPath);
  assertManualStageCommandAllowed(command, intent);
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
    '    Required bootstrap. Resolves the explicit CBM index, creates/resumes the intent, records 0.1-0.3, and returns the final-gate command/path/source plus the 1.1 packet.',
    '  complete <intent-path> <evidence> | complete <intent-path> (Build and Test only)',
    '    Records one active non-gated stage. At Build and Test, omit evidence: it runs the one configured final gate and returns its receipt plus the next action.',
    '  skip <intent-path> <reason>',
    '    Factually skips the active non-gated stage and returns the next actionable packet.',
    '  record <intent-path> \'[{"stage":"<active-stage>","outcome":"<complete-or-skip>","evidence":"<factual evidence>"}]\' [--final-gate]',
    '    Batches consecutive outcomes from the active stage and returns one next action. outcome is required on every entry.',
    '    Use --final-gate only when the batch ends immediately before Build and Test; it executes the configured gate instead of accepting model-written 3.6 evidence.',
    '  approve <intent-path> "<handoff evidence>"',
    '    After explicit user approval at active 1.7, records the handoff and approval atomically, then returns the next required action. Legacy awaiting-approval intents use approve <intent-path>.',
    '  replan <intent-path> <evidence> | supersede <intent-path> <replacement-id>',
    '    Lifecycle corrections only; use when the user changes the approved direction.',
    '  closeout <intent-path> --captured <private-kb-root> <concept-path> [<concept-path>]',
    '    Records validated durable knowledge after the final gate. The knowledge-base skill owns capture and validation.',
    '  closeout <intent-path> --no-durable-lesson "<knowledge-base assessment>"',
    '    Records the factual KB assessment when no durable lesson should be captured.',
    '  retire <intent-path>',
    '    Removes a completed temporary intent only after an explicit knowledge-base closeout.',
    '  queue <agents-root> <cbm-index>',
    '    Diagnostics only. Use only to reconcile existing temporary intents; start omits unrelated intent records.',
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
  const resolvedGate = resolveAidlcGate(projectRoot);
  intent = completeAidlcStage(
    intent,
    'Workspace scaffolded: validated temporary intent path and CBM project index.',
  );
  intent = completeAidlcStage(
    intent,
    `Workspace detected: project root ${projectRoot}; final gate ${resolvedGate.command} (${resolvedGate.source} at ${resolvedGate.configPath}).`,
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
        finalGate: resolvedGate,
        intentPath: path,
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
): AidlcIntent => {
  if (
    transitions.some(
      (entry) =>
        entry.stage === 'approval-handoff' || entry.stage === 'build-and-test',
    )
  ) {
    throw new Error(
      'AIDLC record cannot complete Approval Handoff or Build and Test; use their dedicated atomic command.',
    );
  }
  let updated = intent;
  for (const [index, entry] of transitions.entries()) {
    updated = transitionForRecord(updated, entry);
    assertRecordCanContinue(updated, transitions.length - index - 1);
  }
  return updated;
};

const runRecord = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
  executeGate?: AidlcGateExecutor,
): Promise<boolean> => {
  const [command, intentPath, input, finalGateFlag] = args;
  if (
    command !== 'record' ||
    !intentPath ||
    !input ||
    !(
      args.length === 3 ||
      (args.length === 4 && finalGateFlag === '--final-gate')
    )
  )
    return false;
  const intent = await load(nodeFileSystem, intentPath);
  const transitions = parseRecordInputs(input);
  const projected = validateRecordTransitions(intent, transitions);
  if (
    finalGateFlag === '--final-gate' &&
    projected.stage !== 'build-and-test'
  ) {
    throw new Error(
      'record --final-gate must end immediately before Build and Test.',
    );
  }
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
  if (finalGateFlag === '--final-gate') {
    await runBuildAndTest(
      intentPath,
      persisted,
      update,
      appendAudit,
      write,
      executeGate,
    );
    return true;
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
  executeGate?: AidlcGateExecutor,
): Promise<boolean> => {
  if (runHelp(args, write)) return true;
  if (await runStart(args, save, write, load, resolve)) return true;
  if (await runRetire(args, retire, write)) return true;
  if (await runCloseout(args, load, update, appendAudit, write)) return true;
  if (await runQueue(args, write)) return true;
  if (await runSupersede(args, load, update, appendAudit, write)) return true;
  if (await runReplan(args, load, appendAudit, write)) return true;
  if (await runApprove(args, load, update, appendAudit, write)) return true;
  if (await runRecord(args, load, update, appendAudit, write, executeGate))
    return true;
  return runStage(args, load, update, appendAudit, write, executeGate);
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
  executeGate?: AidlcGateExecutor,
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
      executeGate,
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
