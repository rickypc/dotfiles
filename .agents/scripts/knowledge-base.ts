import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import matter from 'gray-matter';
import {
  runWhenMain as runCliWhenMain,
  runWhenMainWithHelp,
} from '../utils/cli.js';
import type { DirectoryEntry, FileSystem } from '../utils/filesystem.js';
import { nodeFileSystem, readText, writeText } from '../utils/filesystem.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';
import { type BatchTask, runBatched } from '../utils/quality-engine/batch.js';
import {
  type RepoSearchSearchFallbackReceipt,
  searchWithRepoSearchFallback,
} from '../utils/repo-search.js';
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

export interface KnowledgeBaseSearchReceipt {
  readonly concepts: readonly KnowledgeSearchResult[];
  readonly discovery: RepoSearchSearchFallbackReceipt;
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

export interface OkfMetadata {
  readonly description: string;
  readonly tags: readonly string[];
  readonly title: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

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

export type ReconciliationDisposition =
  | 'link-related'
  | 'new-primary'
  | 'update-existing';

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

export const maxKnowledgeBaseBatchSize = 4;

const conceptPath =
  /^(?:shared|[A-Za-z0-9][A-Za-z0-9._-]*)\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/u;

export const isKbConceptPath = (path: string): boolean =>
  conceptPath.test(path);

const requiredFields: readonly (keyof OkfMetadata)[] = [
  'type',
  'title',
  'description',
  'tags',
];

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

const importBody = (document: PlanImportDocument): string =>
  document.headings
    .map((heading) => `## ${heading}\n\n${document.sections[heading]}`)
    .join('\n\n');

const indexChildren = (content: string): readonly DirectoryIndexEntry[] =>
  [...content.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)(?:\s+-\s(.*))?$/gmu)].map(
    (match) => ({
      description: match[3]?.trim() || undefined,
      path: match[2],
      title: match[1],
    }),
  );

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
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
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

export const buildKbInfo = async (
  fileSystem: FileSystem,
  kbRoot: string,
): Promise<KbInfo> => ({
  availableIndexes: await listKbScopeIndexes(fileSystem, kbRoot),
  resolvedRoot: kbRoot.replace(/\/$/u, ''),
});

const planSection = (
  body: string,
  heading: string,
  nextHeading?: string,
): string => {
  const end = nextHeading ? `(?=^## \\d+\\. ${nextHeading}\\n)` : '$';
  const match = new RegExp(
    `^## \\d+\\. ${heading}\\n([\\s\\S]*?)${end}`,
    'mu',
  ).exec(body);
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
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
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
    commonLength < fromDirectory.length &&
    commonLength < targetParts.length - 1 &&
    fromDirectory[commonLength] === targetParts[commonLength]
  ) {
    commonLength += 1;
  }
  return [
    ...fromDirectory.slice(commonLength).map(() => '..'),
    ...targetParts.slice(commonLength),
  ].join('/');
};

const linkTarget = (from: string, to: string): string =>
  `](${relativeLinkPath(from, to)})`;

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
): string =>
  renderDirectoryIndex(title, [
    ...(existing ? indexChildren(existing) : []),
    child,
  ]);

const requiredPlanField = (
  data: Record<string, unknown>,
  field: string,
): string => {
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
  const unsupported = Object.keys(metadata).filter(
    (field) => !planFrontmatterFields.has(field),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Plan frontmatter has unsupported field(s): ${unsupported.join(', ')}.`,
    );
  }
  const body = parsed.content.trim();
  const headings = [...body.matchAll(/^## \d+\. (.+)$/gmu)].map((match) =>
    match[1].trim(),
  );
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

const runBatchSearchCommand = async (
  args: readonly string[],
  batchSearch: typeof searchKnowledgeBaseBatch,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, value, repoSearchIndex, ...queries] = args;
  if (
    command !== 'search-batch' ||
    !value ||
    !repoSearchIndex ||
    queries.length === 0
  ) {
    return false;
  }
  write(
    JSON.stringify(
      await batchSearch(
        nodeFileSystem,
        bunExecutor,
        value,
        repoSearchIndex,
        queries,
      ),
      null,
      2,
    ),
  );
  return true;
};

const runCapture = async (
  args: readonly string[],
  capture: typeof captureConcept,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, kbRoot, relativePath, metadataJson, body, evidence] = args;
  if (
    command !== 'capture' ||
    !kbRoot ||
    !relativePath ||
    !metadataJson ||
    !body ||
    !evidence ||
    args.length !== 6
  ) {
    return false;
  }
  let metadata: OkfMetadata;
  try {
    metadata = JSON.parse(metadataJson) as OkfMetadata;
  } catch {
    throw new Error('KB capture metadata must be valid JSON.');
  }
  write(
    JSON.stringify(
      await capture(
        nodeFileSystem,
        kbRoot,
        relativePath,
        metadata,
        body,
        evidence,
      ),
    ),
  );
  return true;
};

const runConceptIndex = (
  args: readonly string[],
  write: (message: string) => void,
): boolean => {
  const [command, value] = args;
  if (
    command !== 'concept-index' ||
    !value ||
    args.length !== 2 ||
    !isKbConceptPath(value)
  ) {
    return false;
  }
  write(conceptIndexPath(value));
  return true;
};

const runImportPlan = async (
  args: readonly string[],
  importer: typeof importPlan,
  write: (message: string) => void,
  moveSourceToTrash: (sourcePath: string) => Promise<string>,
): Promise<boolean> => {
  const [command, planPath, ...rest] = args;
  const removeSource = rest.includes('--remove-source');
  if (
    command !== 'import-plan' ||
    !planPath ||
    rest.length > 1 ||
    (rest.length === 1 && !removeSource)
  ) {
    return false;
  }
  const absolutePlanPath = resolve(process.cwd(), planPath);
  const receipt = await importer(
    nodeFileSystem,
    privateKnowledgeBaseRoot(),
    absolutePlanPath,
  );
  const retiredTo = removeSource
    ? await moveSourceToTrash(absolutePlanPath)
    : undefined;
  write(JSON.stringify({ ...receipt, retiredTo }, null, 2));
  return true;
};

const runReconcile = async (
  args: readonly string[],
  reconcile: typeof reconcileConcepts,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, kbRoot, requestPath] = args;
  if (
    command !== 'reconcile' ||
    !kbRoot ||
    !requestPath ||
    !requestPath.startsWith('/') ||
    args.length !== 3
  ) {
    return false;
  }
  let plan: ReconciliationPlan;
  try {
    plan = JSON.parse(
      await readText(nodeFileSystem, requestPath),
    ) as ReconciliationPlan;
  } catch {
    throw new Error('KB reconciliation request must be valid JSON.');
  }
  write(JSON.stringify(await reconcile(nodeFileSystem, kbRoot, plan)));
  return true;
};

const runSearchCommand = async (
  args: readonly string[],
  search: typeof searchKnowledgeBase,
  discover: typeof searchKnowledgeBaseWithFallback,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, value, first, second] = args;
  if ((command !== 'search' && command !== 'related') || !value || !first) {
    return false;
  }
  if (args.length === 3) {
    const [concepts, kbInfo] = await Promise.all([
      search(nodeFileSystem, value, first),
      buildKbInfo(nodeFileSystem, value),
    ]);
    write(JSON.stringify({ concepts, kbInfo }, null, 2));
    return true;
  }
  if (command === 'search' && second && args.length === 4) {
    write(
      JSON.stringify(
        await discover(nodeFileSystem, bunExecutor, value, first, second),
        null,
        2,
      ),
    );
    return true;
  }
  return false;
};

export const scopeIndexPath = (path: string): string => {
  if (!isKbConceptPath(path)) {
    throw new Error(`Invalid KB concept path: ${path}`);
  }
  return `${path.split('/')[0]}/index.md`;
};

const stringMetadata = (data: Record<string, unknown>, key: string): string => {
  const value = data[key];
  if (typeof value !== 'string') {
    throw new Error(`OKF metadata field is required: ${key}`);
  }
  return value;
};

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/knowledge-base.ts <capture|concept-index|import-plan|reconcile|related|render-index|search|search-batch|validate> <arguments>; import-plan takes one plan path plus an optional --remove-source that moves the source plan to ~/.Trash/ after a successful import; search-batch takes one KB root, one repo-search index, and 1-4 unique queries.';

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

export const validateOkfMetadata = (metadata: OkfMetadata): void => {
  for (const field of requiredFields) {
    const value = metadata[field];
    if (
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      throw new Error(`OKF metadata field is required: ${field}`);
    }
  }
};

export const parseOkfConcept = (content: string): OkfMetadata => {
  const parsed = matter(content);
  if (!matter.test(content) || content.indexOf('\n---', 4) < 0) {
    throw new Error('OKF concept frontmatter is required.');
  }
  const tagsValue = parsed.data.tags;
  if (
    !Array.isArray(tagsValue) ||
    tagsValue.some((tag) => typeof tag !== 'string')
  ) {
    throw new Error('OKF metadata field is required: tags');
  }
  const metadata: OkfMetadata = {
    ...parsed.data,
    description: stringMetadata(parsed.data, 'description'),
    tags: tagsValue as readonly string[],
    title: stringMetadata(parsed.data, 'title'),
    type: stringMetadata(parsed.data, 'type'),
  };
  validateOkfMetadata(metadata);
  return metadata;
};

export const renderOkfConcept = (
  metadata: OkfMetadata,
  body: string,
): string => {
  validateOkfMetadata(metadata);
  if (!body.trim()) {
    throw new Error('OKF concept body is required.');
  }
  return matter.stringify(body.trim(), metadata);
};

export const renderCapturedConcept = (
  metadata: OkfMetadata,
  evidence: string,
  body: string,
): string => {
  if (!evidence.trim()) {
    throw new Error('KB capture evidence is required.');
  }
  return renderOkfConcept(
    metadata,
    `${body.trim()}\n\n## Evidence\n\n${evidence.trim()}`,
  );
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
  const [existingSubjectIndex, existingScopeIndex, existingRootIndex] =
    await Promise.all([
      readOptionalText(fileSystem, subjectIndexFilePath),
      readOptionalText(fileSystem, scopeIndexFilePath),
      readOptionalText(fileSystem, rootIndexFilePath),
    ]);
  await Promise.all([
    writeText(
      fileSystem,
      conceptFilePath,
      renderCapturedConcept(metadata, evidence, body),
    ),
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
      mergedDirectoryIndex(
        existingRootIndex,
        'Knowledge Base',
        `${scope}/index.md`,
      ),
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
    throw new Error(
      `KB plan import produced an invalid concept path: ${conceptPath}`,
    );
  }
  const description = document.objective
    .split(/\r?\n/u)[0]
    .trim()
    .slice(0, 240);
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
    importBody(document),
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

const runReadCommand = async (
  args: readonly string[],
  search: typeof searchKnowledgeBase,
  discover: typeof searchKnowledgeBaseWithFallback,
  batchSearch: typeof searchKnowledgeBaseBatch,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, value, ...rest] = args;
  if (command === 'validate' && value && args.length === 2) {
    parseOkfConcept(await readText(nodeFileSystem, value));
    write('okf: passed');
    return true;
  }
  if (command === 'render-index' && value && args.length >= 2) {
    write(renderDirectoryIndex(value, rest));
    return true;
  }
  if (command === 'search' || command === 'related') {
    return runSearchCommand(args, search, discover, write);
  }
  return runBatchSearchCommand(args, batchSearch, write);
};

export const searchKnowledgeBase = async (
  fileSystem: FileSystem,
  kbRoot: string,
  query: string,
): Promise<readonly KnowledgeSearchResult[]> => {
  if (!kbRoot.startsWith('/')) {
    throw new Error('KB root must be an absolute path.');
  }
  const needle = query.trim().toLowerCase();
  if (!needle) {
    throw new Error('KB search query is required.');
  }
  const results: KnowledgeSearchResult[] = [];
  const resultForEntry = async (
    directory: string,
    entry: DirectoryEntry,
  ): Promise<KnowledgeSearchResult | undefined> => {
    if (entry.name === 'index.md' || !entry.name.endsWith('.md')) {
      return undefined;
    }
    const path = `${directory}/${entry.name}`;
    const content = await readText(fileSystem, path);
    const metadata = parseOkfConcept(content);
    const searchable = `${path}\n${metadata.title}\n${metadata.description}\n${content}`;
    if (!searchable.toLowerCase().includes(needle)) {
      return undefined;
    }
    return {
      description: metadata.description,
      path: path.slice(kbRoot.replace(/\/$/u, '').length + 1),
      title: metadata.title,
      type: metadata.type,
    };
  };
  const walk = async (directory: string): Promise<void> => {
    const entries = await optionalDirectory(fileSystem, directory);
    for (const entry of [...entries].sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
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
  await walk(kbRoot.replace(/\/$/u, ''));
  return results;
};

export const searchKnowledgeBaseWithFallback = async (
  fileSystem: FileSystem,
  executor: CommandExecutor,
  kbRoot: string,
  repoSearchIndex: string,
  query: string,
): Promise<KnowledgeBaseSearchReceipt> => {
  const [concepts, discovery, kbInfo] = await Promise.all([
    searchKnowledgeBase(fileSystem, kbRoot, query),
    searchWithRepoSearchFallback(executor, {
      allowedRoots: [kbRoot],
      query,
      root: { index: repoSearchIndex, root: kbRoot },
    }),
    buildKbInfo(fileSystem, kbRoot),
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
  repoSearchIndex: string,
  queries: readonly string[],
): Promise<readonly KnowledgeBaseBatchSearchResult[]> => {
  if (queries.length === 0 || queries.length > maxKnowledgeBaseBatchSize) {
    throw new Error(
      `KB search-batch requires 1-${maxKnowledgeBaseBatchSize} queries.`,
    );
  }
  const normalized = queries.map((query) =>
    query.trim().toLocaleLowerCase('en-US'),
  );
  if (normalized.some((query) => !query)) {
    throw new Error('KB search-batch queries must be nonblank.');
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(
      'KB search-batch queries must be unique after normalization.',
    );
  }
  const tasks: BatchTask<KnowledgeBaseSearchReceipt>[] = queries.map(
    (query, index) => ({
      id: `query-${index}`,
      mode: 'read-only',
      run: () =>
        searchKnowledgeBaseWithFallback(
          fileSystem,
          executor,
          kbRoot,
          repoSearchIndex,
          query,
        ),
    }),
  );
  const receipts = await runBatched(tasks);
  const receiptById = new Map(
    receipts.map((result) => [result.id, result.value]),
  );
  return queries.map((query, index) => ({
    query,
    receipt: receiptById.get(`query-${index}`) as KnowledgeBaseSearchReceipt,
  }));
};

const validateReconciliationHeader = (plan: ReconciliationPlan): void => {
  if (!isKbConceptPath(plan.canonicalPath)) {
    throw new Error(`Invalid KB concept path: ${plan.canonicalPath}`);
  }
  if (plan.operations.length === 0) {
    throw new Error('KB reconciliation requires at least one operation.');
  }
  if (
    plan.operations.filter(
      (operation) => operation.relativePath === plan.canonicalPath,
    ).length !== 1
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
    const source = plan.operations.find(
      (operation) => operation.relativePath === link.from,
    );
    if (!source?.body.includes(linkTarget(link.from, link.to))) {
      throw new Error(
        `KB reconciliation is missing declared link: ${link.from} -> ${link.to}`,
      );
    }
  }
};

const validateReconciliationOperation = async (
  fileSystem: FileSystem,
  kbRoot: string,
  operation: ReconciliationOperation,
  paths: Set<string>,
): Promise<void> => {
  if (
    !isKbConceptPath(operation.relativePath) ||
    paths.has(operation.relativePath)
  ) {
    throw new Error(
      `KB reconciliation has an invalid or duplicate path: ${operation.relativePath}`,
    );
  }
  paths.add(operation.relativePath);
  validateOkfMetadata(operation.metadata);
  if (!operation.body.trim() || !operation.evidence.trim()) {
    throw new Error(
      `KB reconciliation requires body and evidence: ${operation.relativePath}`,
    );
  }
  const existing = await readOptionalText(
    fileSystem,
    `${kbRoot.replace(/\/$/u, '')}/${operation.relativePath}`,
  );
  if (operation.disposition === 'new-primary' && existing) {
    throw new Error(
      `KB reconciliation new-primary already exists: ${operation.relativePath}`,
    );
  }
  if (operation.disposition !== 'new-primary' && !existing) {
    throw new Error(
      `KB reconciliation requires an existing concept: ${operation.relativePath}`,
    );
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
const defaultDiscoverDependency: DiscoverDependency =
  searchKnowledgeBaseWithFallback;
const defaultReconcileDependency: ReconcileDependency = reconcileConcepts;
const defaultBatchSearchDependency: BatchSearchDependency =
  searchKnowledgeBaseBatch;
const defaultImportDependency: ImportDependency = importPlan;

export const run = async (
  args: readonly string[],
  write: (message: string) => void = console.log,
  captureFn: CaptureDependency = defaultCaptureDependency,
  searchFn: SearchDependency = defaultSearchDependency,
  discoverFn: DiscoverDependency = defaultDiscoverDependency,
  reconcileFn: ReconcileDependency = defaultReconcileDependency,
  batchSearchFn: BatchSearchDependency = defaultBatchSearchDependency,
  importerFn: ImportDependency = defaultImportDependency,
): Promise<void> => {
  if (await runImportPlan(args, importerFn, write, defaultMoveSourceToTrash)) {
    return;
  }
  if (await runCapture(args, captureFn, write)) {
    return;
  }
  if (await runReconcile(args, reconcileFn, write)) {
    return;
  }
  if (runConceptIndex(args, write)) {
    return;
  }
  if (await runReadCommand(args, searchFn, discoverFn, batchSearchFn, write)) {
    return;
  }
  throw new Error(usage());
};

export const runWhenMain = (
  isMain: boolean,
  args: readonly string[],
  runner: typeof run,
): unknown => runCliWhenMain(isMain, args, runner);

runWhenMainWithHelp(import.meta.main, Bun.argv.slice(2), usage, run);
