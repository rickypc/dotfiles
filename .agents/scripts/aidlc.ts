// biome-ignore lint/style/noExcessiveLinesPerFile: AIDLC public CLI dispatch remains intentionally centralized.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAidlcCliWhenMain } from '../utils/aidlc/cli.js';
import { renderAidlcCommandContract } from '../utils/aidlc/command-contract.js';
import {
  type AidlcGateExecutor,
  executeFinalGate,
  resolveAidlcGate,
  resolveFinalGate,
} from '../utils/aidlc/gate.js';
import {
  type AidlcIntent,
  type AidlcKnowledgeCloseout,
  type AidlcKnowledgeCompressionEntry,
  type AidlcKnowledgeCompressionSession,
  acceptanceChecklistFor,
  aidlcIntentStatusFor,
  appendAidlcAuditEvent,
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
  validateAidlcConstructionPlan,
  validateAidlcKnowledgeCloseoutReferences,
  withAidlcKnowledgeCloseout,
} from '../utils/aidlc/intent.js';
import { inventoryAidlcIntents } from '../utils/aidlc/queue.js';
import {
  assertAidlcRecordCanContinue,
  parseAidlcRecordInputs,
  transitionForAidlcRecord,
  validateAidlcRecordTransitions,
} from '../utils/aidlc/record.js';
import { stagePacketFor } from '../utils/aidlc/stage.js';
import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { resolveCbmProjectForRoot } from '../utils/codebase-memory.js';
import {
  type FileSystem,
  nodeFileSystem,
  parentDirectory,
  readText,
} from '../utils/filesystem.js';
import {
  captureConcept,
  type OkfMetadata,
  parseOkfConcept,
  type ReconciliationPlan,
  reconcileConcepts,
} from '../utils/knowledge-base.js';
import {
  claimCompressionLock,
  finalizeCompression,
  guardCompression,
  resumeCompressionGuard,
} from '../utils/md-compress.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';
import { runAidlcApprove } from './aidlc/approval.js';

interface AidlcCaptureBatch {
  readonly entries: readonly AidlcKnowledgeCompressionEntry[];
  readonly receipt: unknown;
}

type AidlcCaptureOrReconciliationRequest =
  | AidlcCaptureRequest
  | ReconciliationPlan;

interface AidlcCaptureRequest {
  readonly body: string;
  readonly evidence: string;
  readonly metadata: OkfMetadata;
  readonly relativePath: string;
}

interface AidlcCloseoutCommand {
  readonly details: readonly string[];
  readonly disposition: string;
}

export interface AidlcCloseoutDependencies {
  readonly clock: { readonly now: () => number };
  readonly digest: { readonly sha256: (value: string) => string };
  readonly fileSystem: FileSystem;
  readonly readRequest: (path: string) => Promise<string>;
}

interface AidlcRecordOptions {
  readonly closeout?: AidlcCloseoutCommand;
  readonly finalGate: boolean;
  readonly input: string;
  readonly intentPath: string;
}

interface AidlcStartOptions {
  readonly initialRecord?: string;
  readonly uiRequired: boolean;
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

export const agentsRootForScript = (scriptUrl = import.meta.url): string =>
  parentDirectory(parentDirectory(fileURLToPath(scriptUrl)));

const applyInitialRecord = (
  intent: AidlcIntent,
  initialRecord: string,
): AidlcIntent => {
  const transitions = parseAidlcRecordInputs(initialRecord);
  let next = intent;
  for (const [index, entry] of transitions.entries()) {
    if (
      entry.stage === 'approval-handoff' ||
      entry.stage === 'build-and-test'
    ) {
      throw new Error(
        'AIDLC start --initial-record cannot cross Approval Handoff or Build and Test.',
      );
    }
    next =
      entry.outcome === 'complete'
        ? completeAidlcStage(next, entry.evidence)
        : skipAidlcStage(next, entry.evidence);
    assertAidlcRecordCanContinue(next, transitions.length - index - 1);
  }
  if (next.stage !== 'approval-handoff') {
    throw new Error(
      'AIDLC start --initial-record must end at Approval Handoff after consecutive evidence-backed stages.',
    );
  }
  return next;
};

const assertManualStageCommandAllowed = (
  command: string,
  intent: AidlcIntent,
): void => {
  if (command !== 'complete') {
    return;
  }
  if (intent.stage === 'build-and-test') {
    throw new Error(
      'Build and Test runs its configured final gate automatically; use complete <intent-path> with no evidence.',
    );
  }
  if (intent.stage === 'approval-handoff') {
    throw new Error(
      'Approval Handoff is completed atomically by approve <intent-path> "<approval-evidence>" after explicit user approval.',
    );
  }
};

const captureRequestFor = (
  content: string,
): AidlcCaptureOrReconciliationRequest => {
  const request = JSON.parse(content) as Partial<
    AidlcCaptureRequest & ReconciliationPlan
  >;
  if (
    request.canonicalPath !== undefined ||
    request.links !== undefined ||
    request.operations !== undefined
  ) {
    if (
      !request.canonicalPath?.trim() ||
      !Array.isArray(request.links) ||
      !Array.isArray(request.operations)
    ) {
      throw new Error(
        'AIDLC reconciliation request requires canonicalPath, links, and operations.',
      );
    }
    return request as ReconciliationPlan;
  }
  if (
    !request.body?.trim() ||
    !request.evidence?.trim() ||
    !request.relativePath?.trim() ||
    !request.metadata
  ) {
    throw new Error(
      'AIDLC capture request requires relativePath, metadata, body, and evidence.',
    );
  }
  return request as AidlcCaptureRequest;
};

const closeoutCommandFor = (
  disposition: string | undefined,
  details: readonly string[],
): AidlcCloseoutCommand => ({ details, disposition: disposition ?? '' });

const closeoutFor = async (
  disposition: string,
  details: readonly string[],
): Promise<AidlcKnowledgeCloseout> => {
  if (disposition === '--no-durable-lesson') {
    const [evidence] = details;
    if (!evidence?.trim() || details.length !== 1) {
      throw new Error(
        'No-capture knowledge closeout requires one factual assessment: --no-durable-lesson "<knowledge-base-assessment>".',
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
        'Captured knowledge closeout requires: --captured <private-kb-root> <concept-path>.',
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

const completeCloseoutCommandFor = (
  args: readonly string[],
): AidlcCloseoutCommand | undefined => {
  if (args[0] !== 'complete' || args[2] !== '--closeout') {
    return undefined;
  }
  return closeoutCommandFor(args[3], args.slice(4));
};

const compressionBackupRoot = (): string => join(tmpdir(), 'aidlc-md-compress');

const guardEntry = async (
  dependencies: AidlcCloseoutDependencies,
  sourcePath: string,
  reference: string,
) => {
  const guard = await guardCompression(
    dependencies.fileSystem,
    compressionBackupRoot(),
    sourcePath,
    dependencies.digest,
  );
  await claimCompressionLock(
    dependencies.fileSystem,
    guard,
    dependencies.clock,
    60_000,
  );
  return {
    backupPath: guard.backupPath,
    lockPath: guard.lockPath,
    reference,
    sourcePath,
  };
};

const captureReconciliationAndBegin = async (
  request: ReconciliationPlan,
  kbRoot: string,
  dependencies: AidlcCloseoutDependencies,
): Promise<AidlcCaptureBatch> => {
  const entries: AidlcKnowledgeCompressionEntry[] = [];
  for (const operation of request.operations) {
    if (operation.disposition === 'new-primary') {
      continue;
    }
    const sourcePath = `${kbRoot.replace(/\/$/u, '')}/${operation.relativePath}`;
    entries.push(
      await guardEntry(dependencies, sourcePath, operation.relativePath),
    );
  }
  const receipt = await reconcileConcepts(
    dependencies.fileSystem,
    kbRoot,
    request,
  );
  for (const operation of request.operations) {
    if (operation.disposition !== 'new-primary') {
      continue;
    }
    const sourcePath = `${kbRoot.replace(/\/$/u, '')}/${operation.relativePath}`;
    entries.push(
      await guardEntry(dependencies, sourcePath, operation.relativePath),
    );
  }
  return { entries, receipt };
};

const captureSingleAndBegin = async (
  request: AidlcCaptureRequest,
  kbRoot: string,
  dependencies: AidlcCloseoutDependencies,
): Promise<AidlcCaptureBatch> => {
  const captured = await captureConcept(
    dependencies.fileSystem,
    kbRoot,
    request.relativePath,
    request.metadata,
    request.body,
    request.evidence,
  );
  return {
    entries: [
      await guardEntry(
        dependencies,
        captured.conceptPath,
        request.relativePath,
      ),
    ],
    receipt: captured,
  };
};

const isReconciliationRequest = (
  request: AidlcCaptureOrReconciliationRequest,
): request is ReconciliationPlan => 'operations' in request;

const sessionEntriesFor = (session: AidlcKnowledgeCompressionSession) =>
  'entries' in session ? session.entries : [session];

const systemClock: AidlcCloseoutDependencies['clock'] = { now: Date.now };

const systemDigest: AidlcCloseoutDependencies['digest'] = {
  sha256: (value) => createHash('sha256').update(value).digest('hex'),
};

const readSystemRequest: AidlcCloseoutDependencies['readRequest'] =
  readText.bind(undefined, nodeFileSystem);

export const closeoutDependenciesFor = (
  clock: AidlcCloseoutDependencies['clock'],
  digest: AidlcCloseoutDependencies['digest'],
  fileSystem: FileSystem,
  readRequest: AidlcCloseoutDependencies['readRequest'],
): AidlcCloseoutDependencies => ({ clock, digest, fileSystem, readRequest });

export const defaultCloseoutDependencies = (): AidlcCloseoutDependencies =>
  closeoutDependenciesFor(
    systemClock,
    systemDigest,
    nodeFileSystem,
    readSystemRequest,
  );

const isAutomaticBuildAndTest = (
  args: readonly string[],
): args is readonly ['complete', string] =>
  args[0] === 'complete' && args.length === 2 && Boolean(args[1]);

const nextActionFor = (intentPath: string, intent: AidlcIntent): object => {
  if (aidlcIntentStatusFor(intent) === 'completed') {
    return {
      intent,
      next: intent.kbCloseout
        ? { action: 'recover-retirement' }
        : { action: 'knowledge-base-closeout-and-recover' },
    };
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

export const projectRootForRuntime = (
  agentsRoot: string,
  cwd: string,
  homeDirectory = homedir(),
): string => {
  const globalAgentsRoot = join(homeDirectory, '.agents');
  if (agentsRoot !== globalAgentsRoot) {
    return parentDirectory(agentsRoot);
  }
  return cwd === globalAgentsRoot || cwd.startsWith(`${globalAgentsRoot}/`)
    ? homeDirectory
    : cwd;
};

const recordOptionsFor = (
  args: readonly string[],
): AidlcRecordOptions | undefined => {
  const [command, intentPath, input, ...options] = args;
  if (command !== 'record' || !intentPath || !input) {
    return undefined;
  }
  if (options.length === 0) {
    return { finalGate: false, input, intentPath };
  }
  if (options[0] !== '--final-gate') {
    return undefined;
  }
  if (options.length === 1) {
    return { finalGate: true, input, intentPath };
  }
  if (options[1] !== '--closeout') {
    return undefined;
  }
  return {
    closeout: closeoutCommandFor(options[2], options.slice(3)),
    finalGate: true,
    input,
    intentPath,
  };
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

const runBootstrap = async (
  agentsRoot: string,
  cbmIndex: string,
  projectRoot: string,
  summary: string,
  uiRequired: boolean,
  save: typeof saveAidlcIntent,
  write: (message: string) => void,
  load: typeof loadAidlcIntent,
  initialRecord?: string,
): Promise<void> => {
  let intent: AidlcIntent = createAidlcIntent(cbmIndex, summary, {
    projectRoot,
    uiRequired,
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
  if (initialRecord) {
    intent = applyInitialRecord(intent, initialRecord);
  }
  await save(nodeFileSystem, path, intent);
  write(
    JSON.stringify(
      {
        acceptanceChecklist: acceptanceChecklistFor(summary, uiRequired),
        cbmIndex,
        finalGate: resolvedGate,
        initialRecordApplied: Boolean(initialRecord),
        intentPath: path,
        ...nextActionFor(path, intent),
      },
      null,
    ),
  );
};

const runBuildAndTest = async (
  intentPath: string,
  intent: AidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
  executeGate?: AidlcGateExecutor,
  closeout?: AidlcKnowledgeCloseout,
  retire: typeof retireAidlcIntent = retireAidlcIntent,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: lifecycle closeout keeps gate, audit, persistence, and retirement outcomes explicit.
): Promise<void> => {
  if (!intent.projectRoot) {
    throw new Error('Build and Test requires an absolute project root.');
  }
  if (existsSync(intentPath)) {
    validateAidlcConstructionPlan(
      await readText(nodeFileSystem, intentPath),
      intent.projectRoot,
    );
  }
  const result = executeFinalGate(
    intent.projectRoot,
    resolveFinalGate(intent.projectRoot),
    executeGate,
  );
  if (result.exitCode === 0) {
    const stageIsCompleted =
      intent.route.find((record) => record.slug === intent.stage)?.status ===
      'completed';
    const next = stageIsCompleted
      ? intent
      : completeAidlcStage(intent, result.receipt);
    if (!stageIsCompleted) {
      await update(nodeFileSystem, intentPath, next);
    }
    await appendAudit(nodeFileSystem, intentPath, {
      at: new Date().toISOString(),
      detail: result.receipt,
      stage: intent.stage,
      type: stageIsCompleted ? 'final-gate-revalidated' : 'stage-completed',
    });
    if (closeout) {
      const closed = withAidlcKnowledgeCloseout(next, closeout);
      await update(nodeFileSystem, intentPath, closed);
      await appendAudit(nodeFileSystem, intentPath, {
        at: closeout.completedAt,
        detail: closeout.evidence,
        stage: next.stage,
        type: 'knowledge-closeout',
      });
      await retire(nodeFileSystem, intentPath);
      write(
        JSON.stringify(
          {
            finalGate: result,
            intentPath,
            knowledgeCloseout: closeout,
            next: { action: 'done', status: 'retired' },
          },
          null,
          2,
        ),
      );
      return;
    }
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

const runAutomaticBuildAndTest = async (
  intentPath: string,
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
  executeGate?: AidlcGateExecutor,
): Promise<boolean> => {
  const intent = await load(nodeFileSystem, intentPath);
  if (intent.stage !== 'build-and-test') {
    return false;
  }
  await runBuildAndTest(
    intentPath,
    intent,
    update,
    appendAudit,
    write,
    executeGate,
  );
  return true;
};

const runBuildAndTestWithCloseout = async (
  intentPath: string,
  closeoutCommand: AidlcCloseoutCommand,
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
  retire: typeof retireAidlcIntent,
  executeGate?: AidlcGateExecutor,
): Promise<void> => {
  const intent = await load(nodeFileSystem, intentPath);
  if (intent.stage !== 'build-and-test') {
    throw new Error(
      'complete --closeout is valid only at active Build and Test.',
    );
  }
  const closeout = await closeoutFor(
    closeoutCommand.disposition,
    closeoutCommand.details,
  );
  await runBuildAndTest(
    intentPath,
    intent,
    update,
    appendAudit,
    write,
    executeGate,
    closeout,
    retire,
  );
};

const runCaptureAndBegin = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  write: (message: string) => void,
  dependencies: AidlcCloseoutDependencies,
): Promise<boolean> => {
  const [command, intentPath, kbRoot, requestPath] = args;
  if (
    command !== 'capture-and-begin' ||
    !intentPath ||
    !kbRoot ||
    !requestPath ||
    args.length !== 4
  ) {
    return false;
  }
  const intent = await load(nodeFileSystem, intentPath);
  if (aidlcIntentStatusFor(intent) !== 'completed' || intent.kbCloseout) {
    throw new Error(
      'capture-and-begin requires a passed final gate without a knowledge closeout.',
    );
  }
  if (intent.kbCompressionSession) {
    throw new Error(
      'AIDLC knowledge compression is already active; use its returned finalize-and-recover action.',
    );
  }
  const request = captureRequestFor(
    await dependencies.readRequest(requestPath),
  );
  const capture = isReconciliationRequest(request)
    ? await captureReconciliationAndBegin(request, kbRoot, dependencies)
    : await captureSingleAndBegin(request, kbRoot, dependencies);
  const session: AidlcKnowledgeCompressionSession = {
    entries: capture.entries,
    kbRoot,
  };
  await update(nodeFileSystem, intentPath, {
    ...intent,
    kbCompressionSession: session,
  });
  write(
    JSON.stringify({
      capture: capture.receipt,
      compressionSession: session,
      next: {
        action: 'edit-sources-then-finalize-and-recover',
        args: ['finalize-and-recover', intentPath],
      },
    }),
  );
  return true;
};

const runFinalizeAndRecover = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  retire: typeof retireAidlcIntent,
  write: (message: string) => void,
  dependencies: AidlcCloseoutDependencies,
): Promise<boolean> => {
  const [command, intentPath] = args;
  if (command !== 'finalize-and-recover' || !intentPath || args.length !== 2) {
    return false;
  }
  const intent = await load(nodeFileSystem, intentPath);
  const session = intent.kbCompressionSession;
  if (!session) {
    throw new Error(
      'finalize-and-recover requires an active AIDLC knowledge compression session.',
    );
  }
  const entries = sessionEntriesFor(session);
  for (const entry of entries) {
    const guard = await resumeCompressionGuard(
      dependencies.fileSystem,
      compressionBackupRoot(),
      entry.sourcePath,
      dependencies.digest,
    );
    await finalizeCompression(dependencies.fileSystem, entry.sourcePath, guard);
    parseOkfConcept(await readText(dependencies.fileSystem, entry.sourcePath));
  }
  const closeout: AidlcKnowledgeCloseout = {
    completedAt: new Date().toISOString(),
    disposition: 'captured',
    evidence: `Captured and validated KB concepts: ${entries.map((entry) => entry.reference).join(', ')}.`,
    references: entries.map((entry) => entry.reference),
  };
  const next = withAidlcKnowledgeCloseout(
    { ...intent, kbCompressionSession: undefined },
    closeout,
  );
  await update(nodeFileSystem, intentPath, next);
  await appendAudit(nodeFileSystem, intentPath, {
    at: closeout.completedAt,
    detail: closeout.evidence,
    stage: intent.stage,
    type: 'knowledge-closeout',
  });
  await retire(nodeFileSystem, intentPath);
  write(
    JSON.stringify({
      intentPath,
      knowledgeCloseout: closeout,
      next: { action: 'done', status: 'retired' },
    }),
  );
  return true;
};

const runKnowledgeCloseout = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  retire: typeof retireAidlcIntent,
  write: (message: string) => void,
  dependencies: AidlcCloseoutDependencies,
): Promise<boolean> => {
  if (await runCaptureAndBegin(args, load, update, write, dependencies)) {
    return true;
  }
  return runFinalizeAndRecover(
    args,
    load,
    update,
    appendAudit,
    retire,
    write,
    dependencies,
  );
};

const runQueue = async (
  args: readonly string[],
  agentsRoot: string,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, cbmIndex] = args;
  if (command !== 'queue' || !cbmIndex || args.length !== 2) {
    return false;
  }
  write(
    JSON.stringify(
      await inventoryAidlcIntents(nodeFileSystem, agentsRoot, cbmIndex),
    ),
  );
  return true;
};

const runRecord = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
  retire: typeof retireAidlcIntent,
  executeGate?: AidlcGateExecutor,
): Promise<boolean> => {
  const options = recordOptionsFor(args);
  if (!options) {
    return false;
  }
  const { closeout: closeoutCommand, finalGate, input, intentPath } = options;
  const intent = await load(nodeFileSystem, intentPath);
  const transitions = parseAidlcRecordInputs(input);
  const projected = validateAidlcRecordTransitions(intent, transitions);
  if (finalGate && projected.stage !== 'build-and-test') {
    throw new Error(
      'record --final-gate must end immediately before Build and Test.',
    );
  }
  const closeout = closeoutCommand
    ? await closeoutFor(closeoutCommand.disposition, closeoutCommand.details)
    : undefined;
  let persisted = intent;
  for (const entry of transitions) {
    const next = transitionForAidlcRecord(persisted, entry);
    await update(nodeFileSystem, intentPath, next);
    await appendAudit(nodeFileSystem, intentPath, {
      at: new Date().toISOString(),
      detail: entry.evidence,
      stage: persisted.stage,
      type: entry.outcome === 'complete' ? 'stage-completed' : 'stage-skipped',
    });
    persisted = next;
  }
  if (finalGate) {
    await runBuildAndTest(
      intentPath,
      persisted,
      update,
      appendAudit,
      write,
      executeGate,
      closeout,
      retire,
    );
    return true;
  }
  write(JSON.stringify(nextActionFor(intentPath, persisted), null, 2));
  return true;
};

const runRecover = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  retire: typeof retireAidlcIntent,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, intentPath, disposition, ...details] = args;
  if (command !== 'recover') {
    return false;
  }
  if (!intentPath || !disposition) {
    return false;
  }
  const intent = await load(nodeFileSystem, intentPath);
  if (intent.kbCompressionSession) {
    throw new Error(
      'AIDLC knowledge compression is active; use the returned finalize-and-recover action.',
    );
  }
  if (disposition === '--retire-only') {
    if (details.length !== 0) {
      return false;
    }
    if (!intent.kbCloseout) {
      throw new Error(
        'recover --retire-only requires a persisted knowledge-base closeout.',
      );
    }
    await retire(nodeFileSystem, intentPath);
    write(
      JSON.stringify(
        { intentPath, next: { action: 'done', status: 'retired' } },
        null,
        2,
      ),
    );
    return true;
  }
  const closeout = await closeoutFor(disposition, details);
  const next = withAidlcKnowledgeCloseout(intent, closeout);
  await update(nodeFileSystem, intentPath, next);
  await appendAudit(nodeFileSystem, intentPath, {
    at: closeout.completedAt,
    detail: closeout.evidence,
    stage: intent.stage,
    type: 'knowledge-closeout',
  });
  await retire(nodeFileSystem, intentPath);
  write(
    JSON.stringify(
      {
        intentPath,
        knowledgeCloseout: closeout,
        next: { action: 'done', status: 'retired' },
      },
      null,
      2,
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
  if (command !== 'replan' || !intentPath || !evidence || args.length !== 3) {
    return false;
  }
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
  ) {
    return false;
  }
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

const runTerminalStage = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
  retire: typeof retireAidlcIntent,
  executeGate?: AidlcGateExecutor,
): Promise<boolean> => {
  const completeCloseout = completeCloseoutCommandFor(args);
  if (completeCloseout) {
    const intentPath = args[1];
    if (!intentPath) {
      return false;
    }
    await runBuildAndTestWithCloseout(
      intentPath,
      completeCloseout,
      load,
      update,
      appendAudit,
      write,
      retire,
      executeGate,
    );
    return true;
  }
  if (!isAutomaticBuildAndTest(args)) {
    return false;
  }
  return runAutomaticBuildAndTest(
    args[1],
    load,
    update,
    appendAudit,
    write,
    executeGate,
  );
};

const runStage = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  write: (message: string) => void,
  retire: typeof retireAidlcIntent,
  executeGate?: AidlcGateExecutor,
): Promise<boolean> => {
  const [command, intentPath, evidence] = args;
  if (
    await runTerminalStage(
      args,
      load,
      update,
      appendAudit,
      write,
      retire,
      executeGate,
    )
  ) {
    return true;
  }
  if (
    (command !== 'complete' && command !== 'skip') ||
    !intentPath ||
    !evidence ||
    args.length !== 3
  ) {
    return false;
  }
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

const startOptionsFor = (
  args: readonly string[],
): AidlcStartOptions | undefined => {
  if (args[0] !== 'start' || !args[1]) {
    return undefined;
  }
  const options = args.slice(2);
  if (options.length === 0) {
    return { uiRequired: false };
  }
  if (options.length === 1 && options[0] === '--ui') {
    return { uiRequired: true };
  }
  if (options.length === 2 && options[0] === '--initial-record' && options[1]) {
    return { initialRecord: options[1], uiRequired: false };
  }
  if (
    options.length === 3 &&
    options[0] === '--ui' &&
    options[1] === '--initial-record' &&
    options[2]
  ) {
    return { initialRecord: options[2], uiRequired: true };
  }
  return undefined;
};

const isStart = (args: readonly string[]): boolean =>
  startOptionsFor(args) !== undefined;

const runStart = async (
  args: readonly string[],
  save: typeof saveAidlcIntent,
  write: (message: string) => void,
  load: typeof loadAidlcIntent,
  resolve: (projectRoot: string) => Promise<string>,
  workspaceRoot: string,
  agentsRoot: string,
): Promise<boolean> => {
  if (!isStart(args)) {
    return false;
  }
  const [, summary] = args;
  const options = startOptionsFor(args);
  if (!options) {
    return false;
  }
  const cbmIndex = await resolve(workspaceRoot);
  await runBootstrap(
    agentsRoot,
    cbmIndex,
    workspaceRoot,
    summary,
    options.uiRequired,
    save,
    write,
    load,
    options.initialRecord,
  );
  return true;
};

export const usage = (): string => renderAidlcCommandContract();

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
  workspaceRoot = process.cwd(),
  closeoutDependencies?: AidlcCloseoutDependencies,
  agentsRoot = agentsRootForScript(),
): Promise<boolean> => {
  const resolvedCloseoutDependencies =
    closeoutDependencies ?? defaultCloseoutDependencies();
  if (runHelp(args, write)) {
    return true;
  }
  if (
    await runStart(args, save, write, load, resolve, workspaceRoot, agentsRoot)
  ) {
    return true;
  }
  if (
    await runKnowledgeCloseout(
      args,
      load,
      update,
      appendAudit,
      retire,
      write,
      resolvedCloseoutDependencies,
    )
  ) {
    return true;
  }
  if (await runRecover(args, load, update, appendAudit, retire, write)) {
    return true;
  }
  if (await runQueue(args, agentsRoot, write)) {
    return true;
  }
  if (await runSupersede(args, load, update, appendAudit, write)) {
    return true;
  }
  if (await runReplan(args, load, appendAudit, write)) {
    return true;
  }
  if (
    await runAidlcApprove(args, load, update, appendAudit, nextActionFor, write)
  ) {
    return true;
  }
  if (
    await runRecord(args, load, update, appendAudit, write, retire, executeGate)
  ) {
    return true;
  }
  return runStage(args, load, update, appendAudit, write, retire, executeGate);
};

export const run = async (
  args: readonly string[],
  save: typeof saveAidlcIntent = saveAidlcIntent,
  write: (message: string) => void = console.log,
  load: typeof loadAidlcIntent = loadAidlcIntent,
  update: typeof updateAidlcIntent = updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent = appendAidlcAuditEvent,
  retire: typeof retireAidlcIntent = retireAidlcIntent,
  _verify?: (index: string) => Promise<void>,
  resolve?: (projectRoot: string) => Promise<string>,
  executeGate?: AidlcGateExecutor,
  workspaceRoot = process.cwd(),
  closeoutDependencies?: AidlcCloseoutDependencies,
  agentsRoot = agentsRootForScript(),
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
      workspaceRoot,
      closeoutDependencies,
      agentsRoot,
    )
  ) {
    return;
  }
  rejectAdvance(args[0]);
  throw new Error(usage());
};

export const runWhenMain = runCliWhenMain;

export const runMain = (args: readonly string[]): Promise<void> => {
  const agentsRoot = agentsRootForScript();
  const projectRoot = projectRootForRuntime(agentsRoot, process.cwd());
  return run(
    args,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    resolveCbmIndexForStart,
    undefined,
    projectRoot,
    undefined,
    agentsRoot,
  );
};

runAidlcCliWhenMain(import.meta.main, Bun.argv.slice(2), runMain);
