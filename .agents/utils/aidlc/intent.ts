import type { FileSystem } from '../filesystem.js';
import { readText, removeFile, writeText } from '../filesystem.js';
import {
  conceptIndexPath,
  isKbConceptPath,
  parseOkfConcept,
  scopeIndexPath,
} from '../knowledge-base.js';
import {
  type AidlcStageRecord,
  type AidlcStageSlug,
  initialAidlcRoute,
  nextAidlcRouteStage,
  stageDefinitionFor,
} from './stages.js';

export interface AidlcAuditEvent {
  readonly at: string;
  readonly detail: string;
  readonly stage: AidlcStageSlug;
  readonly type: AidlcAuditEventType;
}

export type AidlcAuditEventType =
  | 'approval-granted'
  | 'intent-replanned'
  | 'intent-superseded'
  | 'context-resolved'
  | 'stage-completed'
  | 'stage-skipped';

export interface AidlcIntent {
  readonly approval: 'pending' | 'approved' | 'declined';
  readonly cbmIndex: string;
  readonly id: string;
  readonly kbContext: AidlcKnowledgeContext;
  readonly lifecycle: AidlcLifecycle;
  readonly route: readonly AidlcStageRecord[];
  readonly stage: AidlcStageSlug;
  readonly summary: string;
  readonly supersededBy?: string;
}

export interface AidlcKnowledgeContext {
  readonly bindings: {
    readonly organization?: string;
    readonly project?: string;
    readonly team?: string;
  };
  readonly resolvedAt?: string;
  readonly rules: readonly string[];
  readonly sources: readonly string[];
}

export type AidlcLifecycle = 'active' | 'superseded';

export const emptyAidlcKnowledgeContext = (): AidlcKnowledgeContext => ({
  bindings: {},
  rules: [],
  sources: [],
});

export const intentIdFor = (summary: string): string => {
  const value = summary
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '');
  if (!value)
    throw new Error('Intent summary must contain letters or numbers.');
  return value;
};

const stageStatuses = new Set<AidlcStageRecord['status']>([
  'active',
  'awaiting-approval',
  'completed',
  'skipped',
  'pending',
]);

const activateNext = (
  intent: AidlcIntent,
  route: readonly AidlcStageRecord[],
): AidlcIntent => {
  const next = nextAidlcRouteStage(route, intent.stage);
  if (!next) return { ...intent, route, stage: 'knowledge-distillation' };
  return {
    ...intent,
    route: route.map((item) =>
      item.slug === next ? { ...item, status: 'active' } : item,
    ),
    stage: next,
  };
};

export const aidlcIntentStatusFor = (
  intent: AidlcIntent,
): 'active' | 'completed' =>
  intent.route.every(
    (record) => record.status === 'completed' || record.status === 'skipped',
  )
    ? 'completed'
    : 'active';

export const assertNoIntentCollision = (
  existing: AidlcIntent | undefined,
  summary: string,
): void => {
  if (existing && existing.summary !== summary) {
    throw new Error(
      'Intent ID collision has a different summary; ask the user.',
    );
  }
};

const auditLineFor = (event: AidlcAuditEvent): string => {
  if (!event.at.trim() || !event.detail.trim()) {
    throw new Error('AIDLC audit events require a timestamp and detail.');
  }
  return `- ${event.at} | ${event.type} | ${event.stage} | ${event.detail.replaceAll(/\s+/gu, ' ').trim()}`;
};

export const createAidlcIntent = (
  cbmIndex: string,
  summary: string,
): AidlcIntent => ({
  approval: 'pending',
  cbmIndex,
  id: intentIdFor(summary),
  kbContext: emptyAidlcKnowledgeContext(),
  lifecycle: 'active',
  route: initialAidlcRoute(),
  stage: 'workspace-scaffold',
  summary,
});

const currentRecord = (intent: AidlcIntent): AidlcStageRecord => {
  const record = intent.route.find((item) => item.slug === intent.stage);
  if (!record) throw new Error('AIDLC current stage is not in its route.');
  return record;
};

export const canAdvanceAidlcIntent = (intent: AidlcIntent): boolean => {
  const record = currentRecord(intent);
  return (
    record.status === 'completed' ||
    record.status === 'skipped' ||
    (record.status === 'awaiting-approval' && intent.approval === 'approved')
  );
};

export const advanceAidlcIntent = (intent: AidlcIntent): AidlcIntent => {
  if (!canAdvanceAidlcIntent(intent)) {
    throw new Error(
      'AIDLC intent requires a completed stage and explicit approval before advancing.',
    );
  }
  return activateNext(intent, intent.route);
};

const field = (content: string, name: string): string => {
  const match = new RegExp(`^${name}: (.+)$`, 'mu').exec(content);
  if (!match) throw new Error('AIDLC intent frontmatter is invalid.');
  return match[1];
};

export const intentPathFor = (
  agentsRoot: string,
  cbmIndex: string,
  intentId: string,
): string =>
  `${agentsRoot.replace(/\/$/u, '')}/aidlc/${cbmIndex}/intents/${intentId}.md`;

const optionalField = (content: string, name: string): string | undefined =>
  new RegExp(`^${name}: (.+)$`, 'mu').exec(content)?.[1];

const parseKnowledgeContext = (content: string): AidlcKnowledgeContext => {
  const value = optionalField(content, 'kb_context');
  if (!value) return emptyAidlcKnowledgeContext();
  const context = JSON.parse(value) as AidlcKnowledgeContext;
  if (
    !context?.bindings ||
    !Array.isArray(context.rules) ||
    !Array.isArray(context.sources) ||
    context.rules.some((rule) => !rule.trim()) ||
    context.sources.some((source) => !source.trim())
  ) {
    throw new Error('AIDLC knowledge context is invalid.');
  }
  return context;
};

const renderStageLedger = (intent: AidlcIntent): string =>
  intent.route
    .map((record) => {
      const stage = stageDefinitionFor(record.slug);
      return `| ${stage.number} | ${stage.phase} | ${stage.slug} | ${record.status} | ${record.evidence ?? ''} |`;
    })
    .join('\n');

const stageLedger = (intent: AidlcIntent): string =>
  [
    '| # | Phase | Stage | Status | Evidence or skip reason |',
    '| --- | --- | --- | --- | --- |',
    renderStageLedger(intent),
  ].join('\n');

export const supersedeAidlcIntent = (
  intent: AidlcIntent,
  replacementId: string,
): AidlcIntent => {
  if (!replacementId.trim())
    throw new Error('Replacement intent id is required.');
  if (intent.lifecycle === 'superseded') {
    throw new Error('AIDLC intent is already superseded.');
  }
  if (replacementId === intent.id) {
    throw new Error('An intent cannot supersede itself.');
  }
  return { ...intent, lifecycle: 'superseded', supersededBy: replacementId };
};

const updateRoute = (
  intent: AidlcIntent,
  record: AidlcStageRecord,
): AidlcStageRecord[] =>
  intent.route.map((item) => (item.slug === record.slug ? record : item));

export const approveAidlcIntent = (intent: AidlcIntent): AidlcIntent => {
  const record = currentRecord(intent);
  if (record.status !== 'awaiting-approval') {
    throw new Error('Only an AIDLC stage awaiting approval can be approved.');
  }
  const route = updateRoute(intent, { ...record, status: 'completed' });
  return activateNext({ ...intent, approval: 'approved' }, route);
};

export const completeAidlcStage = (
  intent: AidlcIntent,
  evidence: string,
): AidlcIntent => {
  if (!evidence.trim())
    throw new Error('AIDLC stage completion requires evidence.');
  const record = currentRecord(intent);
  if (record.status !== 'active')
    throw new Error('Only an active AIDLC stage can be completed.');
  const stage = stageDefinitionFor(intent.stage);
  const updated = {
    ...record,
    evidence,
    status: stage.gate
      ? ('awaiting-approval' as const)
      : ('completed' as const),
  };
  const route = updateRoute(intent, updated);
  return stage.gate ? { ...intent, route } : activateNext(intent, route);
};

export const skipAidlcStage = (
  intent: AidlcIntent,
  reason: string,
): AidlcIntent => {
  if (!reason.trim()) throw new Error('AIDLC stage skip requires a reason.');
  const record = currentRecord(intent);
  const stage = stageDefinitionFor(intent.stage);
  if (record.status !== 'active' || stage.gate) {
    throw new Error('Only a non-gated active AIDLC stage can be skipped.');
  }
  return activateNext(
    intent,
    updateRoute(intent, { ...record, evidence: reason, status: 'skipped' }),
  );
};

const validateRoute = (route: readonly AidlcStageRecord[]): void => {
  const expected = initialAidlcRoute();
  if (route.length !== expected.length)
    throw new Error('AIDLC intent route is invalid.');
  for (const [index, record] of route.entries()) {
    if (
      record.slug !== expected[index]?.slug ||
      !stageStatuses.has(record.status) ||
      (record.evidence !== undefined && !record.evidence.trim())
    ) {
      throw new Error('AIDLC intent route is invalid.');
    }
  }
};

export const parseAidlcIntent = (content: string): AidlcIntent => {
  if (!content.startsWith('---\n')) {
    throw new Error('AIDLC intent frontmatter is invalid.');
  }
  const approval = field(content, 'approval') as AidlcIntent['approval'];
  if (!['pending', 'approved', 'declined'].includes(approval)) {
    throw new Error('AIDLC intent approval is invalid.');
  }
  const stage = field(content, 'stage') as AidlcStageSlug;
  const route = JSON.parse(field(content, 'route')) as AidlcStageRecord[];
  validateRoute(route);
  const intent = {
    approval,
    cbmIndex: field(content, 'cbm_index'),
    id: field(content, 'id'),
    kbContext: parseKnowledgeContext(content),
    lifecycle: (optionalField(content, 'lifecycle') ??
      'active') as AidlcLifecycle,
    route,
    stage,
    summary: JSON.parse(field(content, 'summary')) as string,
    supersededBy: optionalField(content, 'superseded_by'),
  };
  if (!['active', 'superseded'].includes(intent.lifecycle)) {
    throw new Error('AIDLC intent lifecycle is invalid.');
  }
  if (intent.lifecycle === 'superseded' && !intent.supersededBy?.trim()) {
    throw new Error('Superseded AIDLC intents require a replacement id.');
  }
  if (currentRecord(intent).status === 'pending') {
    throw new Error('AIDLC current stage is pending.');
  }
  return intent;
};

export const appendAidlcAuditEvent = async (
  fileSystem: FileSystem,
  path: string,
  event: AidlcAuditEvent,
): Promise<void> => {
  const existing = await readText(fileSystem, path);
  parseAidlcIntent(existing);
  const marker = '## Audit trail\n';
  const line = auditLineFor(event);
  const updated = existing.includes(marker)
    ? `${existing.trimEnd()}\n${line}\n`
    : `${existing.trimEnd()}\n\n${marker}\n${line}\n`;
  await writeText(fileSystem, path, updated);
};

export const loadAidlcIntent = async (
  fileSystem: FileSystem,
  path: string,
): Promise<AidlcIntent> => parseAidlcIntent(await readText(fileSystem, path));

export const retireAidlcIntent = async (
  fileSystem: FileSystem,
  path: string,
  kbRoot?: string,
  kbReferences: readonly string[] = [],
): Promise<void> => {
  const intent = await loadAidlcIntent(fileSystem, path);
  const distillation = intent.route.find(
    (record) => record.slug === 'knowledge-distillation',
  );
  if (aidlcIntentStatusFor(intent) !== 'completed' || !distillation) {
    throw new Error(
      'Only a completed AIDLC intent with terminal knowledge distillation can be retired.',
    );
  }
  if (distillation.status === 'completed') {
    if (
      !kbRoot?.startsWith('/') ||
      kbReferences.length === 0 ||
      kbReferences.some((reference) => !isKbConceptPath(reference))
    ) {
      throw new Error(
        'Completed knowledge distillation requires a KB root and verified KB concept references before retirement.',
      );
    }
    const root = kbRoot.replace(/\/$/u, '');
    const indexPaths = [
      `${root}/index.md`,
      ...new Set(
        kbReferences.flatMap((reference) => [
          `${root}/${conceptIndexPath(reference)}`,
          `${root}/${scopeIndexPath(reference)}`,
        ]),
      ),
    ];
    await Promise.all([
      Promise.all(
        kbReferences.map(async (reference) =>
          parseOkfConcept(await readText(fileSystem, `${root}/${reference}`)),
        ),
      ),
      Promise.all(
        indexPaths.map((indexPath) => readText(fileSystem, indexPath)),
      ),
    ]);
  }
  await removeFile(fileSystem, path);
};

export const withAidlcKnowledgeContext = (
  intent: AidlcIntent,
  kbContext: AidlcKnowledgeContext,
): AidlcIntent => ({ ...intent, kbContext });

export const workspacePathFor = (
  agentsRoot: string,
  cbmIndex: string,
): string => `${agentsRoot.replace(/\/$/u, '')}/aidlc/${cbmIndex}/workspace.md`;

const yamlValue = (value: string): string => JSON.stringify(value);

export const renderAidlcFrontmatter = (intent: AidlcIntent): string =>
  [
    '---',
    `id: ${intent.id}`,
    `summary: ${yamlValue(intent.summary)}`,
    `cbm_index: ${intent.cbmIndex}`,
    'workflow: universal-code-change',
    `stage: ${intent.stage}`,
    `approval: ${intent.approval}`,
    `lifecycle: ${intent.lifecycle}`,
    ...(intent.supersededBy ? [`superseded_by: ${intent.supersededBy}`] : []),
    `route: ${JSON.stringify(intent.route)}`,
    `kb_context: ${JSON.stringify(intent.kbContext)}`,
    `status: ${aidlcIntentStatusFor(intent)}`,
    'kb_references: []',
    'validation_summary: pending',
    `distillation_status: ${
      intent.route.find((record) => record.slug === 'knowledge-distillation')
        ?.status === 'completed'
        ? 'completed'
        : 'pending'
    }`,
    '---',
  ].join('\n');

export const renderAidlcIntent = (intent: AidlcIntent): string =>
  [
    renderAidlcFrontmatter(intent),
    '',
    `# ${intent.summary}`,
    '',
    '## Adopted AI-DLC stages',
    '',
    'Selected upstream stages retain their upstream number, phase, slug, and name. Knowledge Distillation is a local closure extension.',
    '',
    stageLedger(intent),
    '',
    '## Research',
    '',
    '## Decisions',
    '',
    '## Plan',
    '',
    '## Execution evidence',
    '',
    '## Validation evidence',
    '',
    '## Outcome',
    '',
    '## Audit trail',
    '',
  ].join('\n');

export const saveAidlcIntent = async (
  fileSystem: FileSystem,
  path: string,
  intent: AidlcIntent,
): Promise<void> => writeText(fileSystem, path, renderAidlcIntent(intent));

export const updateAidlcIntent = async (
  fileSystem: FileSystem,
  path: string,
  intent: AidlcIntent,
): Promise<void> => {
  const existing = await readText(fileSystem, path);
  parseAidlcIntent(existing);
  const frontmatterUpdated = existing.replace(
    /^---\n[\s\S]*?\n---/u,
    renderAidlcFrontmatter(intent),
  );
  const ledgerPattern =
    /^\| # \| Phase \| Stage \| Status \| Evidence or skip reason \|\n\| --- \| --- \| --- \| --- \| --- \|\n(?:\| [^\n]+\|\n?)*\n*/mu;
  if (!ledgerPattern.test(frontmatterUpdated)) {
    throw new Error('AIDLC intent stage ledger is missing.');
  }
  const updated = frontmatterUpdated.replace(
    ledgerPattern,
    `${stageLedger(intent)}\n\n`,
  );
  await writeText(fileSystem, path, updated);
};
