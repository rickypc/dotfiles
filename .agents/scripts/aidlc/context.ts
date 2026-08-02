import { runAidlcCliWhenMain } from '../../utils/aidlc/cli.js';
import {
  assertAidlcKnowledgeContextResolvable,
  knowledgeBindingFor,
  knowledgeBindingsFor,
  resolveAidlcKnowledgeContextForIntent,
} from '../../utils/aidlc/context.js';
import {
  appendAidlcAuditEvent,
  loadAidlcIntent,
  updateAidlcIntent,
  withAidlcKnowledgeContext,
} from '../../utils/aidlc/intent.js';
import { stagePacketFor } from '../../utils/aidlc/stage.js';
import { runWhenMain as runCliWhenMain } from '../../utils/cli.js';
import { nodeFileSystem } from '../../utils/filesystem.js';

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

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/aidlc/context.ts resolve <intent-path> <kb-root> <organization-ref|-> <team-ref|-> <project-ref|->';

/** @deprecated Use knowledgeBindingFor from the shared context utility. */
export const bindingFor = knowledgeBindingFor;

export const run = async (
  args: readonly string[],
  now: () => string = () => new Date().toISOString(),
  write: (value: string) => void = console.log,
  load: typeof loadAidlcIntent = loadAidlcIntent,
  update: typeof updateAidlcIntent = updateAidlcIntent,
  resolve: typeof resolveAidlcKnowledgeContextForIntent = resolveAidlcKnowledgeContextForIntent,
  appendAudit: typeof appendAidlcAuditEvent = appendAidlcAuditEvent,
): Promise<void> => {
  const [command, intentPath, kbRoot, organization, team, project] = args;
  if (
    command !== 'resolve' ||
    !intentPath ||
    !kbRoot ||
    !organization ||
    !team ||
    !project ||
    args.length !== 6
  ) {
    throw new Error(usage());
  }
  const intent = await load(nodeFileSystem, intentPath);
  assertAidlcKnowledgeContextResolvable(intent);
  const kbContext = await resolve(
    nodeFileSystem,
    intent,
    kbRoot,
    knowledgeBindingsFor(organization, team, project),
    now(),
  );
  const updated = withAidlcKnowledgeContext(intent, kbContext);
  await update(nodeFileSystem, intentPath, updated);
  await appendAudit(nodeFileSystem, intentPath, {
    at: kbContext.resolvedAt ?? now(),
    detail: `Resolved ${kbContext.sources.length} validated knowledge record(s).`,
    stage: intent.stage,
    type: 'context-resolved',
  });
  write(
    JSON.stringify(
      {
        intent: updated,
        kbContext,
        stagePacket: stagePacketFor(agentsRootForIntent(intentPath), updated),
      },
      null,
    ),
  );
};

export const runWhenMain = runCliWhenMain;

runAidlcCliWhenMain(import.meta.main, Bun.argv.slice(2), run);
