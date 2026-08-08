import { expect, test } from 'bun:test';

import {
  captureConcept,
  conceptIndexPath,
  importPlan,
  isKbConceptPath,
  parseOkfConcept,
  parsePlanForImport,
  reconcileConcepts,
  renderCapturedConcept,
  renderDirectoryIndex,
  renderLessonBody,
  renderOkfConcept,
  scopeIndexPath,
  searchKnowledgeBase,
  searchKnowledgeBaseBatch,
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
    '[T](lesson.md) - d',
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

test('slices a six-section plan into one validated OKF concept and updates indexes', async () => {
  const files = new Map<string, string>();
  const planPath =
    '/workspace/example-app/.agents/plans/workspace-example-app/execute-plan.md';
  const plan = [
    '---',
    'title: Execute the parser refactor',
    'cbm_index: workspace-example-app',
    'created_at: 2026-08-07',
    'updated_at: 2026-08-07',
    'status: pending',
    '---',
    '',
    '# ROLE',
    'Principal developer.',
    '',
    '# OBJECTIVE',
    'Deliver the parser refactor.',
    '',
    '# CORE DIRECTIVES',
    '- Preserve the public contract.',
    '- Stop on ambiguity.',
    '',
    '# EXECUTION STEPS',
    '1. Inspect the parser and record every direct consumer before editing.',
    '',
    '# CONSTRAINTS',
    '- Do not edit protected configuration.',
    '',
    '# INPUTS TO PROCESS',
    '- The approved implementation plan.',
    '',
  ].join('\n');
  files.set(planPath, plan);
  const fileSystem = {
    mkdir: async () => undefined,
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return value;
    },
    rm: async () => undefined,
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
    },
  };
  expect(parsePlanForImport(plan).sections).toHaveProperty('EXECUTION STEPS');
  const receipt = await importPlan(fileSystem, '/kb', planPath);
  expect(receipt).toMatchObject({
    cbmIndex: 'workspace-example-app',
    conceptPath: 'workspace-example-app/plans/execute-the-parser-refactor.md',
    planPath,
    sections: [
      'ROLE',
      'OBJECTIVE',
      'CORE DIRECTIVES',
      'EXECUTION STEPS',
      'CONSTRAINTS',
      'INPUTS TO PROCESS',
    ],
  });
  expect(
    files.get('/kb/workspace-example-app/plans/execute-the-parser-refactor.md'),
  ).toContain('## INPUTS TO PROCESS');
  expect(files.get('/kb/workspace-example-app/plans/index.md')).toContain(
    '[Execute the parser refactor](execute-the-parser-refactor.md)',
  );
  expect(() =>
    parsePlanForImport(plan.replace('# CONSTRAINTS', '# BROKEN')),
  ).toThrow('six sections');
  expect(() => parsePlanForImport('no frontmatter')).toThrow('frontmatter');
  expect(() =>
    parsePlanForImport(
      plan.replace('status: pending', 'extra: true\nstatus: pending'),
    ),
  ).toThrow('unsupported');
  expect(() =>
    parsePlanForImport(
      plan.replace('title: Execute the parser refactor', 'title:'),
    ),
  ).toThrow('title');
  expect(() =>
    parsePlanForImport(plan.replace('Principal developer.', '')),
  ).toThrow('ROLE');
  files.set(
    planPath,
    plan.replace('title: Execute the parser refactor', 'title: "!!!"'),
  );
  await expect(importPlan(fileSystem, '/kb', planPath)).rejects.toThrow(
    'letters or numbers',
  );
  files.set(
    planPath,
    plan.replace('cbm_index: workspace-example-app', 'cbm_index: ../bad'),
  );
  await expect(importPlan(fileSystem, '/kb', planPath)).rejects.toThrow(
    'invalid concept path',
  );
  await expect(importPlan(fileSystem, 'relative', planPath)).rejects.toThrow(
    'absolute',
  );
  await expect(
    importPlan(fileSystem, '/kb', '/workspace/example-app/plan.md'),
  ).rejects.toThrow('.agents/plans');
});

test('preserves description-suffixed index entries across subsequent captures', async () => {
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
  const firstMetadata = {
    description: 'first concept description',
    tags: ['t'],
    title: 'First',
    type: 'note',
  };
  const secondMetadata = {
    description: 'second concept description',
    tags: ['t'],
    title: 'Second',
    type: 'note',
  };
  await captureConcept(
    fileSystem,
    '/kb',
    'shared/agent/first.md',
    firstMetadata,
    'Body.',
    'Observed evidence.',
  );
  await captureConcept(
    fileSystem,
    '/kb',
    'shared/agent/second.md',
    secondMetadata,
    'Body.',
    'Observed evidence.',
  );
  const subjectIndex = writes.get('/kb/shared/agent/index.md') ?? '';
  expect(subjectIndex).toContain(
    '[First](first.md) - first concept description',
  );
  expect(subjectIndex).toContain(
    '[Second](second.md) - second concept description',
  );
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

test('parses YAML metadata and rejects invalid tag metadata', () => {
  expect(
    parseOkfConcept(
      [
        '---',
        'tags:',
        '  - team',
        '  - rule',
        'type: note',
        'description: Description',
        'title: Title',
        '---',
        '',
        'Body.',
      ].join('\n'),
    ),
  ).toEqual({
    description: 'Description',
    tags: ['team', 'rule'],
    title: 'Title',
    type: 'note',
  });
  expect(() =>
    parseOkfConcept(
      '---\ntags: team\ntype: note\ntitle: T\ndescription: D\n---\n',
    ),
  ).toThrow('tags');
  expect(() =>
    parseOkfConcept(
      '---\ntags: [team]\ntype: note\ntitle: T\ndescription: 1\n---\n',
    ),
  ).toThrow('description');
});

test('preserves optional OKF metadata and reconciles linked concepts', async () => {
  const metadata = {
    description: 'Browser testing constraints.',
    generated: { at: '2026-08-01T00:00:00Z', by: 'process:test' },
    tags: ['testing', 'playwright'],
    title: 'Playwright testing',
    type: 'practice',
  };
  expect(
    parseOkfConcept(renderOkfConcept(metadata, 'Body.')).generated,
  ).toEqual(metadata.generated);
  const files = new Map<string, string>();
  files.set(
    '/kb/shared/testing/strategy.md',
    renderOkfConcept(
      {
        description: 'General strategy.',
        tags: ['testing'],
        title: 'Strategy',
        type: 'practice',
      },
      'Existing rules.',
    ),
  );
  const fileSystem = {
    mkdir: async () => undefined,
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return value;
    },
    rm: async () => undefined,
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
    },
  };
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: 'shared/testing/playwright.md',
      links: [
        {
          from: 'shared/testing/playwright.md',
          to: 'shared/testing/strategy.md',
        },
        {
          from: 'shared/testing/strategy.md',
          to: 'shared/testing/playwright.md',
        },
      ],
      operations: [
        {
          body: 'See [strategy](strategy.md).',
          disposition: 'new-primary',
          evidence: 'Validated.',
          metadata,
          relativePath: 'shared/testing/playwright.md',
        },
        {
          body: 'See [Playwright](playwright.md).',
          disposition: 'update-existing',
          evidence: 'Validated.',
          metadata: {
            description: 'General strategy.',
            tags: ['testing'],
            title: 'Strategy',
            type: 'practice',
          },
          relativePath: 'shared/testing/strategy.md',
        },
      ],
    }),
  ).resolves.toMatchObject({
    concepts: [
      { conceptPath: '/kb/shared/testing/playwright.md' },
      { conceptPath: '/kb/shared/testing/strategy.md' },
    ],
  });
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: 'shared/testing/playwright.md',
      links: [],
      operations: [],
    }),
  ).rejects.toThrow('at least one operation');
});

test('rejects unsafe reconciliation plans', async () => {
  const files = new Map<string, string>();
  const metadata = {
    description: 'General strategy.',
    tags: ['testing'],
    title: 'Strategy',
    type: 'practice',
  };
  files.set(
    '/kb/shared/testing/strategy.md',
    renderOkfConcept(metadata, 'Existing rules.'),
  );
  files.set(
    '/kb/shared/testing/playwright.md',
    renderOkfConcept(metadata, 'Existing rules.'),
  );
  const fileSystem = {
    mkdir: async () => undefined,
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return value;
    },
    rm: async () => undefined,
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
    },
  };
  const update = {
    body: 'Existing body.',
    disposition: 'update-existing' as const,
    evidence: 'Validated.',
    metadata: {
      description: 'General strategy.',
      tags: ['testing'],
      title: 'Strategy',
      type: 'practice',
    },
    relativePath: 'shared/testing/strategy.md',
  };
  await expect(
    reconcileConcepts(fileSystem, 'relative', {
      canonicalPath: update.relativePath,
      links: [],
      operations: [],
    }),
  ).rejects.toThrow('absolute');
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: '../invalid.md',
      links: [],
      operations: [update],
    }),
  ).rejects.toThrow('Invalid KB');
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: 'shared/testing/missing.md',
      links: [],
      operations: [update],
    }),
  ).rejects.toThrow('canonical owner');
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: update.relativePath,
      links: [{ from: update.relativePath, to: 'shared/testing/missing.md' }],
      operations: [update],
    }),
  ).rejects.toThrow('links must connect');
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: update.relativePath,
      links: [{ from: update.relativePath, to: update.relativePath }],
      operations: [update],
    }),
  ).rejects.toThrow('missing declared link');
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: 'shared/testing/playwright.md',
      links: [],
      operations: [
        {
          ...update,
          relativePath: 'shared/testing/playwright.md',
        },
        update,
        update,
      ],
    }),
  ).rejects.toThrow('duplicate path');
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: update.relativePath,
      links: [],
      operations: [{ ...update, body: '' }],
    }),
  ).rejects.toThrow('body and evidence');
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: update.relativePath,
      links: [],
      operations: [{ ...update, disposition: 'new-primary' }],
    }),
  ).rejects.toThrow('new-primary already exists');
  await expect(
    reconcileConcepts(fileSystem, '/kb', {
      canonicalPath: 'shared/testing/absent.md',
      links: [],
      operations: [
        {
          ...update,
          relativePath: 'shared/testing/absent.md',
        },
      ],
    }),
  ).rejects.toThrow('requires an existing concept');
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

test('batches bounded distinct KB queries and rejects duplicates', async () => {
  const fileSystem = {
    mkdir: async () => undefined,
    readdir: async () => [],
    readFile: async () => '',
    rm: async () => undefined,
    writeFile: async () => undefined,
  };
  const executor = async () => ({ code: 0, stderr: '', stdout: 'ready' });
  await expect(
    searchKnowledgeBaseBatch(fileSystem, executor, '/kb', 'kb-index', [
      'verifier',
      'temporary path',
    ]),
  ).resolves.toHaveLength(2);
  await expect(
    searchKnowledgeBaseBatch(fileSystem, executor, '/kb', 'kb-index', [
      'Verifier',
      ' verifier ',
    ]),
  ).rejects.toThrow('unique');
  await expect(
    searchKnowledgeBaseBatch(fileSystem, executor, '/kb', 'kb-index', ['']),
  ).rejects.toThrow('nonblank');
  await expect(
    searchKnowledgeBaseBatch(fileSystem, executor, '/kb', 'kb-index', [
      'a',
      'b',
      'c',
      'd',
      'e',
    ]),
  ).rejects.toThrow('1-4');
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
