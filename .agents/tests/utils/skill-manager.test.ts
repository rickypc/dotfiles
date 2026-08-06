import { expect, mock, test } from 'bun:test';

import {
  createSkillManagerPacket,
  evaluateSkillManagerBatch,
  evaluateSkillMatrix,
  ignoredByAgentsGitignore,
  initializeSkill,
  localMarkdownLinkTargets,
  parseMatrixJsonl,
  reviewSkillProse,
  validateSkill,
} from '../../utils/skill-manager.js';

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
        repairBoundary: '/skill',
        scenario: 'content',
        visibility: 'candidate',
      }),
      JSON.stringify({
        assertions: [{ expected: 'secret', kind: 'forbidden-text' }],
        failureMode: 'leak',
        id: 'challenge',
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
        repairBoundary: '/skill',
        scenario: 'content',
        visibility: 'candidate',
      }),
      JSON.stringify({
        assertions: [{ expected: 'forbidden', kind: 'forbidden-text' }],
        failureMode: 'leak',
        id: 'challenge',
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
