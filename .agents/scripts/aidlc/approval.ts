import {
  knowledgeBindingsFor,
  resolveAidlcKnowledgeContextForIntent,
} from '../../utils/aidlc/context.js';
import {
  type AidlcIntent,
  type appendAidlcAuditEvent,
  approveAidlcIntent,
  completeAidlcStage,
  type loadAidlcIntent,
  type updateAidlcIntent,
  withAidlcKnowledgeContext,
} from '../../utils/aidlc/intent.js';
import {
  type AidlcRecordInput,
  parseAidlcRecordInputs,
  transitionForAidlcRecord,
  validateAidlcRecordTransitions,
} from '../../utils/aidlc/record.js';
import { nodeFileSystem } from '../../utils/filesystem.js';

const activeApprovalHandoffFor = (intent: AidlcIntent): boolean =>
  intent.stage === 'approval-handoff' &&
  intent.route.find((record) => record.slug === intent.stage)?.status ===
    'active';

const approvalContextFor = async (
  intent: AidlcIntent,
  contextFlag: string | undefined,
  kbRoot: string | undefined,
  organization: string | undefined,
  team: string | undefined,
  project: string | undefined,
): Promise<AidlcIntent['kbContext'] | undefined> => {
  if (contextFlag !== '--context') return undefined;
  return resolveAidlcKnowledgeContextForIntent(
    nodeFileSystem,
    intent,
    kbRoot ?? '',
    knowledgeBindingsFor(organization ?? '', team ?? '', project ?? ''),
    new Date().toISOString(),
  );
};

const assertApprovalCommandState = (
  activeApprovalHandoff: boolean,
  evidence: string | undefined,
): void => {
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
};

const isApproveCommand = (args: readonly string[]): boolean => {
  if (args[0] !== 'approve' || !args[1] || args.length < 2) return false;
  if (args.length <= 3) return true;
  const hasContext =
    args.length >= 8 &&
    args[3] === '--context' &&
    args.slice(4, 8).every(Boolean);
  if (args.length === 8) return hasContext;
  return (
    args.length === 10 &&
    hasContext &&
    args[8] === '--record' &&
    Boolean(args[9])
  );
};

const persistPostApprovalRecord = async (
  intentPath: string,
  initial: AidlcIntent,
  transitions: readonly AidlcRecordInput[],
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
): Promise<AidlcIntent> => {
  let persisted = initial;
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
  return persisted;
};

const postApprovalRecordFor = (args: readonly string[]): string | undefined =>
  args[8] === '--record' ? args[9] : undefined;

const validatedPostApprovalRecordFor = (
  intent: AidlcIntent,
  input: string | undefined,
): readonly AidlcRecordInput[] | undefined => {
  if (!input) return undefined;
  const transitions = parseAidlcRecordInputs(input);
  validateAidlcRecordTransitions(intent, transitions);
  return transitions;
};

export const runAidlcApprove = async (
  args: readonly string[],
  load: typeof loadAidlcIntent,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
  nextActionFor: (intentPath: string, intent: AidlcIntent) => object,
  write: (message: string) => void,
): Promise<boolean> => {
  const [
    ,
    intentPath,
    evidence,
    contextFlag,
    kbRoot,
    organization,
    team,
    project,
  ] = args;
  if (!isApproveCommand(args) || !intentPath) return false;
  const recordInput = postApprovalRecordFor(args);
  const intent = await load(nodeFileSystem, intentPath);
  const activeApprovalHandoff = activeApprovalHandoffFor(intent);
  assertApprovalCommandState(activeApprovalHandoff, evidence);
  const next = activeApprovalHandoff
    ? approveAidlcIntent(completeAidlcStage(intent, evidence ?? ''))
    : approveAidlcIntent(intent);
  const kbContext = await approvalContextFor(
    next,
    contextFlag,
    kbRoot,
    organization,
    team,
    project,
  );
  const contextualized = kbContext
    ? withAidlcKnowledgeContext(next, kbContext)
    : next;
  const transitions = validatedPostApprovalRecordFor(
    contextualized,
    recordInput,
  );
  await update(nodeFileSystem, intentPath, next);
  await appendAudit(nodeFileSystem, intentPath, {
    at: new Date().toISOString(),
    detail: activeApprovalHandoff
      ? `User approval recorded with handoff evidence: ${evidence}`
      : 'User approval recorded for a legacy awaiting-approval intent.',
    stage: intent.stage,
    type: 'approval-granted',
  });
  if (kbContext) {
    await update(nodeFileSystem, intentPath, contextualized);
    await appendAudit(nodeFileSystem, intentPath, {
      at: kbContext.resolvedAt ?? new Date().toISOString(),
      detail: `Resolved ${kbContext.sources.length} validated knowledge record(s).`,
      stage: next.stage,
      type: 'context-resolved',
    });
  }
  const recorded = transitions
    ? await persistPostApprovalRecord(
        intentPath,
        contextualized,
        transitions,
        update,
        appendAudit,
      )
    : contextualized;
  write(JSON.stringify(nextActionFor(intentPath, recorded), null, 2));
  return true;
};
