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

interface ApprovalCommand {
  readonly context?: ApprovalContext;
  readonly contextOnlyFollowup: boolean;
  readonly evidence?: string;
  readonly intentPath: string;
  readonly recordInput?: string;
}

interface ApprovalContext {
  readonly kbRoot: string;
  readonly organization: string;
  readonly project: string;
  readonly team: string;
}

const activeApprovalHandoffFor = (intent: AidlcIntent): boolean =>
  intent.stage === 'approval-handoff' &&
  intent.route.find((record) => record.slug === intent.stage)?.status ===
    'active';

const approvalContextFor = async (
  intent: AidlcIntent,
  context: ApprovalContext | undefined,
): Promise<AidlcIntent['kbContext'] | undefined> => {
  if (!context) {
    return undefined;
  }
  return resolveAidlcKnowledgeContextForIntent(
    nodeFileSystem,
    intent,
    context.kbRoot,
    knowledgeBindingsFor(context.organization, context.team, context.project),
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

const contextFor = (
  args: readonly string[],
  start: number,
): ApprovalContext | undefined => {
  if (
    args[start] !== '--context' ||
    !args.slice(start + 1, start + 5).every(Boolean)
  ) {
    return undefined;
  }
  return {
    kbRoot: args[start + 1] ?? '',
    organization: args[start + 2] ?? '',
    project: args[start + 4] ?? '',
    team: args[start + 3] ?? '',
  };
};

const contextOnlyApprovalCommandFor = (
  args: readonly string[],
): ApprovalCommand => ({
  context: {
    kbRoot: args[3] ?? '',
    organization: args[4] ?? '',
    project: args[6] ?? '',
    team: args[5] ?? '',
  },
  contextOnlyFollowup: true,
  intentPath: args[1] ?? '',
});

const isContextOnlyFollowup = (args: readonly string[]): boolean =>
  args.length === 7 &&
  args[2] === '--context' &&
  args.slice(3, 7).every(Boolean);

const nextApprovalIntentFor = (
  intent: AidlcIntent,
  activeApprovalHandoff: boolean,
  command: ApprovalCommand,
): AidlcIntent => {
  if (command.contextOnlyFollowup) {
    return intent;
  }
  if (activeApprovalHandoff) {
    return approveAidlcIntent(
      completeAidlcStage(intent, command.evidence ?? ''),
    );
  }
  return approveAidlcIntent(intent);
};

const persistApprovalFor = async (
  command: ApprovalCommand,
  intent: AidlcIntent,
  next: AidlcIntent,
  activeApprovalHandoff: boolean,
  update: typeof updateAidlcIntent,
  appendAudit: typeof appendAidlcAuditEvent,
): Promise<void> => {
  if (command.contextOnlyFollowup) {
    return;
  }
  await update(nodeFileSystem, command.intentPath, next);
  await appendAudit(nodeFileSystem, command.intentPath, {
    at: new Date().toISOString(),
    detail: activeApprovalHandoff
      ? `User approval recorded with handoff evidence: ${command.evidence}`
      : 'User approval recorded for a legacy awaiting-approval intent.',
    stage: intent.stage,
    type: 'approval-granted',
  });
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

const standardApprovalCommandFor = (
  args: readonly string[],
): ApprovalCommand | undefined => {
  if (args.length <= 3) {
    return {
      contextOnlyFollowup: false,
      evidence: args[2],
      intentPath: args[1],
    };
  }
  const context = contextFor(args, 3);
  if (args.length === 8 && context) {
    return {
      context,
      contextOnlyFollowup: false,
      evidence: args[2],
      intentPath: args[1],
    };
  }
  if (args.length === 10 && context && args[8] === '--record' && args[9]) {
    return {
      context,
      contextOnlyFollowup: false,
      evidence: args[2],
      intentPath: args[1],
      recordInput: args[9],
    };
  }
  return undefined;
};

const approvalCommandFor = (
  args: readonly string[],
): ApprovalCommand | undefined => {
  if (args[0] !== 'approve' || !args[1] || args.length < 2) {
    return undefined;
  }
  return isContextOnlyFollowup(args)
    ? contextOnlyApprovalCommandFor(args)
    : standardApprovalCommandFor(args);
};

const validatedPostApprovalRecordFor = (
  intent: AidlcIntent,
  input: string | undefined,
): readonly AidlcRecordInput[] | undefined => {
  if (!input) {
    return undefined;
  }
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
  const command = approvalCommandFor(args);
  if (!command) {
    return false;
  }
  const intent = await load(nodeFileSystem, command.intentPath);
  const activeApprovalHandoff = activeApprovalHandoffFor(intent);
  assertApprovalCommandState(
    activeApprovalHandoff,
    command.contextOnlyFollowup ? undefined : command.evidence,
  );
  const next = nextApprovalIntentFor(intent, activeApprovalHandoff, command);
  const kbContext = await approvalContextFor(next, command.context);
  const contextualized = kbContext
    ? withAidlcKnowledgeContext(next, kbContext)
    : next;
  const transitions = validatedPostApprovalRecordFor(
    contextualized,
    command.recordInput,
  );
  await persistApprovalFor(
    command,
    intent,
    next,
    activeApprovalHandoff,
    update,
    appendAudit,
  );
  if (kbContext) {
    await update(nodeFileSystem, command.intentPath, contextualized);
    await appendAudit(nodeFileSystem, command.intentPath, {
      at: kbContext.resolvedAt ?? new Date().toISOString(),
      detail: `Resolved ${kbContext.sources.length} validated knowledge record(s).`,
      stage: next.stage,
      type: 'context-resolved',
    });
  }
  const recorded = transitions
    ? await persistPostApprovalRecord(
        command.intentPath,
        contextualized,
        transitions,
        update,
        appendAudit,
      )
    : contextualized;
  write(JSON.stringify(nextActionFor(command.intentPath, recorded), null, 2));
  return true;
};
