import { expect, test } from 'bun:test';

import {
  captureConcept,
  conceptIndexPath,
  isKbConceptPath,
  parseOkfConcept,
  renderCapturedConcept,
  renderDirectoryIndex,
  renderLessonBody,
  renderOkfConcept,
  scopeIndexPath,
  searchKnowledgeBase,
  searchKnowledgeBaseWithFallback,
  validateLesson,
  validateOkfMetadata,
} from '../../utils/knowledge-base.js';

test('validates KB concept paths and derives subject indexes', () => {
  expect(isKbConceptPath('shared/team/decision.md')).toBeTrue();
  expect(isKbConceptPath('repo/index.md')).toBeFalse();
  expect(conceptIndexPath('repo/subject/concept.md')).toBe(
    'repo/subject/index.md',
  );
  expect(scopeIndexPath('repo/subject/concept.md')).toBe('repo/index.md');
  expect(() => scopeIndexPath('../secret.md')).toThrow('Invalid KB');
  expect(() => conceptIndexPath('../secret.md')).toThrow('Invalid KB');
});

test('captures a concept and updates both deterministic indexes', async () => {
  const writes = new Map<string, string>();
  const fileSystem = {
    mkdir: async () => undefined,
    readFile: async (path: string) => {
      const value = writes.get(path);
      if (value === undefined) {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
        throw error;
      }
      return value;
    },
    rm: async () => undefined,
    writeFile: async (path: string, content: string) => {
      writes.set(path, content);
    },
  };
  const metadata = {
    description: 'd',
    tags: ['t'],
    title: 'T',
    type: 'note',
  };
  await captureConcept(
    fileSystem,
    '/kb',
    'shared/agent/lesson.md',
    metadata,
    'Body.',
    'Observed evidence.',
  );
  await captureConcept(
    fileSystem,
    '/kb',
    'shared/agent/lesson.md',
    metadata,
    'Body.',
    'Observed evidence.',
  );
  expect(writes.get('/kb/shared/agent/index.md')).toContain(
    '[lesson](lesson.md)',
  );
  expect(writes.get('/kb/shared/index.md')).toContain(
    '[agent/index](agent/index.md)',
  );
  expect(writes.get('/kb/index.md')).toContain(
    '[shared/index](shared/index.md)',
  );
  expect(writes.get('/kb/shared/agent/lesson.md')).toContain(
    'Observed evidence.',
  );
  await expect(
    captureConcept(
      fileSystem,
      'relative',
      'shared/agent/lesson.md',
      metadata,
      'Body.',
      'Evidence.',
    ),
  ).rejects.toThrow('absolute');
  await expect(
    captureConcept(
      fileSystem,
      '/kb',
      '../agent/lesson.md',
      metadata,
      'Body.',
      'Evidence.',
    ),
  ).rejects.toThrow('Invalid KB');
  const failingFileSystem = {
    ...fileSystem,
    readFile: async () => {
      throw new Error('read failure');
    },
  };
  await expect(
    captureConcept(
      failingFileSystem,
      '/kb',
      'shared/agent/other.md',
      metadata,
      'Body.',
      'Evidence.',
    ),
  ).rejects.toThrow('read failure');
});

test('requires every OKF metadata field', () => {
  expect(() =>
    validateOkfMetadata({
      description: 'd',
      tags: ['t'],
      title: 'x',
      type: 'note',
    }),
  ).not.toThrow();
  expect(() =>
    validateOkfMetadata({
      description: '',
      tags: ['t'],
      title: 'x',
      type: 'note',
    }),
  ).toThrow('description');
});

test('renders and parses OKF concepts, indexes, and observed lessons', () => {
  const metadata = {
    description: 'd',
    tags: ['team', 'rule'],
    title: 'T',
    type: 'note',
  };
  const concept = renderOkfConcept(metadata, 'Verified body.');
  expect(parseOkfConcept(concept)).toEqual(metadata);
  expect(() => renderOkfConcept(metadata, '')).toThrow('body');
  expect(() => parseOkfConcept('---\ntype: "note"\n---\n')).toThrow('tags');
  expect(() => parseOkfConcept('no frontmatter')).toThrow('frontmatter');
  expect(renderDirectoryIndex('Subject', ['b.md', 'a.md', 'a.md'])).toContain(
    '[a](a.md)',
  );
  expect(() => renderDirectoryIndex('', [])).toThrow('title');
  const lesson = { cause: 'c', durableFix: 'f', evidence: 'e', symptom: 's' };
  expect(renderLessonBody(lesson)).toContain('Durable fix');
  expect(renderCapturedConcept(metadata, 'Evidence.', 'Body.')).toContain(
    '## Evidence',
  );
  expect(() => renderCapturedConcept(metadata, '', 'Body.')).toThrow(
    'evidence',
  );
  expect(() => validateLesson({ ...lesson, cause: '' })).toThrow('cause');
});

test('searches validated KB concepts and returns an empty result when absent', async () => {
  const concept = renderOkfConcept(
    {
      description: 'Reusable test practice.',
      tags: ['test'],
      title: 'Fixture practice',
      type: 'practice',
    },
    'Always preserve verified evidence.',
  );
  const files = new Map([['/kb/shared/practice/fixture.md', concept]]);
  const entries = new Map([
    ['/kb', [{ isDirectory: () => true, name: 'shared' }]],
    ['/kb/shared', [{ isDirectory: () => true, name: 'practice' }]],
    [
      '/kb/shared/practice',
      [
        { isDirectory: () => false, name: 'fixture.md' },
        { isDirectory: () => false, name: 'index.md' },
        { isDirectory: () => false, name: 'ignored.txt' },
      ],
    ],
  ]);
  const fileSystem = {
    mkdir: async () => undefined,
    readdir: async (path: string) => entries.get(path) ?? [],
    readFile: async (path: string) => files.get(path) ?? '',
    rm: async () => undefined,
    writeFile: async () => undefined,
  };
  await expect(
    searchKnowledgeBase(fileSystem, '/kb', 'verified'),
  ).resolves.toEqual([
    {
      description: 'Reusable test practice.',
      path: 'shared/practice/fixture.md',
      title: 'Fixture practice',
      type: 'practice',
    },
  ]);
  await expect(
    searchKnowledgeBase(fileSystem, '/kb', 'missing'),
  ).resolves.toEqual([]);
  await expect(
    searchKnowledgeBase(fileSystem, 'relative', 'x'),
  ).rejects.toThrow('absolute');
  await expect(searchKnowledgeBase(fileSystem, '/kb', ' ')).rejects.toThrow(
    'query',
  );
  await expect(
    searchKnowledgeBase({ ...fileSystem, readdir: undefined }, '/kb', 'x'),
  ).rejects.toThrow('directory listing');
  const missing = {
    ...fileSystem,
    readdir: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
  };
  await expect(searchKnowledgeBase(missing, '/kb', 'x')).resolves.toEqual([]);
  const failing = {
    ...fileSystem,
    readdir: async () => {
      throw new Error('directory failure');
    },
  };
  await expect(searchKnowledgeBase(failing, '/kb', 'x')).rejects.toThrow(
    'directory failure',
  );
});

test('combines CBM discovery with validated KB search results', async () => {
  const concept = renderOkfConcept(
    {
      description: 'Reusable practice.',
      tags: ['test'],
      title: 'Fixture',
      type: 'practice',
    },
    'Verified evidence.',
  );
  const fileSystem = {
    mkdir: async () => undefined,
    readdir: async (path: string) =>
      path === '/kb'
        ? [{ isDirectory: () => true, name: 'shared' }]
        : path === '/kb/shared'
          ? [{ isDirectory: () => true, name: 'practice' }]
          : [{ isDirectory: () => false, name: 'fixture.md' }],
    readFile: async (path: string) =>
      path.endsWith('fixture.md') ? concept : '',
    rm: async () => undefined,
    writeFile: async () => undefined,
  };
  const outputs = [
    { code: 0, stderr: '', stdout: 'ready' },
    {
      code: 0,
      stderr: '',
      stdout: '{"total":1,"results":[{"name":"verified"}]}',
    },
  ];
  await expect(
    searchKnowledgeBaseWithFallback(
      fileSystem,
      async () => outputs.shift() ?? { code: 1, stderr: '', stdout: '' },
      '/kb',
      'kb-index',
      'verified',
    ),
  ).resolves.toMatchObject({
    concepts: [{ path: 'shared/practice/fixture.md' }],
    discovery: { found: true, source: 'cbm' },
  });
});

test('starts local KB lookup while CBM discovery waits for index readiness', async () => {
  let releaseStatus:
    | ((value: { code: number; stderr: string; stdout: string }) => void)
    | undefined;
  const status = new Promise<{ code: number; stderr: string; stdout: string }>(
    (resolve) => {
      releaseStatus = resolve;
    },
  );
  let localLookupStarted = false;
  const fileSystem = {
    mkdir: async () => undefined,
    readdir: async () => {
      localLookupStarted = true;
      return [];
    },
    readFile: async () => '',
    rm: async () => undefined,
    writeFile: async () => undefined,
  };
  const result = searchKnowledgeBaseWithFallback(
    fileSystem,
    async () => status,
    '/kb',
    'kb-index',
    'verified',
  );
  expect(localLookupStarted).toBeTrue();
  releaseStatus?.({ code: 0, stderr: '', stdout: 'ready' });
  await expect(result).resolves.toMatchObject({ concepts: [] });
});
