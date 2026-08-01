import { createHash } from 'node:crypto';
import matter from 'gray-matter';
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
  | 'final-gate-failed'
  | 'final-gate-revalidated'
  | 'intent-replanned'
  | 'intent-superseded'
  | 'knowledge-closeout'
  | 'context-resolved'
  | 'stage-completed'
  | 'stage-skipped';

export interface AidlcIntent {
  readonly approval: 'pending' | 'approved' | 'declined';
  readonly cbmIndex: string;
  readonly id: string;
  readonly kbCloseout?: AidlcKnowledgeCloseout;
  readonly kbCompressionSession?: AidlcKnowledgeCompressionSession;
  readonly kbContext: AidlcKnowledgeContext;
  readonly lifecycle: AidlcLifecycle;
  readonly projectRoot?: string;
  readonly route: readonly AidlcStageRecord[];
  readonly stage: AidlcStageSlug;
  readonly summary: string;
  readonly supersededBy?: string;
  readonly uiRequired: boolean;
}

export interface AidlcKnowledgeCloseout {
  readonly completedAt: string;
  readonly disposition: 'captured' | 'no-durable-lesson';
  readonly evidence: string;
  readonly references: readonly string[];
}

export interface AidlcKnowledgeCompressionBundle {
  readonly entries: readonly AidlcKnowledgeCompressionEntry[];
  readonly kbRoot: string;
}

export interface AidlcKnowledgeCompressionEntry {
  readonly backupPath: string;
  readonly lockPath: string;
  readonly reference: string;
  readonly sourcePath: string;
}

export type AidlcKnowledgeCompressionSession =
  | AidlcKnowledgeCompressionBundle
  | AidlcLegacyKnowledgeCompressionSession;

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

export interface AidlcLegacyKnowledgeCompressionSession
  extends AidlcKnowledgeCompressionEntry {
  readonly kbRoot: string;
}

export type AidlcLifecycle = 'active' | 'superseded';

export interface CreateAidlcIntentOptions {
  readonly projectRoot?: string;
  readonly uiRequired?: boolean;
}

const intentFileNameMaxLength = 160;
const intentFileExtension = '.md';
const intentHashLength = 12;
const intentTruncationSeparator = '-';
const intentIdMaxLength = intentFileNameMaxLength - intentFileExtension.length;
const intentPrefixMaxLength =
  intentIdMaxLength - intentHashLength - intentTruncationSeparator.length;

export const acceptanceChecklistFor = (
  summary: string,
  uiRequired: boolean,
): readonly string[] => [
  `Deliver the requested outcome: ${summary}`,
  ...(uiRequired
    ? ['Verify the user-facing UI through its requested observable behavior.']
    : []),
  'Pass the configured final acceptance gate.',
];

const assertAidlcAgentsRoot = (agentsRoot: string): void => {
  const segments = agentsRoot.split('/');
  if (
    !agentsRoot.startsWith('/') ||
    agentsRoot.endsWith('/') ||
    agentsRoot.includes('//') ||
    segments
      .slice(1)
      .some((segment) => ['.', '..', 'aidlc', ''].includes(segment))
  ) {
    throw new Error(
      'AIDLC agents root must be an absolute path outside the aidlc namespace.',
    );
  }
};

const protectedAidlcAssetNames = new Set([
  'conductor.md',
  'knowledge',
  'prompts',
  'protocols',
  'roles',
]);

const assertCbmIndexName = (cbmIndex: string): void => {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(cbmIndex) ||
    protectedAidlcAssetNames.has(cbmIndex)
  ) {
    throw new Error(
      'CBM index must be a project name returned by codebase-memory, not a path.',
    );
  }
};

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
  if (value.length <= intentIdMaxLength) return value;
  const hash = createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, intentHashLength);
  const prefix = value.slice(0, intentPrefixMaxLength).replace(/-$/u, '');
  return `${prefix}${intentTruncationSeparator}${hash}`;
};

const isCanonicalIntentId = (value: string): boolean =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);

export const assertAidlcIntentPath = (path: string): void => {
  const segments = path.split('/');
  if (
    !path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('//') ||
    segments.some((segment) => segment === '.' || segment === '..') ||
    segments.length < 6 ||
    segments.at(-4) !== 'aidlc' ||
    segments.at(-2) !== 'intents'
  ) {
    throw new Error(
      'AIDLC lifecycle commands can access only canonical temporary intent files.',
    );
  }
  const agentsRoot = segments.slice(0, -4).join('/');
  const cbmIndex = segments.at(-3) ?? '';
  const fileName = segments.at(-1) ?? '';
  if (!fileName.endsWith('.md')) {
    throw new Error(
      'AIDLC lifecycle commands can access only canonical temporary intent files.',
    );
  }
  assertAidlcAgentsRoot(agentsRoot);
  assertCbmIndexName(cbmIndex);
  if (!isCanonicalIntentId(fileName.slice(0, -3))) {
    throw new Error(
      'AIDLC lifecycle commands can access only canonical temporary intent files.',
    );
  }
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
  const current = route.findIndex((record) => record.slug === intent.stage);
  const next = route
    .slice(current + 1)
    .find((record) => record.status === 'pending')?.slug;
  if (!next) return { ...intent, route };
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

const aidlcFrontmatterData = (
  intent: AidlcIntent,
): Record<string, unknown> => ({
  approval: intent.approval,
  cbm_index: intent.cbmIndex,
  id: intent.id,
  ...(intent.kbCloseout ? { kb_closeout: intent.kbCloseout } : {}),
  ...(intent.kbCompressionSession
    ? { kb_compression_session: intent.kbCompressionSession }
    : {}),
  kb_context: intent.kbContext,
  lifecycle: intent.lifecycle,
  ...(intent.projectRoot ? { project_root: intent.projectRoot } : {}),
  ...(intent.supersededBy ? { superseded_by: intent.supersededBy } : {}),
  route: intent.route,
  stage: intent.stage,
  status: aidlcIntentStatusFor(intent),
  summary: intent.summary,
  ui_required: intent.uiRequired,
  validation_summary: 'pending',
  workflow: 'universal-code-change',
});

const assertIntentFrontmatter = (content: string): void => {
  if (!matter.test(content) || content.indexOf('\n---', 4) < 0) {
    throw new Error('AIDLC intent frontmatter is invalid.');
  }
};

export const assertNoIntentCollision = (
  existing: AidlcIntent | undefined,
  summary: string,
): void => {
  if (existing?.lifecycle === 'active') {
    throw new Error(
      'An active AIDLC intent ID collision exists; resume or supersede it instead of overwriting it.',
    );
  }
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
  options: CreateAidlcIntentOptions = {},
): AidlcIntent => {
  assertCbmIndexName(cbmIndex);
  if (options.projectRoot && !options.projectRoot.startsWith('/')) {
    throw new Error('AIDLC project root must be absolute.');
  }
  const uiRequired = options.uiRequired ?? false;
  return {
    approval: 'pending',
    cbmIndex,
    id: intentIdFor(summary),
    kbContext: emptyAidlcKnowledgeContext(),
    lifecycle: 'active',
    projectRoot: options.projectRoot,
    route: initialAidlcRoute(uiRequired),
    stage: 'workspace-scaffold',
    summary,
    uiRequired,
  };
};

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

const field = (data: Record<string, unknown>, name: string): unknown => {
  if (!(name in data)) throw new Error('AIDLC intent frontmatter is invalid.');
  return data[name];
};

export const intentPathFor = (
  agentsRoot: string,
  cbmIndex: string,
  intentId: string,
): string => {
  if (intentId !== intentIdFor(intentId)) {
    throw new Error(
      'AIDLC intent id must use the deterministic portable filename budget.',
    );
  }
  const path = `${agentsRoot.replace(/\/$/u, '')}/aidlc/${cbmIndex}/intents/${intentId}.md`;
  assertAidlcIntentPath(path);
  return path;
};

const invalidKnowledgeCompressionSession = (): never => {
  throw new Error('AIDLC knowledge compression session is invalid.');
};

const compressionEntryFor = (
  value: unknown,
  kbRoot: string,
): AidlcKnowledgeCompressionEntry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidKnowledgeCompressionSession();
  }
  const entry = value as Record<string, unknown>;
  const values = [
    entry.backupPath,
    entry.lockPath,
    entry.reference,
    entry.sourcePath,
  ];
  if (
    values.some(
      (entryValue) => typeof entryValue !== 'string' || !entryValue.trim(),
    ) ||
    !String(entry.sourcePath).startsWith('/') ||
    !String(entry.backupPath).startsWith('/') ||
    !String(entry.lockPath).startsWith('/') ||
    !isKbConceptPath(String(entry.reference)) ||
    String(entry.sourcePath) !== `${kbRoot}/${String(entry.reference)}`
  ) {
    return invalidKnowledgeCompressionSession();
  }
  return entry as unknown as AidlcKnowledgeCompressionEntry;
};

const compressionBundleFor = (
  entriesValue: unknown,
  kbRoot: string,
): AidlcKnowledgeCompressionBundle => {
  if (!Array.isArray(entriesValue) || entriesValue.length === 0) {
    return invalidKnowledgeCompressionSession();
  }
  const entries = entriesValue.map((entry) =>
    compressionEntryFor(entry, kbRoot),
  );
  if (
    new Set(entries.map((entry) => entry.reference)).size !== entries.length
  ) {
    return invalidKnowledgeCompressionSession();
  }
  return { entries, kbRoot };
};

const optionalBooleanField = (
  data: Record<string, unknown>,
  name: string,
): boolean | undefined => {
  if (!(name in data)) return undefined;
  const value = field(data, name);
  if (typeof value !== 'boolean') {
    throw new Error('AIDLC intent frontmatter is invalid.');
  }
  return value;
};

const parseKnowledgeCloseout = (
  data: Record<string, unknown>,
): AidlcKnowledgeCloseout | undefined => {
  const value = data.kb_closeout;
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AIDLC knowledge closeout is invalid.');
  }
  const closeout = value as Record<string, unknown>;
  if (
    typeof closeout.completedAt !== 'string' ||
    !closeout.completedAt.trim() ||
    (closeout.disposition !== 'captured' &&
      closeout.disposition !== 'no-durable-lesson') ||
    typeof closeout.evidence !== 'string' ||
    !closeout.evidence.trim() ||
    !Array.isArray(closeout.references) ||
    closeout.references.some(
      (reference) =>
        typeof reference !== 'string' || !isKbConceptPath(reference),
    ) ||
    (closeout.disposition === 'captured' && closeout.references.length === 0) ||
    (closeout.disposition === 'no-durable-lesson' &&
      closeout.references.length > 0)
  ) {
    throw new Error('AIDLC knowledge closeout is invalid.');
  }
  return {
    completedAt: closeout.completedAt,
    disposition: closeout.disposition,
    evidence: closeout.evidence,
    references: closeout.references,
  };
};

const parseKnowledgeCompressionSession = (
  data: Record<string, unknown>,
): AidlcKnowledgeCompressionSession | undefined => {
  const value = data.kb_compression_session;
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidKnowledgeCompressionSession();
  }
  const session = value as Record<string, unknown>;
  if (typeof session.kbRoot !== 'string' || !session.kbRoot.startsWith('/')) {
    return invalidKnowledgeCompressionSession();
  }
  const kbRoot = session.kbRoot.replace(/\/$/u, '');
  if (session.entries !== undefined) {
    return compressionBundleFor(session.entries, kbRoot);
  }
  return {
    ...compressionEntryFor(session, kbRoot),
    kbRoot,
  } as AidlcLegacyKnowledgeCompressionSession;
};

const parseKnowledgeContext = (
  data: Record<string, unknown>,
): AidlcKnowledgeContext => {
  const value = data.kb_context;
  if (value === undefined) return emptyAidlcKnowledgeContext();
  const context = value as AidlcKnowledgeContext;
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

export const renderAidlcFrontmatter = (intent: AidlcIntent): string =>
  matter.stringify('', aidlcFrontmatterData(intent)).trimEnd();

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

export const renderAidlcIntent = (intent: AidlcIntent): string =>
  matter.stringify(
    [
      `# ${intent.summary}`,
      '',
      '## Acceptance checklist',
      '',
      ...acceptanceChecklistFor(intent.summary, intent.uiRequired).map(
        (criterion) => `- [ ] ${criterion}`,
      ),
      '',
      '## Adopted AI-DLC stages',
      '',
      'This local runtime uses the selected universal stages. After Build and Test, knowledge-base owns durable capture and this temporary record can be retired.',
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
    ].join('\n'),
    aidlcFrontmatterData(intent),
  );

export const saveAidlcIntent = async (
  fileSystem: FileSystem,
  path: string,
  intent: AidlcIntent,
): Promise<void> => {
  assertAidlcIntentPath(path);
  await writeText(fileSystem, path, renderAidlcIntent(intent));
};

const stringField = (data: Record<string, unknown>, name: string): string => {
  const value = field(data, name);
  if (typeof value !== 'string') {
    throw new Error('AIDLC intent frontmatter is invalid.');
  }
  return value;
};

const optionalStringField = (
  data: Record<string, unknown>,
  name: string,
): string | undefined => {
  if (!(name in data)) return undefined;
  return stringField(data, name);
};

const parseApproval = (
  data: Record<string, unknown>,
): AidlcIntent['approval'] => {
  const approval = stringField(data, 'approval') as AidlcIntent['approval'];
  if (!['pending', 'approved', 'declined'].includes(approval)) {
    throw new Error('AIDLC intent approval is invalid.');
  }
  return approval;
};

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
  if (intent.stage === 'reverse-engineering' && !intent.kbContext.resolvedAt) {
    throw new Error(
      'Reverse Engineering requires a resolved knowledge context before completion.',
    );
  }
  if (
    intent.stage === 'build-and-test' &&
    !/final gate: .+ passed \(exit 0\)/u.test(evidence)
  ) {
    throw new Error(
      'Build and Test requires the exact passing final-gate receipt as evidence.',
    );
  }
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

export const validateAidlcKnowledgeCloseoutReferences = async (
  fileSystem: FileSystem,
  kbRoot: string,
  kbReferences: readonly string[],
): Promise<void> => {
  if (
    !kbRoot.startsWith('/') ||
    kbReferences.length === 0 ||
    kbReferences.some((reference) => !isKbConceptPath(reference))
  ) {
    throw new Error(
      'Captured knowledge closeout requires the authoritative private KB root and verified KB concept references.',
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
    Promise.all(indexPaths.map((indexPath) => readText(fileSystem, indexPath))),
  ]);
};

const validateParsedIntent = (intent: AidlcIntent): void => {
  if (!['active', 'superseded'].includes(intent.lifecycle)) {
    throw new Error('AIDLC intent lifecycle is invalid.');
  }
  if (intent.projectRoot && !intent.projectRoot.startsWith('/')) {
    throw new Error('AIDLC intent project root is invalid.');
  }
  if (intent.lifecycle === 'superseded' && !intent.supersededBy?.trim()) {
    throw new Error('Superseded AIDLC intents require a replacement id.');
  }
  if (currentRecord(intent).status === 'pending') {
    throw new Error('AIDLC current stage is pending.');
  }
  if (intent.kbCloseout && intent.kbCompressionSession) {
    throw new Error('AIDLC knowledge closeout is invalid.');
  }
};

const validateRoute = (
  route: readonly AidlcStageRecord[],
  uiRequired: boolean,
): void => {
  const expected = initialAidlcRoute(uiRequired);
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
  if (!uiRequired) {
    const mockups = route.find((record) => record.slug === 'refined-mockups');
    if (
      mockups?.status !== 'skipped' ||
      mockups.evidence !== 'Not applicable: intent declares no user-facing UI.'
    ) {
      throw new Error('AIDLC intent route is invalid.');
    }
  }
};

const parseRoute = (
  data: Record<string, unknown>,
  uiRequired: boolean,
): AidlcStageRecord[] => {
  const route = field(data, 'route') as AidlcStageRecord[];
  if (!Array.isArray(route)) {
    throw new Error('AIDLC intent route is invalid.');
  }
  validateRoute(route, uiRequired);
  return route;
};

export const parseAidlcIntent = (content: string): AidlcIntent => {
  const parsed = matter(content);
  assertIntentFrontmatter(content);
  const uiRequired = optionalBooleanField(parsed.data, 'ui_required') ?? true;
  const intent = {
    approval: parseApproval(parsed.data),
    cbmIndex: stringField(parsed.data, 'cbm_index'),
    id: stringField(parsed.data, 'id'),
    kbCloseout: parseKnowledgeCloseout(parsed.data),
    kbCompressionSession: parseKnowledgeCompressionSession(parsed.data),
    kbContext: parseKnowledgeContext(parsed.data),
    lifecycle: (optionalStringField(parsed.data, 'lifecycle') ??
      'active') as AidlcLifecycle,
    projectRoot: optionalStringField(parsed.data, 'project_root'),
    route: parseRoute(parsed.data, uiRequired),
    stage: stringField(parsed.data, 'stage') as AidlcStageSlug,
    summary: stringField(parsed.data, 'summary'),
    supersededBy: optionalStringField(parsed.data, 'superseded_by'),
    uiRequired,
  };
  validateParsedIntent(intent);
  return intent;
};

export const appendAidlcAuditEvent = async (
  fileSystem: FileSystem,
  path: string,
  event: AidlcAuditEvent,
): Promise<void> => {
  assertAidlcIntentPath(path);
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
): Promise<AidlcIntent> => {
  assertAidlcIntentPath(path);
  return parseAidlcIntent(await readText(fileSystem, path));
};

export const retireAidlcIntent = async (
  fileSystem: FileSystem,
  path: string,
): Promise<void> => {
  assertAidlcIntentPath(path);
  const intent = await loadAidlcIntent(fileSystem, path);
  if (aidlcIntentStatusFor(intent) !== 'completed') {
    throw new Error('Only a completed AIDLC intent can be retired.');
  }
  if (!intent.kbCloseout) {
    throw new Error(
      'Knowledge-base closeout is required before retirement. Use the canonical final-gate closeout command or the exact recovery action returned after a bare gate pass.',
    );
  }
  await removeFile(fileSystem, path);
};

export const updateAidlcIntent = async (
  fileSystem: FileSystem,
  path: string,
  intent: AidlcIntent,
): Promise<void> => {
  assertAidlcIntentPath(path);
  const existing = await readText(fileSystem, path);
  parseAidlcIntent(existing);
  const frontmatterUpdated = matter(existing);
  const ledgerPattern =
    /^\| # \| Phase \| Stage \| Status \| Evidence or skip reason \|\n\| --- \| --- \| --- \| --- \| --- \|\n(?:\| [^\n]+\|\n?)*\n*/mu;
  if (!ledgerPattern.test(frontmatterUpdated.content)) {
    throw new Error('AIDLC intent stage ledger is missing.');
  }
  const body = frontmatterUpdated.content.replace(
    ledgerPattern,
    `${stageLedger(intent)}\n\n`,
  );
  await writeText(
    fileSystem,
    path,
    matter.stringify(body, aidlcFrontmatterData(intent)),
  );
};

export const withAidlcKnowledgeCloseout = (
  intent: AidlcIntent,
  closeout: AidlcKnowledgeCloseout,
): AidlcIntent => {
  if (aidlcIntentStatusFor(intent) !== 'completed') {
    throw new Error(
      'Knowledge-base closeout requires a completed AIDLC intent.',
    );
  }
  if (intent.kbCloseout) {
    throw new Error('AIDLC knowledge-base closeout is already recorded.');
  }
  if (!closeout.completedAt.trim() || !closeout.evidence.trim()) {
    throw new Error(
      'AIDLC knowledge closeout requires timestamp and evidence.',
    );
  }
  if (
    (closeout.disposition === 'captured' && closeout.references.length === 0) ||
    (closeout.disposition === 'no-durable-lesson' &&
      closeout.references.length > 0) ||
    closeout.references.some((reference) => !isKbConceptPath(reference))
  ) {
    throw new Error('AIDLC knowledge closeout is invalid.');
  }
  return { ...intent, kbCloseout: closeout };
};

export const withAidlcKnowledgeContext = (
  intent: AidlcIntent,
  kbContext: AidlcKnowledgeContext,
): AidlcIntent => ({ ...intent, kbContext });

export const workspacePathFor = (
  agentsRoot: string,
  cbmIndex: string,
): string => `${agentsRoot.replace(/\/$/u, '')}/aidlc/${cbmIndex}/workspace.md`;
