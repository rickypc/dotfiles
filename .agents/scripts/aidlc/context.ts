import { resolveAidlcKnowledgeContext } from '../../utils/aidlc/context.js';
import {
  appendAidlcAuditEvent,
  loadAidlcIntent,
  type AidlcKnowledgeContext,
  updateAidlcIntent,
  withAidlcKnowledgeContext,
} from '../../utils/aidlc/intent.js';
import { runWhenMain as runCliWhenMain } from '../../utils/cli.js';
import { nodeFileSystem } from '../../utils/filesystem.js';

export const bindingFor = (value: string): string | undefined =>
  value === '-' ? undefined : value;

const bindingsFor = (
  organization: string,
  team: string,
  project: string,
): AidlcKnowledgeContext['bindings'] => ({
  ...(organization === '-' ? {} : { organization }),
  ...(team === '-' ? {} : { team }),
  ...(project === '-' ? {} : { project }),
});

export const usage = (): string =>
  'Usage: bun ~/.agents/scripts/aidlc/context.ts resolve <intent-path> <kb-root> <organization-ref|-> <team-ref|-> <project-ref|->';

export const run = async (
  args: readonly string[],
  now: () => string = () => new Date().toISOString(),
  write: (value: string) => void = console.log,
  load: typeof loadAidlcIntent = loadAidlcIntent,
  update: typeof updateAidlcIntent = updateAidlcIntent,
  resolve: typeof resolveAidlcKnowledgeContext = resolveAidlcKnowledgeContext,
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
  if (intent.stage !== 'practices-discovery') {
    throw new Error(
      'AIDLC knowledge context can be resolved only at practices-discovery.',
    );
  }
  const kbContext = await resolve(
    nodeFileSystem,
    kbRoot,
    bindingsFor(organization, team, project),
    now(),
    intent.cbmIndex,
  );
  const updated = withAidlcKnowledgeContext(intent, kbContext);
  await update(nodeFileSystem, intentPath, updated);
  await appendAudit(nodeFileSystem, intentPath, {
    at: kbContext.resolvedAt ?? now(),
    detail: `Resolved ${kbContext.sources.length} validated knowledge record(s).`,
    stage: intent.stage,
    type: 'context-resolved',
  });
  write(JSON.stringify(kbContext));
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
