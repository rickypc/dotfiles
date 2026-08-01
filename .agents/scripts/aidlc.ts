import { runAidlcCliWhenMain } from '../utils/aidlc/cli.js';
import {
  type AidlcIntent,
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
} from '../utils/codebase-memory.js';
import { nodeFileSystem } from '../utils/filesystem.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';
import { resolveFinalGate } from './aidlc/gate.js';

const isPrepare = (
  args: readonly string[],
): args is
  | readonly [string, string, string, string, string]
  | readonly [string, string, string, string, string, '--ui'] =>
  args[0] === 'prepare' &&
  (args.length === 5 || (args.length === 6 && args[5] === '--ui')) &&
  args.slice(1, 5).every(Boolean);

const rejectAdvance = (command: string | undefined): void => {
  if (command === 'advance') {
    throw new Error(
      'Use complete with evidence or skip with a reason; advance cannot bypass a stage.',
    );
  }
};

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
  write(JSON.stringify(next));
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
  write(JSON.stringify(intent));
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
  write(`Retired AIDLC intent: ${intentPath}`);
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
  write(JSON.stringify(next));
  if (aidlcIntentStatusFor(next) === 'completed') {
    const marker = '/aidlc/';
    const root = intentPath.slice(0, intentPath.lastIndexOf(marker));
    write(
      JSON.stringify(
        await inventoryAidlcIntents(nodeFileSystem, root, next.cbmIndex),
      ),
    );
  }
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
  write(JSON.stringify(next));
  return true;
};

export const usage = (): string =>
  'Usage: bun ~/.agents/scripts/aidlc.ts prepare <agents-root> <cbm-index> <absolute-project-root> <intent-summary> [--ui] | queue <agents-root> <cbm-index> | replan <intent-path> <evidence> | supersede <intent-path> <replacement-id> | complete <intent-path> <evidence> | skip <intent-path> <reason> | approve <intent-path> | retire <intent-path> [<private-kb-root> <concept-path>...]';

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

export const run = async (
  args: readonly string[],
  save: typeof saveAidlcIntent = saveAidlcIntent,
  write: (message: string) => void = console.log,
  load: typeof loadAidlcIntent = loadAidlcIntent,
  update: typeof updateAidlcIntent = updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent = appendAidlcAuditEvent,
  retire: typeof retireAidlcIntent = retireAidlcIntent,
  verify?: (index: string) => Promise<void>,
): Promise<void> => {
  if (await runRetire(args, retire, write)) return;
  if (await runQueue(args, write)) return;
  if (await runSupersede(args, load, update, appendAudit, write)) return;
  if (await runReplan(args, load, appendAudit, write)) return;
  if (await runApprove(args, load, update, appendAudit, write)) return;
  if (await runStage(args, load, update, appendAudit, write)) return;
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
  );

runAidlcCliWhenMain(import.meta.main, Bun.argv.slice(2), runMain);
