import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import matter from 'gray-matter';
import type { CommandBody, CommandDeclaration, ParsedInput } from '../utils/cli/declaration.js';
import { runMain } from '../utils/cli/index.js';
import { UsageError } from '../utils/cli/usage-error.js';
import type { DirectoryEntry, FileSystem } from '../utils/filesystem.js';
import { nodeFileSystem, readText, writeText } from '../utils/filesystem.js';
import type { OkfMetadata } from '../utils/okf.js';
import { parseOkfConcept, renderOkfConcept, validateOkfMetadata } from '../utils/okf.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';
import { type BatchTask, runBatched } from '../utils/quality-engine/batch.js';
import { type RepoSearchEnvelope, repoSearchDiscover } from '../utils/repo-search/index.js';
import {
  DEVIATION_CLASSES,
  type DeltaRecord,
  deltaPathFor,
  parseDeltaRecord,
} from './plans/aidx-delta.js';
import { defaultMoveSourceToTrash } from './trash.js';

type BatchSearchDependency = typeof searchKnowledgeBaseBatch;

export interface CapturedConcept {
  readonly conceptPath: string;
  readonly rootIndexPath: string;
  readonly scopeIndexPath: string;
  readonly subjectIndexPath: string;
}

type CaptureDependency = typeof captureConcept;

export interface DirectoryIndexEntry {
  readonly description?: string;
  readonly path: string;
  readonly title?: string;
}

type DiscoverDependency = typeof searchKnowledgeBaseWithFallback;

type ImportDependency = typeof importPlan;

export interface KbInfo {
  readonly availableIndexes: readonly string[];
  readonly resolvedRoot: string;
}

export interface KnowledgeBaseBatchSearchResult {
  readonly query: string;
  readonly receipt: KnowledgeBaseSearchReceipt;
}

export interface KnowledgeBaseDependencies {
  readonly batchSearch: BatchSearchDependency;
  readonly capture: CaptureDependency;
  readonly discover: DiscoverDependency;
  readonly importer: ImportDependency;
  readonly moveSourceToTrash: MoveSourceToTrashDependency;
  readonly reconcile: ReconcileDependency;
  readonly search: SearchDependency;
}

export interface KnowledgeBaseSearchReceipt {
  readonly concepts: readonly KnowledgeSearchResult[];
  readonly discovery: RepoSearchEnvelope;
  readonly kbInfo: KbInfo;
}

export interface KnowledgeSearchResult {
  readonly description: string;
  readonly path: string;
  readonly title: string;
  readonly type: string;
}

export interface Lesson {
  readonly cause: string;
  readonly durableFix: string;
  readonly evidence: string;
  readonly symptom: string;
}

type MoveSourceToTrashDependency = typeof defaultMoveSourceToTrash;

export interface PlanImportDocument {
  readonly headings: readonly string[];
  readonly objective: string;
  readonly repoSearchIndex: string;
  readonly sections: Readonly<Record<string, string>>;
  readonly title: string;
}

export interface PlanImportReceipt {
  readonly concept: CapturedConcept;
  readonly conceptPath: string;
  readonly planPath: string;
  readonly repoSearchIndex: string;
  readonly sections: readonly string[];
}

type ReconcileDependency = typeof reconcileConcepts;

export type ReconciliationDisposition = 'link-related' | 'new-primary' | 'update-existing';

export interface ReconciliationLink {
  readonly from: string;
  readonly to: string;
}

export interface ReconciliationOperation {
  readonly body: string;
  readonly disposition: ReconciliationDisposition;
  readonly evidence: string;
  readonly metadata: OkfMetadata;
  readonly relativePath: string;
}

export interface ReconciliationPlan {
  readonly canonicalPath: string;
  readonly links: readonly ReconciliationLink[];
  readonly operations: readonly ReconciliationOperation[];
}

export interface ReconciliationReceipt {
  readonly concepts: readonly CapturedConcept[];
  readonly links: readonly ReconciliationLink[];
}

type SearchDependency = typeof searchKnowledgeBase;

export { parseOkfConcept, renderOkfConcept, validateOkfMetadata };

export const maxKnowledgeBaseBatchSize = 4;

const conceptPath =
  /^(?:shared|[A-Za-z0-9][A-Za-z0-9._-]*)\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/u;

export const isKbConceptPath = (path: string): boolean => conceptPath.test(path);

const planFrontmatterFields = new Set([
  'title',
  'repo_search_index',
  'created_at',
  'updated_at',
  'status',
]);

const planSectionHeadings = [
  'TARGET DIRECTIVES',
  'VARIABLE DEFINITION MATRIX',
  'CHRONOLOGICAL WORKFLOW',
  'TOOL STRATEGY & FALLBACKS',
  'SYSTEMATIC VERIFICATION CHECKLIST',
  'RIGID OUTPUT SCHEMA',
] as const;

export const conceptIndexPath = (path: string): string => {
  if (!isKbConceptPath(path)) {
    throw new Error(`Invalid KB concept path: ${path}`);
  }
  const [scope, subject] = path.split('/');
  return `${scope}/${subject}/index.md`;
};

const indexChildren = (content: string): readonly DirectoryIndexEntry[] =>
  [...content.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)(?:\s+-\s(.*))?$/gmu)].map((match) => ({
    description: match[3]?.trim() || undefined,
    path: match[2],
    title: match[1],
  }));

const optionalDirectory = async (
  fileSystem: FileSystem,
  path: string,
): Promise<readonly DirectoryEntry[]> => {
  if (!fileSystem.readdir) {
    throw new Error('KB search requires directory listing support.');
  }
  try {
    return await fileSystem.readdir(path, { withFileTypes: true });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

export const listKbScopeIndexes = async (
  fileSystem: FileSystem,
  kbRoot: string,
): Promise<readonly string[]> => {
  const normalizedRoot = kbRoot.replace(/\/$/u, '');
  const entries = await optionalDirectory(fileSystem, normalizedRoot);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== 'shared')
    .sort((left, right) => left.localeCompare(right));
};

export const buildKbInfo = async (fileSystem: FileSystem, kbRoot: string): Promise<KbInfo> => ({
  availableIndexes: await listKbScopeIndexes(fileSystem, kbRoot),
  resolvedRoot: kbRoot.replace(/\/$/u, ''),
});

const planSection = (body: string, heading: string, nextHeading?: string): string => {
  // biome-ignore lint/security/noSecrets: -
  const end = nextHeading ? `(?=^## \\d+\\. ${nextHeading}\\n)` : '(?![\\s\\S])';
  const match = new RegExp(`^## \\d+\\. ${heading}\\n([\\s\\S]*?)${end}`, 'mu').exec(body);
  if (!match?.[1]?.trim()) {
    throw new Error(`Plan section is required: ${heading}.`);
  }
  return match[1].trim();
};

const planSlug = (title: string): string => {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
  if (!slug) {
    throw new Error('Plan title must contain letters or numbers.');
  }
  return slug;
};

const privateKnowledgeBaseRoot = (): string =>
  resolve(homedir(), 'Library', 'Application Support', 'agent-knowledge-base');

const readOptionalText = async (
  fileSystem: FileSystem,
  path: string,
): Promise<string | undefined> => {
  try {
    return await readText(fileSystem, path);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const relativeLinkPath = (from: string, to: string): string => {
  const fromDirectory = from.split('/').slice(0, -1);
  const targetParts = to.split('/');
  let commonLength = 0;
  while (
    commonLength < fromDirectory.length
    && commonLength < targetParts.length - 1
    && fromDirectory[commonLength] === targetParts[commonLength]
  ) {
    commonLength += 1;
  }
  return [
    ...fromDirectory.slice(commonLength).map(() => '..'),
    ...targetParts.slice(commonLength),
  ].join('/');
};

const linkTarget = (from: string, to: string): string => `](${relativeLinkPath(from, to)})`;

export const renderCapturedConcept = (
  metadata: OkfMetadata,
  evidence: string,
  body: string,
): string => {
  if (!evidence.trim()) {
    throw new Error('KB capture evidence is required.');
  }
  return renderOkfConcept(metadata, `${body.trim()}\n\n## Evidence\n\n${evidence.trim()}`);
};

const renderDeltaSection = (delta: DeltaRecord): string => {
  const classes = DEVIATION_CLASSES.map((name) => ({
    count: delta.deviations.filter((deviation) => deviation.class === name).length,
    name,
  })).filter((entry) => entry.count > 0);
  return [
    '## Plan delta',
    '',
    `- Plan: ${delta.plan}`,
    `- Steps: ${delta.steps.planned} planned, ${delta.steps.completed} completed, ${delta.steps.skipped} skipped`,
    `- Unforeseen deviations: ${delta.unforeseen} (score ${delta.score})`,
    ...delta.caps.map((cap) => `- Cap ${cap.id}: ${cap.used} used of ${cap.planned}`),
    ...classes.map((entry) => `- Deviations ${entry.name}: ${entry.count}`),
  ].join('\n');
};

const importBody = (document: PlanImportDocument, delta?: DeltaRecord): string =>
  [
    ...document.headings.map((heading) => `## ${heading}\n\n${document.sections[heading]}`),
    ...(delta ? [renderDeltaSection(delta)] : []),
  ].join('\n\n');

export const renderDirectoryIndex = (
  title: string,
  children: readonly (DirectoryIndexEntry | string)[],
): string => {
  if (!title.trim()) {
    throw new Error('KB index title is required.');
  }
  const entries = new Map<string, DirectoryIndexEntry>();
  for (const child of children) {
    const entry = typeof child === 'string' ? { path: child } : child;
    entries.set(entry.path, entry);
  }
  const links = [...entries.values()]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => {
      const label = entry.title ?? entry.path.replace(/\.md$/u, '');
      const description = entry.description ? ` - ${entry.description}` : '';
      return `- [${label}](${entry.path})${description}`;
    });
  return [`# ${title.trim()}`, '', ...links, ''].join('\n');
};

const mergedDirectoryIndex = (
  existing: string | undefined,
  title: string,
  child: DirectoryIndexEntry | string,
): string => renderDirectoryIndex(title, [...(existing ? indexChildren(existing) : []), child]);

const requiredPlanField = (data: Record<string, unknown>, field: string): string => {
  const value = data[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Plan frontmatter field is required: ${field}.`);
  }
  return value.trim();
};

export const parsePlanForImport = (content: string): PlanImportDocument => {
  if (!matter.test(content)) {
    throw new Error('Plan YAML frontmatter is required for KB import.');
  }
  const parsed = matter(content);
  const metadata = parsed.data as Record<string, unknown>;
  const unsupported = Object.keys(metadata).filter((field) => !planFrontmatterFields.has(field));
  if (unsupported.length > 0) {
    throw new Error(`Plan frontmatter has unsupported field(s): ${unsupported.join(', ')}.`);
  }
  const body = parsed.content.trim();
  const headings = [...body.matchAll(/^## \d+\. (.+)$/gmu)].map((match) => match[1].trim());
  if (headings.join('\n') !== planSectionHeadings.join('\n')) {
    throw new Error(
      'KB plan import requires the six H2 numbered sections in template order: ## 1. TARGET DIRECTIVES through ## 6. RIGID OUTPUT SCHEMA.',
    );
  }
  const sections = Object.fromEntries(
    planSectionHeadings.map((heading, index) => [
      heading,
      planSection(body, heading, planSectionHeadings[index + 1]),
    ]),
  );
  return {
    headings: planSectionHeadings,
    objective: sections['TARGET DIRECTIVES'],
    repoSearchIndex: requiredPlanField(metadata, 'repo_search_index'),
    sections,
    title: requiredPlanField(metadata, 'title'),
  };
};

export const scopeIndexPath = (path: string): string => {
  if (!isKbConceptPath(path)) {
    throw new Error(`Invalid KB concept path: ${path}`);
  }
  return `${path.split('/')[0]}/index.md`;
};

export const captureConcept = async (
  fileSystem: FileSystem,
  kbRoot: string,
  relativePath: string,
  metadata: OkfMetadata,
  body: string,
  evidence: string,
): Promise<CapturedConcept> => {
  if (!kbRoot.startsWith('/')) {
    throw new Error('KB root must be an absolute path.');
  }
  if (!isKbConceptPath(relativePath)) {
    throw new Error(`Invalid KB concept path: ${relativePath}`);
  }
  const root = kbRoot.replace(/\/$/u, '');
  const [scope, subject, concept] = relativePath.split('/');
  const conceptFilePath = `${root}/${relativePath}`;
  const subjectIndexFilePath = `${root}/${conceptIndexPath(relativePath)}`;
  const scopeIndexFilePath = `${root}/${scopeIndexPath(relativePath)}`;
  const rootIndexFilePath = `${root}/index.md`;
  const [existingSubjectIndex, existingScopeIndex, existingRootIndex] = await Promise.all([
    readOptionalText(fileSystem, subjectIndexFilePath),
    readOptionalText(fileSystem, scopeIndexFilePath),
    readOptionalText(fileSystem, rootIndexFilePath),
  ]);
  await Promise.all([
    writeText(fileSystem, conceptFilePath, renderCapturedConcept(metadata, evidence, body)),
    writeText(
      fileSystem,
      subjectIndexFilePath,
      mergedDirectoryIndex(existingSubjectIndex, subject, {
        description: metadata.description,
        path: concept,
        title: metadata.title,
      }),
    ),
    writeText(
      fileSystem,
      scopeIndexFilePath,
      mergedDirectoryIndex(existingScopeIndex, scope, `${subject}/index.md`),
    ),
    writeText(
      fileSystem,
      rootIndexFilePath,
      mergedDirectoryIndex(existingRootIndex, 'Knowledge Base', `${scope}/index.md`),
    ),
  ]);
  return {
    conceptPath: conceptFilePath,
    rootIndexPath: rootIndexFilePath,
    scopeIndexPath: scopeIndexFilePath,
    subjectIndexPath: subjectIndexFilePath,
  };
};

export const importPlan = async (
  fileSystem: FileSystem,
  kbRoot: string,
  planPath: string,
): Promise<PlanImportReceipt> => {
  if (!kbRoot.startsWith('/') || !planPath.startsWith('/')) {
    throw new Error('KB plan import requires absolute KB and plan paths.');
  }
  if (!planPath.includes('/.agents/plans/')) {
    throw new Error('KB plan import requires a plan under .agents/plans/.');
  }
  const document = parsePlanForImport(await readText(fileSystem, planPath));
  const conceptPath = `${document.repoSearchIndex}/plans/${planSlug(document.title)}.md`;
  if (!isKbConceptPath(conceptPath)) {
    throw new Error(`KB plan import produced an invalid concept path: ${conceptPath}`);
  }
  const description = document.objective.split(/\r?\n/u)[0].trim().slice(0, 240);
  const deltaPath = deltaPathFor(planPath);
  const delta = (await fileSystem.exists(deltaPath))
    ? parseDeltaRecord(await readText(fileSystem, deltaPath))
    : undefined;
  const sourceLabel = planPath.startsWith('/') ? basename(planPath) : planPath;
  const concept = await captureConcept(
    fileSystem,
    kbRoot,
    conceptPath,
    {
      description,
      tags: ['implementation-plan', document.repoSearchIndex],
      title: document.title,
      type: 'plan',
    },
    importBody(document, delta),
    `Source plan: ${sourceLabel}. Verification: imported by the knowledge-base plan importer.`,
  );
  return {
    concept,
    conceptPath,
    planPath,
    repoSearchIndex: document.repoSearchIndex,
    sections: planSectionHeadings,
  };
};

const tokenMatches = (haystack: string, token: string): boolean => {
  if (haystack.includes(token)) {
    return true;
  }
  return token.endsWith('s') && token.length > 3 && haystack.includes(token.slice(0, -1));
};

export const searchKnowledgeBase = async (
  fileSystem: FileSystem,
  kbRoot: string,
  query: string,
): Promise<readonly KnowledgeSearchResult[]> => {
  if (!kbRoot.startsWith('/')) {
    throw new Error('KB root must be an absolute path.');
  }
  const tokens = [...new Set(query.trim().toLocaleLowerCase('en-US').split(/\s+/u))].filter(
    (token) => token.length > 0,
  );
  if (tokens.length === 0) {
    throw new Error('KB search query is required.');
  }
  const normalizedRoot = kbRoot.replace(/\/$/u, '');
  const results: (KnowledgeSearchResult & { readonly weight: number })[] = [];
  const resultForEntry = async (
    directory: string,
    entry: DirectoryEntry,
  ): Promise<(KnowledgeSearchResult & { readonly weight: number }) | undefined> => {
    if (entry.name === 'index.md' || !entry.name.endsWith('.md')) {
      return undefined;
    }
    const path = `${directory}/${entry.name}`;
    const content = await readText(fileSystem, path);
    let metadata: OkfMetadata;
    try {
      metadata = parseOkfConcept(content);
    } catch {
      return undefined;
    }
    const searchable = `${path}\n${metadata.title}\n${metadata.description}\n${content}`;
    const haystack = searchable.toLowerCase();
    if (!tokens.every((token) => tokenMatches(haystack, token))) {
      return undefined;
    }
    const headline = `${metadata.title}\n${metadata.description}`.toLowerCase();
    const weight = tokens.filter((token) => tokenMatches(headline, token)).length;
    return {
      description: metadata.description,
      path: path.slice(normalizedRoot.length + 1),
      title: metadata.title,
      type: metadata.type,
      weight,
    };
  };
  const walk = async (directory: string): Promise<void> => {
    const entries = await optionalDirectory(fileSystem, directory);
    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      const result = await resultForEntry(directory, entry);
      if (result) {
        results.push(result);
      }
    }
  };
  await walk(normalizedRoot);
  return results
    .sort((left, right) => right.weight - left.weight || left.path.localeCompare(right.path))
    .map(({ weight: _weight, ...result }) => result);
};

export const searchKnowledgeBaseWithFallback = async (
  fileSystem: FileSystem,
  executor: CommandExecutor,
  kbRoot: string,
  query: string,
): Promise<KnowledgeBaseSearchReceipt> => {
  const conceptsPromise = searchKnowledgeBase(fileSystem, kbRoot, query);
  const kbInfoPromise = buildKbInfo(fileSystem, kbRoot);
  const [concepts, discovery, kbInfo] = await Promise.all([
    conceptsPromise,
    repoSearchDiscover({
      allowedRoots: [kbRoot],
      discoveryMode: 'private-kb-local',
      executor,
      query,
      root: kbRoot,
      transport: null,
    }),
    kbInfoPromise,
  ]);
  return {
    concepts,
    discovery,
    kbInfo,
  };
};

export const searchKnowledgeBaseBatch = async (
  fileSystem: FileSystem,
  executor: CommandExecutor,
  kbRoot: string,
  queries: readonly string[],
): Promise<readonly KnowledgeBaseBatchSearchResult[]> => {
  if (queries.length === 0 || queries.length > maxKnowledgeBaseBatchSize) {
    throw new Error(`KB search-batch requires 1-${maxKnowledgeBaseBatchSize} queries.`);
  }
  const normalized = queries.map((query) => query.trim().toLocaleLowerCase('en-US'));
  if (normalized.some((query) => !query)) {
    throw new Error('KB search-batch queries must be nonblank.');
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('KB search-batch queries must be unique after normalization.');
  }
  const tasks: BatchTask<KnowledgeBaseSearchReceipt>[] = queries.map((query, index) => ({
    id: `query-${index}`,
    mode: 'read-only',
    run: () => searchKnowledgeBaseWithFallback(fileSystem, executor, kbRoot, query),
  }));
  const receipts = await runBatched(tasks);
  const receiptById = new Map(receipts.map((result) => [result.id, result.value]));
  return queries.map((query, index) => ({
    query,
    receipt: receiptById.get(`query-${index}`) as KnowledgeBaseSearchReceipt,
  }));
};

export const validateLesson = (lesson: Lesson): void => {
  for (const [name, value] of Object.entries(lesson)) {
    if (!value.trim()) {
      throw new Error(`Lesson ${name} is required.`);
    }
  }
};

export const renderLessonBody = (lesson: Lesson): string => {
  validateLesson(lesson);
  return [
    '## Observed lesson',
    '',
    `- Symptom: ${lesson.symptom}`,
    `- Cause: ${lesson.cause}`,
    `- Durable fix: ${lesson.durableFix}`,
    `- Evidence: ${lesson.evidence}`,
  ].join('\n');
};

const validateReconciliationHeader = (plan: ReconciliationPlan): void => {
  if (!isKbConceptPath(plan.canonicalPath)) {
    throw new Error(`Invalid KB concept path: ${plan.canonicalPath}`);
  }
  if (plan.operations.length === 0) {
    throw new Error('KB reconciliation requires at least one operation.');
  }
  if (
    plan.operations.filter((operation) => operation.relativePath === plan.canonicalPath).length
    !== 1
  ) {
    throw new Error('KB reconciliation requires exactly one canonical owner.');
  }
};

const validateReconciliationLinks = (
  plan: ReconciliationPlan,
  paths: ReadonlySet<string>,
): void => {
  for (const link of plan.links) {
    if (!paths.has(link.from) || !paths.has(link.to)) {
      throw new Error('KB reconciliation links must connect planned concepts.');
    }
    const source = plan.operations.find((operation) => operation.relativePath === link.from);
    if (!source?.body.includes(linkTarget(link.from, link.to))) {
      throw new Error(`KB reconciliation is missing declared link: ${link.from} -> ${link.to}`);
    }
  }
};

const validateReconciliationOperation = async (
  fileSystem: FileSystem,
  kbRoot: string,
  operation: ReconciliationOperation,
  paths: Set<string>,
): Promise<void> => {
  if (!isKbConceptPath(operation.relativePath) || paths.has(operation.relativePath)) {
    throw new Error(
      `KB reconciliation has an invalid or duplicate path: ${operation.relativePath}`,
    );
  }
  paths.add(operation.relativePath);
  validateOkfMetadata(operation.metadata);
  if (!operation.body.trim() || !operation.evidence.trim()) {
    throw new Error(`KB reconciliation requires body and evidence: ${operation.relativePath}`);
  }
  const existing = await readOptionalText(
    fileSystem,
    `${kbRoot.replace(/\/$/u, '')}/${operation.relativePath}`,
  );
  if (operation.disposition === 'new-primary' && existing) {
    throw new Error(`KB reconciliation new-primary already exists: ${operation.relativePath}`);
  }
  if (operation.disposition !== 'new-primary' && !existing) {
    throw new Error(`KB reconciliation requires an existing concept: ${operation.relativePath}`);
  }
};

const validateReconciliationPlan = async (
  fileSystem: FileSystem,
  kbRoot: string,
  plan: ReconciliationPlan,
): Promise<void> => {
  validateReconciliationHeader(plan);
  const paths = new Set<string>();
  for (const operation of plan.operations) {
    await validateReconciliationOperation(fileSystem, kbRoot, operation, paths);
  }
  validateReconciliationLinks(plan, paths);
};

export const reconcileConcepts = async (
  fileSystem: FileSystem,
  kbRoot: string,
  plan: ReconciliationPlan,
): Promise<ReconciliationReceipt> => {
  if (!kbRoot.startsWith('/')) {
    throw new Error('KB root must be an absolute path.');
  }
  await validateReconciliationPlan(fileSystem, kbRoot, plan);
  const concepts: CapturedConcept[] = [];
  for (const operation of plan.operations) {
    concepts.push(
      await captureConcept(
        fileSystem,
        kbRoot,
        operation.relativePath,
        operation.metadata,
        operation.body,
        operation.evidence,
      ),
    );
  }
  return { concepts, links: plan.links };
};

const defaultCaptureDependency: CaptureDependency = captureConcept;
const defaultSearchDependency: SearchDependency = searchKnowledgeBase;
const defaultDiscoverDependency: DiscoverDependency = searchKnowledgeBaseWithFallback;
const defaultReconcileDependency: ReconcileDependency = reconcileConcepts;
const defaultBatchSearchDependency: BatchSearchDependency = searchKnowledgeBaseBatch;
const defaultImportDependency: ImportDependency = importPlan;

const defaultDependencies: KnowledgeBaseDependencies = {
  batchSearch: defaultBatchSearchDependency,
  capture: defaultCaptureDependency,
  discover: defaultDiscoverDependency,
  importer: defaultImportDependency,
  moveSourceToTrash: defaultMoveSourceToTrash,
  reconcile: defaultReconcileDependency,
  search: defaultSearchDependency,
};

const compactJson = (data: unknown): string => JSON.stringify(data);

const kbBody = <Data>(
  summary: string,
  positionals: string,
  arity: readonly [number, number],
  render: (data: Data) => string,
  run: (values: readonly string[], input: ParsedInput) => Data | Promise<Data>,
  options?: CommandBody<unknown>['options'],
): CommandBody<unknown> => ({
  arity,
  ...(options ? { options } : {}),
  positionals,
  renderText: render as (data: unknown) => string,
  run: (input) => run(input.positionals, input),
  summary,
});

const parseJsonInput = (text: string, label: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`${label} must be valid JSON.`);
  }
};

const plainText = (data: unknown): string => String(data);

const prettyJson = (data: unknown): string => JSON.stringify(data, null, 2);

const queryOf = (words: readonly string[]): string => {
  const query = words.join(' ').trim();
  if (!query) {
    throw new UsageError('A non-empty query is required.');
  }
  return query;
};

const searchBody = (
  dependencies: KnowledgeBaseDependencies,
  related: boolean,
): CommandBody<unknown> =>
  kbBody(
    related
      ? 'Return the concepts related to a query together with the KB info.'
      : 'Search the private KB, falling back to repository discovery.',
    '<kb-root> <query...>',
    [2, Number.POSITIVE_INFINITY],
    prettyJson,
    async ([kbRoot = '', ...words]) => {
      const query = queryOf(words);
      if (related) {
        const [concepts, kbInfo] = await Promise.all([
          dependencies.search(nodeFileSystem, kbRoot, query),
          buildKbInfo(nodeFileSystem, kbRoot),
        ]);
        return { concepts, kbInfo };
      }
      return dependencies.discover(nodeFileSystem, bunExecutor, kbRoot, query);
    },
  );

export const createCommand = (
  overrides: Partial<KnowledgeBaseDependencies> = {},
): CommandDeclaration<unknown> => {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    commands: {
      capture: kbBody(
        'Capture one OKF concept with its evidence and refresh the indexes.',
        '<kb-root> <relative-path> <metadata-json> <body> <evidence>',
        [5, 5],
        compactJson,
        ([kbRoot = '', relativePath = '', metadataJson = '', body = '', evidence = '']) => {
          if (![kbRoot, relativePath, metadataJson, body, evidence].every(Boolean)) {
            throw new UsageError('Every capture argument must be non-empty.');
          }
          const metadata = parseJsonInput(metadataJson, 'KB capture metadata') as OkfMetadata;
          return dependencies.capture(
            nodeFileSystem,
            kbRoot,
            relativePath,
            metadata,
            body,
            evidence,
          );
        },
      ),
      'concept-index': kbBody(
        'Print the index path of one KB concept path.',
        '<concept-path>',
        [1, 1],
        plainText,
        ([value = '']) => {
          if (!isKbConceptPath(value)) {
            throw new UsageError(`Invalid KB concept path: ${value}`);
          }
          return conceptIndexPath(value);
        },
      ),
      'import-plan': kbBody(
        'Import one completed plan; --remove-source moves the source plan to ~/.Trash/ after a successful import.',
        '<plan-path>',
        [1, 1],
        prettyJson,
        async ([planPath = ''], input) => {
          const absolutePlanPath = resolve(process.cwd(), planPath);
          const receipt = await dependencies.importer(
            nodeFileSystem,
            privateKnowledgeBaseRoot(),
            absolutePlanPath,
          );
          const retiredTo =
            input.values['remove-source'] === true
              ? await dependencies.moveSourceToTrash(absolutePlanPath)
              : undefined;
          return { ...receipt, retiredTo };
        },
        {
          'remove-source': {
            description: 'Move the source plan to ~/.Trash/ after a successful import.',
            type: 'boolean',
          },
        },
      ),
      reconcile: kbBody(
        'Reconcile a planned set of concepts from a JSON request file.',
        '<kb-root> <absolute-request-json-path>',
        [2, 2],
        compactJson,
        async ([kbRoot = '', requestPath = '']) => {
          if (!requestPath.startsWith('/')) {
            throw new UsageError('The reconciliation request path must be absolute.');
          }
          const plan = parseJsonInput(
            await readText(nodeFileSystem, requestPath),
            'KB reconciliation request',
          ) as ReconciliationPlan;
          return dependencies.reconcile(nodeFileSystem, kbRoot, plan);
        },
      ),
      related: searchBody(dependencies, true),
      'render-index': kbBody(
        'Render a directory index for a title and its items.',
        '<title> [item...]',
        [1, Number.POSITIVE_INFINITY],
        plainText,
        ([title = '', ...items]) => renderDirectoryIndex(title, items),
      ),
      search: searchBody(dependencies, false),
      'search-batch': kbBody(
        'Search the private KB for 1-4 unique queries in one run.',
        '<kb-root> <query...>',
        [2, Number.POSITIVE_INFINITY],
        prettyJson,
        ([kbRoot = '', ...queries]) =>
          dependencies.batchSearch(nodeFileSystem, bunExecutor, kbRoot, queries),
      ),
      validate: kbBody(
        'Validate one OKF concept file.',
        '<concept-path>',
        [1, 1],
        plainText,
        async ([value = '']) => {
          parseOkfConcept(await readText(nodeFileSystem, value));
          return 'okf: passed';
        },
      ),
    },
    script: 'scripts/knowledge-base.ts',
    summary: 'Private knowledge-base lookup, capture, reconciliation, and plan import.',
  };
};

export const command = createCommand();

void runMain(command, import.meta.main);
