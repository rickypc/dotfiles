import matter from 'gray-matter';
import {
  type CbmSearchFallbackReceipt,
  searchWithCbmFallback,
} from './codebase-memory.js';
import type { DirectoryEntry, FileSystem } from './filesystem.js';
import { readText, writeText } from './filesystem.js';
import type { CommandExecutor } from './process.js';
import { type BatchTask, runBatched } from './quality-engine/batch.js';

export interface CapturedConcept {
  readonly conceptPath: string;
  readonly rootIndexPath: string;
  readonly scopeIndexPath: string;
  readonly subjectIndexPath: string;
}

export interface DirectoryIndexEntry {
  readonly description?: string;
  readonly path: string;
  readonly title?: string;
}

export interface KnowledgeBaseBatchSearchResult {
  readonly query: string;
  readonly receipt: KnowledgeBaseSearchReceipt;
}

export interface KnowledgeBaseSearchReceipt {
  readonly concepts: readonly KnowledgeSearchResult[];
  readonly discovery: CbmSearchFallbackReceipt;
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

export const conceptIndexPath = (path: string): string => {
  if (!isKbConceptPath(path)) {
    throw new Error(`Invalid KB concept path: ${path}`);
  }
  const [scope, subject] = path.split('/');
  return `${scope}/${subject}/index.md`;
};

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
  cbmIndex: string,
  query: string,
): Promise<KnowledgeBaseSearchReceipt> => {
  const [concepts, discovery] = await Promise.all([
    searchKnowledgeBase(fileSystem, kbRoot, query),
    searchWithCbmFallback(executor, {
      allowedRoots: [kbRoot],
      query,
      root: { index: cbmIndex, root: kbRoot },
    }),
  ]);
  return {
    concepts,
    discovery,
  };
};

export const searchKnowledgeBaseBatch = async (
  fileSystem: FileSystem,
  executor: CommandExecutor,
  kbRoot: string,
  cbmIndex: string,
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
          cbmIndex,
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
