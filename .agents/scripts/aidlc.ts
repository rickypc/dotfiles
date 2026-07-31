import {
  type AidlcIntent,
  aidlcIntentStatusFor,
  appendAidlcAuditEvent,
  approveAidlcIntent,
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
import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { nodeFileSystem } from '../utils/filesystem.js';

const isPrepare = (
  args: readonly string[],
): args is readonly [string, string, string, string] =>
  args[0] === 'prepare' && args.length === 4 && args.slice(1).every(Boolean);

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
  'Usage: bun ~/.agents/scripts/aidlc.ts prepare <agents-root> <cbm-index> <intent-summary> | queue <agents-root> <cbm-index> | replan <intent-path> <evidence> | supersede <intent-path> <replacement-id> | complete <intent-path> <evidence> | skip <intent-path> <reason> | approve <intent-path> | retire <intent-path> [<private-kb-root> <concept-path>...]';

const runPrepare = async (
  args: readonly string[],
  save: typeof saveAidlcIntent,
  write: (message: string) => void,
): Promise<void> => {
  if (!isPrepare(args)) throw new Error(usage());
  const [, agentsRoot, cbmIndex, summary] = args;
  const intent: AidlcIntent = createAidlcIntent(cbmIndex, summary);
  const path = intentPathFor(agentsRoot, cbmIndex, intent.id);
  await save(nodeFileSystem, path, intent);
  write(path);
  write(
    JSON.stringify(
      await inventoryAidlcIntents(nodeFileSystem, agentsRoot, cbmIndex),
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
): Promise<void> => {
  if (await runRetire(args, retire, write)) return;
  if (await runQueue(args, write)) return;
  if (await runSupersede(args, load, update, appendAudit, write)) return;
  if (await runReplan(args, load, appendAudit, write)) return;
  if (await runApprove(args, load, update, appendAudit, write)) return;
  if (await runStage(args, load, update, appendAudit, write)) return;
  rejectAdvance(args[0]);
  await runPrepare(args, save, write);
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
