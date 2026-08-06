import { expect, mock, test } from 'bun:test';
import * as path from 'node:path';
import realMatter from 'gray-matter';

interface AllSkillsFixtureOptions {
  readonly evalFiles?: readonly string[];
  readonly matrix?: string;
  readonly rubric?: string | null;
  readonly skills?: readonly string[];
  readonly source?: string;
}

mock.module('node:path', () => path);
mock.module('gray-matter', () => ({ default: realMatter }));

const {
  createSkillManagerPacket,
  evaluateSkillManagerBatch,
  evaluateSkillMatrix,
  ignoredByAgentsGitignore,
  initializeSkill,
  localMarkdownLinkTargets,
  parseMatrixJsonl,
  parseSkillRubric,
  reviewSkillProse,
  validateAllSkills,
  validateSkill,
} = await import('../../utils/skill-manager.js');

const validRubric = [
  '---',
  'schemaVersion: 1',
  'requiredCaseFields: [id, visibility, scenario, assertions, failureMode, repairBoundary, independentVerifier]',
  'requiredVisibility: [candidate, challenge]',
  'minimumPassRate: 1',
  'verifierIds: [source-structure]',
  '---',
  '',
  '# Rubric',
].join('\n');

test('creates a matrix-definition packet from the draft state', () => {
  const packet = createSkillManagerPacket({
    failedAssertionIds: [],
    reviewId: 'improve-skill',
    state: 'draft',
    targetSkillPath: '/skills/example',
  });
  expect(packet.nextPhase).toBe('baseline');
  expect(packet.requiredActionGroups[0]?.requiredAssertionIds).toEqual([
    'matrix-definition',
  ]);
});

test('requires failed assertions and rejects a state without an action', () => {
  expect(() =>
    createSkillManagerPacket({
      failedAssertionIds: [],
      reviewId: 'improve-skill',
      state: 'candidate_requested',
      targetSkillPath: '/skills/example',
    }),
  ).toThrow('At least one failed assertion');
  expect(() =>
    createSkillManagerPacket({
      failedAssertionIds: ['case-a'],
      reviewId: 'improve-skill',
      state: 'accepted',
      targetSkillPath: '/skills/example',
    }),
  ).toThrow('No Skill Manager action packet');
});

test.each(['candidate_requested', 'candidate_checked'] as const)(
  'creates an evaluation packet for %s',
  (state) => {
    const packet = createSkillManagerPacket({
      failedAssertionIds: ['scope'],
      reviewId: 'improve-skill',
      state,
      targetSkillPath: '/skills/example',
    });
    expect(packet.nextPhase).toBe('evaluate');
    expect(packet.requiredActionGroups[0]?.title).toContain('Repair');
  },
);

test('parses and evaluates a frozen candidate and challenge matrix', () => {
  const matrix = parseMatrixJsonl(
    [
      JSON.stringify({
        assertions: [{ expected: 'required', kind: 'required-text' }],
        failureMode: 'missing',
        id: 'candidate',
        independentVerifier: 'source-structure',
        repairBoundary: '/skill',
        scenario: 'content',
        visibility: 'candidate',
      }),
      JSON.stringify({
        assertions: [{ expected: 'secret', kind: 'forbidden-text' }],
        failureMode: 'leak',
        id: 'challenge',
        independentVerifier: 'source-structure',
        repairBoundary: '/skill',
        scenario: 'safety',
        visibility: 'challenge',
      }),
    ].join('\n'),
  );
  expect(
    evaluateSkillMatrix(
      matrix,
      { delegatedChecks: {}, ownedFiles: new Set(), text: 'required' },
      'f',
      'candidate_checked',
    ).checks[0]?.status,
  ).toBe('passed');
  expect(
    evaluateSkillMatrix(
      matrix,
      { delegatedChecks: {}, ownedFiles: new Set(), text: 'safe' },
      'f',
      'challenge_checked',
    ).checks[0]?.status,
  ).toBe('passed');
  expect(() => parseMatrixJsonl('{')).toThrow('line 1');
});

test('batches independent candidates and challenges only after every candidate passes', () => {
  const matrix = parseMatrixJsonl(
    [
      JSON.stringify({
        assertions: [{ expected: 'required', kind: 'required-text' }],
        failureMode: 'missing',
        id: 'candidate',
        independentVerifier: 'source-structure',
        repairBoundary: '/skill',
        scenario: 'content',
        visibility: 'candidate',
      }),
      JSON.stringify({
        assertions: [{ expected: 'forbidden', kind: 'forbidden-text' }],
        failureMode: 'leak',
        id: 'challenge',
        independentVerifier: 'source-structure',
        repairBoundary: '/skill',
        scenario: 'safety',
        visibility: 'challenge',
      }),
    ].join('\n'),
  );
  const results = evaluateSkillManagerBatch('intent', 'candidate', [
    {
      matrix,
      matrixPath: '/matrix-a.jsonl',
      sourceText: 'required',
      targetSkillPath: '/skills/a/SKILL.md',
    },
    {
      matrix,
      matrixPath: '/matrix-b.jsonl',
      sourceText: 'required',
      targetSkillPath: '/skills/b/SKILL.md',
    },
  ]);
  expect(results.results).toHaveLength(2);
  expect(results.results.every((result) => result.challenge)).toBe(true);
  expect(results.results.every((result) => !result.repair)).toBe(true);
});

test('returns one targeted repair packet and suppresses challenges when a candidate fails', () => {
  const matrix = parseMatrixJsonl(
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'missing',
      id: 'candidate',
      independentVerifier: 'source-structure',
      repairBoundary: '/skill',
      scenario: 'content',
      visibility: 'candidate',
    }),
  );
  const results = evaluateSkillManagerBatch('intent', 'candidate', [
    {
      matrix,
      matrixPath: '/matrix.jsonl',
      sourceText: 'missing',
      targetSkillPath: '/skills/a/SKILL.md',
    },
  ]);
  expect(results.results[0]?.challenge).toBeUndefined();
  expect(
    results.results[0]?.repair?.requiredActionGroups[0]?.requiredAssertionIds,
  ).toEqual(['candidate']);
});

test('records baseline receipts without issuing a challenge or repair packet', () => {
  const matrix = parseMatrixJsonl(
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'missing',
      id: 'candidate',
      independentVerifier: 'source-structure',
      repairBoundary: '/skill',
      scenario: 'content',
      visibility: 'candidate',
    }),
  );
  const results = evaluateSkillManagerBatch('intent', 'baseline', [
    {
      matrix,
      matrixPath: '/matrix.jsonl',
      sourceText: 'required',
      targetSkillPath: '/skills/a/SKILL.md',
    },
  ]);
  expect(results.results[0]).toEqual(
    expect.objectContaining({
      candidate: expect.objectContaining({ state: 'baseline_recorded' }),
    }),
  );
  expect(results.results[0]?.challenge).toBeUndefined();
  expect(results.results[0]?.repair).toBeUndefined();
});

test('requires at least one batch target', () => {
  expect(() => evaluateSkillManagerBatch('intent', 'baseline', [])).toThrow(
    'At least one skill matrix and target pair',
  );
});

test('scaffolds a new skill without overwriting an existing skill', async () => {
  const files = new Map<string, string>();
  const fileSystem = {
    mkdir: mock(async () => undefined),
    readFile: mock(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error('missing');
      }
      return content;
    }),
    writeFile: mock(async (path: string, content: string) => {
      files.set(path, content);
    }),
  };
  const receipt = await initializeSkill(
    fileSystem,
    '/tmp/skills/example-skill',
    'Handle example work.',
  );
  expect(receipt).toEqual({
    description: 'Handle example work.',
    name: 'example-skill',
    path: '/tmp/skills/example-skill',
    status: 'created',
  });
  expect(files.get('/tmp/skills/example-skill/SKILL.md')).toContain(
    'description: "Handle example work."',
  );
  await expect(
    initializeSkill(fileSystem, 'relative-skill', 'A description.'),
  ).rejects.toThrow('must be absolute');
  await expect(
    initializeSkill(fileSystem, '/tmp/skills/empty-description', '  '),
  ).rejects.toThrow('must be absolute');
  await expect(
    initializeSkill(
      fileSystem,
      '/tmp/skills/example-skill',
      'A replacement description.',
    ),
  ).rejects.toThrow('Skill already exists');
});

test('validates skill frontmatter, name, description, and instructions', async () => {
  const fileSystem = {
    readFile: mock(async () =>
      [
        '---',
        'name: example-skill',
        'description: Handle example work.',
        '---',
        '',
        '# Example Skill',
        '',
        'Follow the contract.',
      ].join('\n'),
    ),
  };
  await expect(
    validateSkill(fileSystem, '/tmp/skills/example-skill'),
  ).resolves.toEqual({
    description: 'Handle example work.',
    name: 'example-skill',
    path: '/tmp/skills/example-skill',
    status: 'valid',
  });
  await expect(
    validateSkill(fileSystem, '/tmp/skills/ExampleSkill'),
  ).rejects.toThrow('lowercase letters');
  await expect(validateSkill(fileSystem, 'relative-skill')).rejects.toThrow(
    'must be absolute',
  );
  await expect(
    validateSkill(
      { readFile: mock(async () => '# Missing frontmatter') },
      '/tmp/skills/example-skill',
    ),
  ).rejects.toThrow('must contain valid name');
  await expect(
    validateSkill(
      {
        readFile: mock(async () => {
          throw new Error('read failed');
        }),
      },
      '/tmp/skills/example-skill',
    ),
  ).rejects.toThrow('frontmatter is invalid');
});

test('rejects malformed rubric contracts and unauthorized matrix verifiers', async () => {
  expect(() =>
    parseSkillRubric(
      validRubric.replace('schemaVersion: 1', 'schemaVersion: 2'),
    ),
  ).toThrow('schemaVersion 1');
  expect(() =>
    parseSkillRubric(
      validRubric.replace(
        'requiredCaseFields: [id, visibility, scenario, assertions, failureMode, repairBoundary, independentVerifier]',
        'requiredCaseFields: [id]',
      ),
    ),
  ).toThrow('every matrix field');
  const unauthorizedMatrix = [
    matrixRowFor('candidate').replace(
      '"independentVerifier":"source-structure"',
      '"independentVerifier":"matrix-shape"',
    ),
    matrixRowFor('challenge').replace(
      '"independentVerifier":"source-structure"',
      '"independentVerifier":"matrix-shape"',
    ),
  ].join('\n');
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({ matrix: unauthorizedMatrix }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('does not authorize every matrix verifier');
});

test('validates every skill matrix, rubric, and prose link under one skills root', async () => {
  const matrix = [
    JSON.stringify({
      assertions: [{ expected: 'contract', kind: 'required-text' }],
      failureMode: 'missing contract',
      id: 'candidate',
      independentVerifier: 'source-structure',
      repairBoundary: 'SKILL.md',
      scenario: 'contract',
      visibility: 'candidate',
    }),
    JSON.stringify({
      assertions: [{ expected: 'secret', kind: 'forbidden-text' }],
      failureMode: 'secret leak',
      id: 'challenge',
      independentVerifier: 'source-structure',
      repairBoundary: 'SKILL.md',
      scenario: 'safety',
      visibility: 'challenge',
    }),
  ].join('\n');
  const files = new Map<string, string>([
    [
      '/tmp/.agents/skills/demo/SKILL.md',
      [
        '---',
        'name: demo',
        'description: Demo skill.',
        '---',
        '',
        '# Demo',
        '',
        'contract',
      ].join('\n'),
    ],
    ['/tmp/.agents/skills/demo/evals/cases.jsonl', matrix],
    ['/tmp/.agents/skills/demo/evals/rubric.md', validRubric],
  ]);
  const directories: Record<string, readonly string[]> = {
    '/tmp/.agents/skills': ['demo'],
    '/tmp/.agents/skills/demo': ['SKILL.md', 'evals'],
    '/tmp/.agents/skills/demo/evals': ['cases.jsonl', 'rubric.md'],
  };
  const fileSystem = {
    readdir: async (path: string) =>
      (directories[path] ?? []).map((name) => ({
        isDirectory: () => directories[`${path}/${name}`] !== undefined,
        name,
      })),
    readFile: async (path: string): Promise<string> => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`Missing ${path}`);
      }
      return content;
    },
  };
  await expect(
    validateAllSkills(fileSystem, '/tmp/.agents/skills'),
  ).resolves.toEqual(
    expect.objectContaining({
      matrixCount: 1,
      skillCount: 1,
      status: 'valid',
    }),
  );
});

const demoSkillSource = [
  '---',
  'name: demo',
  'description: Demo skill.',
  '---',
  '',
  '# Demo',
  '',
  'contract',
].join('\n');

const matrixRowFor = (visibility: 'candidate' | 'challenge'): string =>
  JSON.stringify({
    assertions: [
      {
        expected: visibility === 'candidate' ? 'contract' : 'secret',
        kind: visibility === 'candidate' ? 'required-text' : 'forbidden-text',
      },
    ],
    failureMode: 'invalid',
    id: visibility,
    independentVerifier: 'source-structure',
    repairBoundary: 'SKILL.md',
    scenario: visibility,
    visibility,
  });

const fullSkillMatrix = [
  matrixRowFor('candidate'),
  matrixRowFor('challenge'),
].join('\n');

const allSkillsFileSystemFor = (options: AllSkillsFixtureOptions = {}) => {
  const evalFiles = options.evalFiles ?? ['cases.jsonl', 'rubric.md'];
  const skills = options.skills ?? ['demo'];
  const files = new Map<string, string>([
    ['/tmp/.agents/skills/demo/SKILL.md', options.source ?? demoSkillSource],
    [
      '/tmp/.agents/skills/demo/evals/cases.jsonl',
      options.matrix ?? fullSkillMatrix,
    ],
    [
      '/tmp/.agents/skills/demo/evals/other.jsonl',
      options.matrix ?? fullSkillMatrix,
    ],
  ]);
  if (options.rubric !== null) {
    files.set(
      '/tmp/.agents/skills/demo/evals/rubric.md',
      options.rubric ?? validRubric,
    );
  }
  const directories: Record<string, readonly string[]> = {
    '/tmp/.agents/skills': skills,
    '/tmp/.agents/skills/demo': ['SKILL.md', 'evals'],
    '/tmp/.agents/skills/demo/evals': evalFiles,
  };
  return {
    readdir: async (path: string) =>
      (directories[path] ?? []).map((name) => ({
        isDirectory: () => directories[`${path}/${name}`] !== undefined,
        name,
      })),
    readFile: async (path: string): Promise<string> => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`Missing ${path}`);
      }
      return content;
    },
  };
};

test('reports every deterministic all-skill validation boundary', async () => {
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({ evalFiles: [] }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('no evaluation matrix');
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({ evalFiles: ['other.jsonl', 'rubric.md'] }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('canonical evaluation matrix');
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({ evalFiles: ['cases.jsonl'], rubric: null }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('nonblank evaluation rubric');
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({
        source: demoSkillSource.replace('contract', 'missing'),
      }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('candidate evaluation failed');
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({ source: `${demoSkillSource}\nsecret` }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('challenge evaluation failed');
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({ matrix: matrixRowFor('candidate') }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('at least one candidate and one challenge');
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({
        source: `${demoSkillSource}\n[Missing](./missing.md)`,
      }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('Skill prose review failed');
  await expect(
    validateAllSkills(
      allSkillsFileSystemFor({ skills: [] }),
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('No skills found');
  await expect(
    validateAllSkills(allSkillsFileSystemFor(), 'relative-skills'),
  ).rejects.toThrow('absolute skills root');
  await expect(
    validateAllSkills(
      { readFile: async () => demoSkillSource },
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('absolute skills root and directory listing');
  let directoryReads = 0;
  await expect(
    validateAllSkills(
      {
        readdir: async (_path: string) => {
          directoryReads += 1;
          if (directoryReads === 1) {
            return [{ isDirectory: () => true, name: 'demo' }];
          }
          return undefined as never;
        },
        readFile: async (path: string): Promise<string> =>
          path.endsWith('/SKILL.md') ? demoSkillSource : '# Rubric',
      },
      '/tmp/.agents/skills',
    ),
  ).rejects.toThrow('directory listing support');
});

test('parses prose-only local links and honors the runtime ignore boundary', async () => {
  const files: Record<string, string> = {
    '/tmp/.agents/.gitignore': '/skills/aidx/sessions',
    '/tmp/.agents/skills/aidx/sessions/goal.md': '# Goal',
    '/tmp/.agents/skills/demo/agents/openai.yaml': 'display_name: Demo',
    '/tmp/.agents/skills/demo/guide.md': '# Guide',
    '/tmp/.agents/skills/demo/SKILL.md': [
      '[Guide](./guide.md)',
      '[Out of scope](../../outside.md)',
      '```md\n[Example](./missing.md)\n```',
    ].join('\n'),
  };
  const directories: Record<string, readonly string[]> = {
    '/tmp/.agents/skills/aidx': ['sessions'],
    '/tmp/.agents/skills/aidx/sessions': ['goal.md'],
    '/tmp/.agents/skills/demo': ['SKILL.md', 'agents', 'guide.md'],
    '/tmp/.agents/skills/demo/agents': ['openai.yaml'],
  };
  const fileSystem = {
    readdir: async (path: string) =>
      (directories[path] ?? []).map((name) => ({
        isDirectory: () => directories[`${path}/${name}`] !== undefined,
        name,
      })),
    readFile: async (path: string): Promise<string> => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing ${path}`);
      }
      return content;
    },
  };
  const receipt = await reviewSkillProse(fileSystem, [
    '/tmp/.agents/skills/demo',
    '/tmp/.agents/skills/aidx/sessions',
  ]);
  const skillSource = files['/tmp/.agents/skills/demo/SKILL.md'] ?? '';
  const gitignore = files['/tmp/.agents/.gitignore'] ?? '';
  expect(localMarkdownLinkTargets(skillSource)).toEqual([
    './guide.md',
    '../../outside.md',
  ]);
  expect(
    ignoredByAgentsGitignore(
      '/tmp/.agents',
      '/tmp/.agents/skills/aidx/sessions',
      gitignore,
    ),
  ).toBe(true);
  expect(receipt.prosePaths).not.toContain(
    '/tmp/.agents/skills/aidx/sessions/goal.md',
  );
  expect(receipt.checkedLocalLinkTargets).toBe(2);
  expect(receipt.findings).toEqual([
    {
      kind: 'out-of-scope-local-link',
      sourcePath: '/tmp/.agents/skills/demo/SKILL.md',
      targetPath: '/tmp/.agents/outside.md',
    },
  ]);
});

test('reports missing reference links and rejects invalid prose-review roots', async () => {
  const files: Record<string, string> = {
    '/tmp/.agents/.gitignore': '',
    '/tmp/.agents/skills/demo/SKILL.md': [
      '[Missing](./missing.md)',
      '[External](https://example.com)',
      '[Reference][missing-reference]',
      '[missing-reference]: ./missing-reference.md',
    ].join('\n'),
    '/tmp/project/README.md': '# Project',
  };
  const directories: Record<string, readonly string[]> = {
    '/tmp/.agents/skills/demo': ['SKILL.md'],
    '/tmp/project': ['README.md'],
  };
  const fileSystem = {
    readdir: async (path: string) =>
      (directories[path] ?? []).map((name) => ({
        isDirectory: () => directories[`${path}/${name}`] !== undefined,
        name,
      })),
    readFile: async (path: string): Promise<string> => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing ${path}`);
      }
      return content;
    },
  };
  const receipt = await reviewSkillProse(fileSystem, [
    '/tmp/.agents/skills/demo',
    '/tmp/project',
  ]);
  expect(receipt.checkedLocalLinkTargets).toBe(2);
  expect(receipt.findings).toEqual([
    {
      kind: 'missing-local-link',
      sourcePath: '/tmp/.agents/skills/demo/SKILL.md',
      targetPath: '/tmp/.agents/skills/demo/missing-reference.md',
    },
    {
      kind: 'missing-local-link',
      sourcePath: '/tmp/.agents/skills/demo/SKILL.md',
      targetPath: '/tmp/.agents/skills/demo/missing.md',
    },
  ]);
  await expect(reviewSkillProse(fileSystem, [])).rejects.toThrow(
    'at least one absolute root',
  );
  await expect(
    reviewSkillProse({ readFile: fileSystem.readFile }, [
      '/tmp/.agents/skills/demo',
    ]),
  ).rejects.toThrow('directory listing support');
});

test('skips directory entries whose names have non-prose extensions', async () => {
  const fileSystem = {
    readdir: async (path: string) => {
      if (path === '/tmp/.agents/skills/demo') {
        return [{ isDirectory: () => true, name: 'generated.js' }];
      }
      return [];
    },
    readFile: async () => '# ignored',
  };
  await expect(
    reviewSkillProse(fileSystem, ['/tmp/.agents/skills/demo']),
  ).resolves.toMatchObject({ prosePaths: [] });
});
