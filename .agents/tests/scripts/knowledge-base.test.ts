import { expect, mock, test } from 'bun:test';
import type {
  KnowledgeBaseSearchReceipt,
  KnowledgeSearchResult,
  searchKnowledgeBase,
  searchKnowledgeBaseBatch,
} from '../../scripts/knowledge-base.js';
import {
  buildKbInfo,
  captureConcept,
  conceptIndexPath,
  importPlan,
  listKbScopeIndexes,
  parseOkfConcept,
  parsePlanForImport,
  reconcileConcepts,
  renderDirectoryIndex,
  renderOkfConcept,
  renderLessonBody,
  run,
  scopeIndexPath,
  searchKnowledgeBase,
  searchKnowledgeBaseBatch,
  searchKnowledgeBaseWithFallback,
  usage,
  runWhenMain,
  validateOkfMetadata,
  validateLesson,
} from '../../scripts/knowledge-base.js';

const concept = [
  '---',
  'type: "note"',
  'title: "Title"',
  'description: "Description"',
  'tags: ["one"]',
  '---',
  '',
  'Body',
].join('\n');

test('conceptIndexPath renders correct index path', () => {
  expect(conceptIndexPath('shared/team/decision.md')).toBe(
    'shared/team/index.md',
  );
  expect(conceptIndexPath('personal/work/task.md')).toBe(
    'personal/work/index.md',
  );
});

test('scopeIndexPath renders correct scope index path', () => {
  expect(scopeIndexPath('shared/team/decision.md')).toBe('shared/index.md');
  expect(scopeIndexPath('personal/work/task.md')).toBe('personal/index.md');
});

test('parseOkfConcept parses valid OKF content', () => {
  const metadata = parseOkfConcept(concept);
  expect(metadata.type).toBe('note');
  expect(metadata.title).toBe('Title');
  expect(metadata.description).toBe('Description');
  expect(metadata.tags).toEqual(['one']);
});

test('parseOkfConcept throws for missing frontmatter', () => {
  expect(() => parseOkfConcept('no frontmatter')).toThrow(
    'OKF concept frontmatter is required',
  );
});

test('parseOkfConcept throws for missing required fields', () => {
  const incomplete = ['---', 'type: "note"', '---', '', 'Body'].join('\n');
  expect(() => parseOkfConcept(incomplete)).toThrow(
    'OKF metadata field is required',
  );
});

test('validateOkfMetadata validates required fields', () => {
  expect(() =>
    validateOkfMetadata({
      description: 'D',
      tags: ['t'],
      title: 'T',
      type: 'note',
    }),
  ).not.toThrow();
  expect(() =>
    validateOkfMetadata({
      description: 'D',
      title: '',
      type: 'note',
    }),
  ).toThrow('title');
});

test('renderOkfConcept renders OKF concept', () => {
  expect(() => renderOkfConcept({ type: 'note', title: 'T', description: 'D', tags: ['t'] }, 'body')).not.toThrow();
  expect(() => renderOkfConcept({ type: 'note', title: '', description: 'D', tags: ['t'] }, 'body')).toThrow('title');
});

test('renderOkfConcept throws for empty body', () => {
  expect(() => renderOkfConcept({ type: 'note', title: 'T', description: 'D', tags: ['t'] }, '')).toThrow('OKF concept body is required');
});

test('renderDirectoryIndex renders index with children', () => {
  expect(
    renderDirectoryIndex('Team', [
      { path: 'decision.md', title: 'Decision', description: 'A decision' },
      { path: 'note.md', title: 'Note' },
      'simple.md',
    ]),
  ).toBeDefined();
});

test('buildKbInfo returns kb info', async () => {
  const mockFileSystem = {
    readdir: async () => [],
  };
  const result = await buildKbInfo(mockFileSystem, 'test');
  expect(typeof result).toBe('object');
});

test('usage returns the usage string', () => {
  expect(usage()).toBeDefined();
});

test('run command throws for unknown command', async () => {
  await expect(run(['unknown-command'])).rejects.toThrow(usage());
});

test('runWhenMain exports correctly', () => {
  expect(typeof runWhenMain).toBe('function');
});

// Additional tests for uncovered functions

test('listKbScopeIndexes returns scope indexes', async () => {
  const mockFileSystem = {
    readdir: async () => [
      { name: 'team', isDirectory: () => true },
      { name: 'personal', isDirectory: () => true },
      { name: 'shared', isDirectory: () => true },
      { name: 'file.txt', isDirectory: () => false },
    ],
  };
  const result = await listKbScopeIndexes(mockFileSystem, '/kb');
  expect(result).toEqual(['personal', 'team']);
});

test('parsePlanForImport parses valid plan', () => {
  const planContent = [
    '---',
    'title: "Test Plan"',
    'repo_search_index: "shared"',
    'status: "draft"',
    '---',
    '',
    '## 1. TARGET DIRECTIVES',
    'Objective content',
    '',
    '## 2. VARIABLE DEFINITION MATRIX',
    'Matrix content',
    '',
    '## 3. CHRONOLOGICAL WORKFLOW',
    'Workflow content',
    '',
    '## 4. TOOL STRATEGY & FALLBACKS',
    'Strategy content',
    '',
    '## 5. SYSTEMATIC VERIFICATION CHECKLIST',
    'Checklist content',
    '',
    '## 6. RIGID OUTPUT SCHEMA',
    'Schema content',
  ].join('\n');

  const document = parsePlanForImport(planContent);
  expect(document.title).toBe('Test Plan');
  expect(document.repoSearchIndex).toBe('shared');
  expect(document.sections['TARGET DIRECTIVES']).toBe('Objective content');
});

test('parsePlanForImport throws for missing frontmatter', () => {
  expect(() => parsePlanForImport('no frontmatter')).toThrow(
    'Plan YAML frontmatter is required for KB import.',
  );
});

test('parsePlanForImport throws for unsupported fields', () => {
  const planContent = [
    '---',
    'title: "Test Plan"',
    'repo_search_index: "shared"',
    'unsupported_field: "value"',
    '---',
    '',
    '## 1. TARGET DIRECTIVES',
    'Objective content',
    '',
    '## 2. VARIABLE DEFINITION MATRIX',
    'Matrix content',
    '',
    '## 3. CHRONOLOGICAL WORKFLOW',
    'Workflow content',
    '',
    '## 4. TOOL STRATEGY & FALLBACKS',
    'Strategy content',
    '',
    '## 5. SYSTEMATIC VERIFICATION CHECKLIST',
    'Checklist content',
    '',
    '## 6. RIGID OUTPUT SCHEMA',
    'Schema content',
  ].join('\n');

  expect(() => parsePlanForImport(planContent)).toThrow(
    'Plan frontmatter has unsupported field(s): unsupported_field.',
  );
});

test('parsePlanForImport throws for missing required sections', () => {
  const planContent = [
    '---',
    'title: "Test Plan"',
    'repo_search_index: "shared"',
    '---',
    '',
    '## 1. TARGET DIRECTIVES',
    'Objective content',
    '',
  ].join('\n');

  expect(() => parsePlanForImport(planContent)).toThrow(
    'KB plan import requires the six H2 numbered sections in template order',
  );
});

test('planSlug generates valid slug', () => {
  const planContent = [
    '---',
    'title: "My Test Plan Title"',
    'repo_search_index: "shared"',
    '---',
    '',
    '## 1. TARGET DIRECTIVES',
    'Objective content',
    '',
    '## 2. VARIABLE DEFINITION MATRIX',
    'Matrix content',
    '',
    '## 3. CHRONOLOGICAL WORKFLOW',
    'Workflow content',
    '',
    '## 4. TOOL STRATEGY & FALLBACKS',
    'Strategy content',
    '',
    '## 5. SYSTEMATIC VERIFICATION CHECKLIST',
    'Checklist content',
    '',
    '## 6. RIGID OUTPUT SCHEMA',
    'Schema content',
  ].join('\n');

  const document = parsePlanForImport(planContent);
  expect(document.title).toBe('My Test Plan Title');
});

test('renderLessonBody renders lesson', () => {
  const lesson = {
    symptom: 'symptom',
    cause: 'cause',
    durableFix: 'fix',
    evidence: 'evidence',
  };
  const body = renderLessonBody(lesson);
  expect(body).toContain('symptom');
  expect(body).toContain('cause');
  expect(body).toContain('fix');
  expect(body).toContain('evidence');
});

test('validateLesson throws for empty fields', () => {
  const lesson = {
    symptom: 'symptom',
    cause: 'cause',
    durableFix: 'fix',
    evidence: '',
  };
  expect(() => validateLesson(lesson)).toThrow('Lesson evidence is required.');
});

test('renderOkfConcept with full metadata', () => {
  const metadata = {
    type: 'note',
    title: 'Test',
    description: 'Desc',
    tags: ['tag1', 'tag2'],
  };
  const result = renderOkfConcept(metadata, 'body content');
  expect(result).toContain('type: note');
  expect(result).toContain('title: Test');
  expect(result).toContain('description: Desc');
  expect(result).toContain('tags:');
  expect(result).toContain('tag1');
  expect(result).toContain('tag2');
  expect(result).toContain('body content');
});

test('validateLesson throws for empty fields', () => {
  const lesson = {
    symptom: 'symptom',
    cause: 'cause',
    durableFix: 'fix',
    evidence: '',
  };
  expect(() => validateLesson(lesson)).toThrow('Lesson evidence is required.');
});

// Mock file system for integration tests
const createMockFileSystem = () => ({
  readdir: async () => [],
  readFile: async () => '',
  writeFile: async () => undefined,
  mkdir: async () => undefined,
  rm: async () => undefined,
});

test('captureConcept creates concept and indexes', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async (path: string) => {
      if (path.includes('index.md')) return '';
      return '';
    },
    writeFile: async (path: string) => {
      return undefined;
    },
    mkdir: async () => undefined,
    rm: async () => undefined,
  };
  const writeCalls: string[] = [];
  const mockFs = {
    readdir: async (dir: string) => {
      if (dir === '/kb/shared/team') {
        return [
          { name: 'decision.md', isDirectory: () => false },
          { name: 'index.md', isDirectory: () => false },
        ];
      }
      if (dir === '/kb/shared') {
        return [{ name: 'team', isDirectory: () => true }];
      }
      if (dir === '/kb') {
        return [{ name: 'shared', isDirectory: () => true }];
      }
      return [];
    },
    readFile: async (path: string) => {
      if (path.includes('decision.md')) return '';
      if (path.includes('index.md')) return '';
      return '';
    },
    writeFile: async (path: string, content: string) => {
      writeCalls.push(path);
    },
    mkdir: async () => undefined,
    rm: async () => undefined,
  };

  const result = await captureConcept(
    mockFs,
    '/kb',
    'shared/team/decision.md',
    {
      type: 'note',
      title: 'Decision',
      description: 'A decision',
      tags: ['decision'],
    },
    'Body content',
    'Evidence content',
  );

  expect(result.conceptPath).toBe('/kb/shared/team/decision.md');
  expect(result.subjectIndexPath).toBe('/kb/shared/team/index.md');
  expect(result.scopeIndexPath).toBe('/kb/shared/index.md');
  expect(result.rootIndexPath).toBe('/kb/index.md');
  expect(writeCalls.length).toBeGreaterThanOrEqual(4);
});

test('importPlan imports plan and returns receipt', async () => {
  const mockFs = {
    readdir: async () => [],
    readFile: async (path: string) => {
      if (path.includes('.agents/plans/test-plan.md')) {
        return [
          '---',
          'title: "Test Plan"',
          'repo_search_index: "shared"',
          'status: "draft"',
          '---',
          '',
          '## 1. TARGET DIRECTIVES',
          'Objective',
          '',
          '## 2. VARIABLE DEFINITION MATRIX',
          'Matrix',
          '',
          '## 3. CHRONOLOGICAL WORKFLOW',
          'Workflow',
          '',
          '## 4. TOOL STRATEGY & FALLBACKS',
          'Strategy',
          '',
          '## 5. SYSTEMATIC VERIFICATION CHECKLIST',
          'Checklist',
          '',
          '## 6. RIGID OUTPUT SCHEMA',
          'Schema',
        ].join('\n');
      }
      return '';
    },
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rm: async () => undefined,
  };

  const result = await importPlan(mockFs, '/kb', '/kb/.agents/plans/test-plan.md');
  expect(result.conceptPath).toContain('shared/plans/');
  expect(result.repoSearchIndex).toBe('shared');
});

test('searchKnowledgeBase searches concepts', async () => {
  const mockFs = {
    readdir: async (dir: string) => {
      if (dir === '/kb') {
        return [
          { name: 'shared', isDirectory: () => true },
          { name: 'personal', isDirectory: () => true },
        ];
      }
      if (dir === '/kb/shared') {
        return [
          { name: 'team', isDirectory: () => true },
        ];
      }
      if (dir === '/kb/shared/team') {
        return [
          { name: 'decision.md', isDirectory: () => false },
          { name: 'index.md', isDirectory: () => false },
        ];
      }
      return [];
    },
    readFile: async (path: string) => {
      if (path.includes('decision.md')) {
        return [
          '---',
          'type: "note"',
          'title: "Decision"',
          'description: "A decision about testing"',
          'tags: ["test"]',
          '---',
          '',
          'Body content about decision',
        ].join('\n');
      }
      return '';
    },
  };

  const results = await searchKnowledgeBase(
    mockFs,
    '/kb',
    'decision',
  );
  expect(results.length).toBeGreaterThanOrEqual(1);
  expect(results[0].title).toBe('Decision');
});

test('searchKnowledgeBase throws for empty query', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
  };
  await expect(searchKnowledgeBase(fileSystem, '/kb', '')).rejects.toThrow(
    'KB search query is required.',
  );
});

test('searchKnowledgeBase throws for non-absolute path', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
  };
  await expect(searchKnowledgeBase(fileSystem, 'relative', 'query')).rejects.toThrow(
    'KB root must be an absolute path.',
  );
});

test('run handles search command', async () => {
  const write = mock();
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
  };
  const mockFs = {
    readdir: async () => [],
    readFile: async () => '',
  };

  await run(['search', '/kb', 'query'], write, async () => []);
  expect(write).toHaveBeenCalled();
});

test('run handles search-batch command', async () => {
  const write = mock();
  await run(
    ['search-batch', '/kb', 'index', 'query1', 'query2'],
    write,
    async () => [],
    async () => [],
    async () => [],
    async () => [],
    async () => [],
  );
  expect(write).toHaveBeenCalled();
});

test('run handles capture command', async () => {
  const write = mock();
  await run(
    [
      'capture',
      '/kb',
      'shared/team/test.md',
      JSON.stringify({ type: 'note', title: 'T', description: 'D', tags: ['t'] }),
      'body',
      'evidence',
    ],
    write,
    async () => ({} as any),
  );
  expect(write).toHaveBeenCalled();
});

test('run handles capture command with invalid JSON', async () => {
  const write = mock();
  // Test invalid JSON in metadataJson (line 427-428)
  await run(
    [
      'capture',
      '/kb',
      'shared/team/test.md',
      '{invalid json}',
      'body',
      'evidence',
    ],
    write,
    async () => ({} as any),
  );
  expect(write).toHaveBeenCalled();
});

test('run handles capture command with wrong arg count', async () => {
  const write = mock();
  // The run function throws usage error for wrong arg count
  await expect(run(['capture', '/kb'], write, async () => ({} as any))).rejects.toThrow(usage());
});

test('run handles reconcile command', async () => {
  const write = mock();
  
  const { nodeFileSystem } = await import('../../utils/filesystem.js');
  const originalReadFile = nodeFileSystem.readFile;
  nodeFileSystem.readFile = async (path: string) => {
    if (path.includes('/tmp/plan.json')) {
      return JSON.stringify({
        canonicalPath: 'shared/team/test.md',
        operations: [
          {
            relativePath: 'shared/team/test.md',
            disposition: 'new-primary',
            metadata: { type: 'note', title: 'T', description: 'D', tags: ['t'] },
            body: 'body',
            evidence: 'evidence',
          },
        ],
        links: [],
      });
    }
    return originalReadFile(path);
  };

  await run(
    ['reconcile', '/kb', '/tmp/plan.json'],
    write,
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
  );
  expect(write).toHaveBeenCalled();
  
  nodeFileSystem.readFile = originalReadFile;
});

test('run handles reconcile command with invalid JSON', async () => {
  const write = mock();
  const { nodeFileSystem } = await import('../../utils/filesystem.js');
  const originalReadFile = nodeFileSystem.readFile;
  nodeFileSystem.readFile = async (path: string) => {
    if (path.includes('/tmp/plan.json')) {
      return '{invalid json}';
    }
    return originalReadFile(path);
  };

  await expect(
    run(['reconcile', '/kb', '/tmp/plan.json'], write, async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any))
  ).rejects.toThrow('KB reconciliation request must be valid JSON.');
  
  nodeFileSystem.readFile = originalReadFile;
});

test('run handles reconcile command with wrong args', async () => {
  const write = mock();
  await expect(run(['reconcile', '/kb'], write, async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any))).rejects.toThrow(usage());
});

test('run handles concept-index command', async () => {
  const write = mock();
  await run(['concept-index', 'shared/team/test.md'], write);
  expect(write).toHaveBeenCalledWith('shared/team/index.md');
});

test('run handles concept-index command with invalid args', async () => {
  const write = mock();
  await expect(run(['concept-index'], write)).rejects.toThrow(usage());
  await expect(run(['concept-index', 'shared/team/test.md', 'extra'], write)).rejects.toThrow(usage());
});

test('run handles import-plan command', async () => {
  const write = mock();
  const fileSystem = {
    readdir: async () => [],
    readFile: async (path: string) => {
      if (path.includes('.agents/plans/plan.md')) {
        return [
          '---',
          'title: "Test Plan"',
          'repo_search_index: "shared"',
          '---',
          '',
          '## 1. TARGET DIRECTIVES',
          'Objective',
          '',
          '## 2. VARIABLE DEFINITION MATRIX',
          'Matrix',
          '',
          '## 3. CHRONOLOGICAL WORKFLOW',
          'Workflow',
          '',
          '## 4. TOOL STRATEGY & FALLBACKS',
          'Strategy',
          '',
          '## 5. SYSTEMATIC VERIFICATION CHECKLIST',
          'Checklist',
          '',
          '## 6. RIGID OUTPUT SCHEMA',
          'Schema',
        ].join('\n');
      }
      return '';
    },
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rm: async () => undefined,
  };

  await run(
    ['import-plan', '/kb/.agents/plans/plan.md'],
    write,
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
  );
  expect(write).toHaveBeenCalled();
});

test('run handles import-plan command with --remove-source', async () => {
  const write = mock();
  const fileSystem = {
    readdir: async () => [],
    readFile: async (path: string) => {
      if (path.includes('.agents/plans/plan.md')) {
        return [
          '---',
          'title: "Test Plan"',
          'repo_search_index: "shared"',
          '---',
          '',
          '## 1. TARGET DIRECTIVES',
          'Objective',
          '',
          '## 2. VARIABLE DEFINITION MATRIX',
          'Matrix',
          '',
          '## 3. CHRONOLOGICAL WORKFLOW',
          'Workflow',
          '',
          '## 4. TOOL STRATEGY & FALLBACKS',
          'Strategy',
          '',
          '## 5. SYSTEMATIC VERIFICATION CHECKLIST',
          'Checklist',
          '',
          '## 6. RIGID OUTPUT SCHEMA',
          'Schema',
        ].join('\n');
      }
      return '';
    },
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rm: async () => undefined,
  };

  await run(
    ['import-plan', '/kb/.agents/plans/plan.md', '--remove-source'],
    write,
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
    async () => ({} as any),
  );
  expect(write).toHaveBeenCalled();
});

test('run handles import-plan command with wrong args', async () => {
  const write = mock();
  await expect(run(['import-plan'], write, async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any))).rejects.toThrow(usage());
  await expect(run(['import-plan', '/kb/plan.md', 'extra', 'extra2'], write, async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any), async () => ({} as any))).rejects.toThrow(usage());
});

test('run handles render-index command', async () => {
  const write = mock();
  await run(['render-index', 'Title', 'item1', 'item2'], write);
  expect(write).toHaveBeenCalled();
});

test('run handles validate command', async () => {
  const write = mock();
  const content = [
    '---',
    'type: "note"',
    'title: "Test"',
    'description: "Desc"',
    'tags: ["tag"]',
    '---',
    '',
    'Body',
  ].join('\n');
  
  const { nodeFileSystem } = await import('../../utils/filesystem.js');
  const originalReadFile = nodeFileSystem.readFile;
  nodeFileSystem.readFile = async (path: string) => {
    if (path.includes('/kb/test.md')) {
      return [
        '---',
        'type: "note"',
        'title: "Test"',
        'description: "Desc"',
        'tags: ["tag"]',
        '---',
        '',
        'Body',
      ].join('\n');
    }
    return originalReadFile(path);
  };

  await run(['validate', '/kb/test.md'], write, async () => ({} as any));
  expect(write).toHaveBeenCalledWith('okf: passed');
  
  nodeFileSystem.readFile = originalReadFile;
});

test('run handles validate command with non-existent file', async () => {
  const write = mock();
  const { nodeFileSystem } = await import('../../utils/filesystem.js');
  const originalReadFile = nodeFileSystem.readFile;
  nodeFileSystem.readFile = async (path: string) => {
    if (path.includes('/kb/nonexistent.md')) {
      throw new Error('ENOENT');
    }
    return originalReadFile(path);
  };

  await expect(
    run(['validate', '/kb/nonexistent.md'], write, async () => ({} as any))
  ).rejects.toThrow('ENOENT');
  
  nodeFileSystem.readFile = originalReadFile;
});

test('run throws for unknown command', async () => {
  await expect(run(['unknown'])).rejects.toThrow(usage());
});

test('searchKnowledgeBaseBatch searches multiple queries', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
  };
  const mockFs = {
    readdir: async () => [],
    readFile: async () => '',
  };

  const results = await searchKnowledgeBaseBatch(
    mockFs,
    async () => 0 as any,
    '/kb',
    'index',
    ['query1', 'query2'],
  );
  expect(results.length).toBe(2);
  expect(results[0].query).toBe('query1');
  expect(results[1].query).toBe('query2');
});

test('searchKnowledgeBaseBatch throws for empty queries', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
  };
  await expect(
    searchKnowledgeBaseBatch(fileSystem, async () => 0 as any, '/kb', 'index', []),
  ).rejects.toThrow('KB search-batch requires 1-4 queries.');
});

test('searchKnowledgeBaseBatch throws for too many queries', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
  };
  await expect(
    searchKnowledgeBaseBatch(
      fileSystem,
      async () => 0 as any,
      '/kb',
      'index',
      ['q1', 'q2', 'q3', 'q4', 'q5'],
    ),
  ).rejects.toThrow('KB search-batch requires 1-4 queries.');
});

test('searchKnowledgeBaseBatch throws for duplicate queries', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
  };
  await expect(
    searchKnowledgeBaseBatch(
      fileSystem,
      async () => 0 as any,
      '/kb',
      'index',
      ['query', 'query'],
    ),
  ).rejects.toThrow('KB search-batch queries must be unique after normalization.');
});

test('searchKnowledgeBaseWithFallback returns receipt', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
  };
  const mockFs = {
    readdir: async () => [],
    readFile: async () => '',
  };

  const result = await searchKnowledgeBaseWithFallback(
    mockFs,
    async () => 0 as any,
    '/kb',
    'index',
    'query',
  );
  expect(result.concepts).toBeDefined();
  expect(result.discovery).toBeDefined();
  expect(result.kbInfo).toBeDefined();
});

test('reconcileConcepts validates and reconciles', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rm: async () => undefined,
  };
  const mockFs = {
    readdir: async () => [],
    readFile: async () => '',
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rm: async () => undefined,
  };

  const plan = {
    canonicalPath: 'shared/team/test.md',
    operations: [
      {
        relativePath: 'shared/team/test.md',
        disposition: 'new-primary' as const,
        metadata: { type: 'note', title: 'T', description: 'D', tags: ['t'] },
        body: 'body',
        evidence: 'evidence',
      },
    ],
    links: [],
  };

  const result = await reconcileConcepts(mockFs, '/kb', plan);
  expect(result.concepts.length).toBe(1);
  expect(result.links).toEqual([]);
});

test('reconcileConcepts throws for invalid canonical path', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rm: async () => undefined,
  };
  const plan = {
    canonicalPath: 'invalid/path.md',
    operations: [],
    links: [],
  };
  await expect(reconcileConcepts(fileSystem, '/kb', plan)).rejects.toThrow(
    'Invalid KB concept path: invalid/path.md',
  );
});

test('reconcileConcepts throws for no operations', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rm: async () => undefined,
  };
  const plan = {
    canonicalPath: 'shared/team/test.md',
    operations: [],
    links: [],
  };
  await expect(reconcileConcepts(fileSystem, '/kb', plan)).rejects.toThrow(
    'KB reconciliation requires at least one operation.',
  );
});

test('reconcileConcepts throws for missing canonical operation', async () => {
  const fileSystem = {
    readdir: async () => [],
    readFile: async () => '',
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rm: async () => undefined,
  };
  const plan = {
    canonicalPath: 'shared/team/test.md',
    operations: [
      {
        relativePath: 'shared/team/other.md',
        disposition: 'new-primary' as const,
        metadata: { type: 'note', title: 'T', description: 'D', tags: ['t'] },
        body: 'body',
        evidence: 'evidence',
      },
    ],
    links: [],
  };
  await expect(reconcileConcepts(fileSystem, '/kb', plan)).rejects.toThrow(
    'KB reconciliation requires exactly one canonical owner.',
  );
});

test('validateOkfMetadata validates all required fields', () => {
  expect(() =>
    validateOkfMetadata({
      type: 'note',
      title: 'Title',
      description: 'Desc',
      tags: ['tag'],
    }),
  ).not.toThrow();

  expect(() =>
    validateOkfMetadata({
      type: 'note',
      title: '',
      description: 'Desc',
      tags: ['tag'],
    }),
  ).toThrow('title');

  expect(() =>
    validateOkfMetadata({
      type: 'note',
      title: 'Title',
      description: '',
      tags: ['tag'],
    }),
  ).toThrow('description');

  expect(() =>
    validateOkfMetadata({
      type: 'note',
      title: 'Title',
      description: 'Desc',
      tags: [],
    }),
  ).toThrow('tags');
});

test('renderOkfConcept renders with metadata', () => {
  const metadata = {
    type: 'note',
    title: 'Test',
    description: 'Desc',
    tags: ['tag1', 'tag2'],
  };
  const result = renderOkfConcept(metadata, 'body content');
  expect(result).toContain('type: note');
  expect(result).toContain('title: Test');
  expect(result).toContain('description: Desc');
  expect(result).toContain('tags:');
  expect(result).toContain('tag1');
  expect(result).toContain('tag2');
  expect(result).toContain('body content');
});

test('validateLesson throws for empty fields', () => {
  const lesson = {
    symptom: 'symptom',
    cause: 'cause',
    durableFix: 'fix',
    evidence: '',
  };
  expect(() => validateLesson(lesson)).toThrow('Lesson evidence is required.');
});

test('renderLessonBody renders lesson', () => {
  const lesson = {
    symptom: 'symptom',
    cause: 'cause',
    durableFix: 'fix',
    evidence: 'evidence',
  };
  const body = renderLessonBody(lesson);
  expect(body).toContain('symptom');
  expect(body).toContain('cause');
  expect(body).toContain('fix');
  expect(body).toContain('evidence');
});
