import {
  type CbmSearchFallbackReceipt,
  searchWithCbmFallback,
} from './codebase-memory.js';
import type { DirectoryEntry, FileSystem } from './filesystem.js';
import { readText, writeText } from './filesystem.js';
import type { CommandExecutor } from './process.js';

export interface CapturedConcept {
  readonly conceptPath: string;
  readonly rootIndexPath: string;
  readonly scopeIndexPath: string;
  readonly subjectIndexPath: string;
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
}

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

const indexChildren = (content: string): readonly string[] =>
  [...content.matchAll(/^- \[[^\]]+\]\(([^)]+)\)$/gmu)].map(
    (match) => match[1],
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

export const renderDirectoryIndex = (
  title: string,
  children: readonly string[],
): string => {
  if (!title.trim()) {
    throw new Error('KB index title is required.');
  }
  const links = [...new Set(children)]
    .sort()
    .map((child) => `- [${child.replace(/\.md$/u, '')}](${child})`);
  return [`# ${title.trim()}`, '', ...links, ''].join('\n');
};

const mergedDirectoryIndex = (
  existing: string | undefined,
  title: string,
  child: string,
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

const valueFor = (frontmatter: string, key: string): string => {
  const match = new RegExp(`^${key}: (.+)$`, 'mu').exec(frontmatter);
  if (!match) {
    throw new Error(`OKF metadata field is required: ${key}`);
  }
  return match[1];
};

export const parseOkfConcept = (content: string): OkfMetadata => {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(content);
  if (!match) {
    throw new Error('OKF concept frontmatter is required.');
  }
  const frontmatter = match[1];
  const tagsValue = valueFor(frontmatter, 'tags');
  const tags = tagsValue
    .replace(/^\[/u, '')
    .replace(/\]$/u, '')
    .split(',')
    .map((tag) => tag.trim().replaceAll(/^"|"$/gu, ''))
    .filter(Boolean);
  const metadata = {
    description: JSON.parse(valueFor(frontmatter, 'description')) as string,
    tags,
    title: JSON.parse(valueFor(frontmatter, 'title')) as string,
    type: JSON.parse(valueFor(frontmatter, 'type')) as string,
  };
  validateOkfMetadata(metadata);
  return metadata;
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
  if (!needle) throw new Error('KB search query is required.');
  const results: KnowledgeSearchResult[] = [];
  const resultForEntry = async (
    directory: string,
    entry: DirectoryEntry,
  ): Promise<KnowledgeSearchResult | undefined> => {
    if (entry.name === 'index.md' || !entry.name.endsWith('.md'))
      return undefined;
    const path = `${directory}/${entry.name}`;
    const content = await readText(fileSystem, path);
    const metadata = parseOkfConcept(content);
    const searchable = `${path}\n${metadata.title}\n${metadata.description}\n${content}`;
    if (!searchable.toLowerCase().includes(needle)) return undefined;
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
      if (result) results.push(result);
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

const yamlString = (value: string): string => JSON.stringify(value);

export const renderOkfConcept = (
  metadata: OkfMetadata,
  body: string,
): string => {
  validateOkfMetadata(metadata);
  if (!body.trim()) {
    throw new Error('OKF concept body is required.');
  }
  return [
    '---',
    `type: ${yamlString(metadata.type)}`,
    `title: ${yamlString(metadata.title)}`,
    `description: ${yamlString(metadata.description)}`,
    `tags: [${metadata.tags.map(yamlString).join(', ')}]`,
    '---',
    '',
    body.trim(),
    '',
  ].join('\n');
};

export const renderCapturedConcept = (
  metadata: OkfMetadata,
  evidence: string,
  body: string,
): string => {
  if (!evidence.trim()) throw new Error('KB capture evidence is required.');
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
      mergedDirectoryIndex(existingSubjectIndex, subject, concept),
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
