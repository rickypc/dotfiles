import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/skill-manager.js';

test('renders a deterministic action packet without executing it', async () => {
  const write = mock();
  await run(['packet', 'improve-skill', 'draft', '/skill.md'], undefined, write);
  expect(write.mock.calls[0]?.[0]).toContain('"nextPhase": "baseline"');
});

test('rejects invalid script input and covers the main boundary', async () => {
  await expect(run([])).rejects.toThrow(usage());
  const runner = mock(async () => undefined);
  void runWhenMain(true, ['packet', 'improve-skill', 'draft', '/skill.md'], runner);
  void runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});

test('evaluates a matrix in one deterministic script phase', async () => {
  const matrix = [
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'f',
      id: 'a',
      independentVerifier: 'source-structure',
      repairBoundary: '/skill',
      scenario: 's',
      visibility: 'candidate',
    }),
    JSON.stringify({
      assertions: [{ expected: 'required', kind: 'required-text' }],
      failureMode: 'f',
      id: 'b',
      independentVerifier: 'source-structure',
      repairBoundary: '/skill',
      scenario: 's',
      visibility: 'challenge',
    }),
  ].join('\n');
  const read = mock(async (path: string) => (path === '/matrix' ? matrix : 'required'));
  const write = mock();
  await run(['evaluate', 'candidate', '/matrix', '/target'], read, write);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('passed'));
  await run(['evaluate', 'baseline', '/matrix', '/target'], read, write);
  await run(['evaluate', 'challenge', '/matrix', '/target'], read, write);
  await expect(run(['evaluate', 'candidate', '/matrix'])).rejects.toThrow(usage());
  await expect(run(['evaluate', 'invalid', '/matrix', '/target'], read)).rejects.toThrow(usage());
});

test('batches independent matrix and skill-file pairs into one receipt', async () => {
  const matrix = JSON.stringify({
    assertions: [{ expected: 'required', kind: 'required-text' }],
    failureMode: 'f',
    id: 'a',
    independentVerifier: 'source-structure',
    repairBoundary: '/skill',
    scenario: 's',
    visibility: 'candidate',
  });
  const read = mock(async (path: string) => (path.endsWith('.jsonl') ? matrix : 'required'));
  const write = mock();
  await run(
    [
      'batch',
      'intent',
      'candidate',
      '/matrix-a.jsonl',
      '/skills/a/SKILL.md',
      '/matrix-b.jsonl',
      '/skills/b/SKILL.md',
    ],
    read,
    write,
  );
  expect(read).toHaveBeenCalledTimes(4);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"phase": "candidate"'));
  await expect(
    run(['batch', 'intent', 'baseline', '/matrix.jsonl', '/skills/a'], read),
  ).rejects.toThrow('ending in /SKILL.md');
  await expect(run(['batch', 'intent', 'baseline'], read)).rejects.toThrow(usage());
});

test('reviews absolute static roots through the Skill Manager integrity receipt', async () => {
  const write = mock();
  const fileSystem = {
    exists: async () => false,
    mkdir: mock(async () => undefined),
    readdir: mock(async (path: string) => {
      if (path === '/tmp/.agents/skills/demo') {
        return [{ isDirectory: () => false, name: 'SKILL.md' }];
      }
      throw new Error(`Missing ${path}`);
    }),
    readFile: mock(async (path: string) => {
      if (path === '/tmp/.agents/.gitignore') {
        return '';
      }
      if (path === '/tmp/.agents/skills/demo/SKILL.md') {
        return '# Demo';
      }
      throw new Error(`Missing ${path}`);
    }),
    rm: mock(async () => undefined),
    writeFile: mock(async () => undefined),
  };
  await run(['review', '/tmp/.agents/skills/demo'], undefined, write, fileSystem);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"prosePaths"'));
  await expect(run(['review', 'relative-root'])).rejects.toThrow(usage());
});

test('validates a selected skill through the public command', async () => {
  const write = mock();
  const fileSystem = {
    exists: async () => false,
    mkdir: mock(async () => undefined),
    readdir: mock(async () => []),
    readFile: mock(async () =>
      ['---', 'name: demo', 'description: Demonstrate validation.', '---', '', '# Demo'].join('\n'),
    ),
    rm: mock(async () => undefined),
    writeFile: mock(async () => undefined),
  };
  await run(['validate', '/tmp/.agents/skills/demo'], undefined, write, fileSystem);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"status": "valid"'));
  await expect(run(['validate', 'relative-root'])).rejects.toThrow(usage());
});

test('initializes a selected skill through the public command', async () => {
  const write = mock();
  await expect(
    run(['init', 'relative-root', 'Public demo skill.'], undefined, write),
  ).rejects.toThrow(usage());
  const files = new Map<string, string>();
  const fileSystem = {
    exists: async () => false,
    mkdir: mock(async () => undefined),
    readdir: mock(async () => []),
    readFile: mock(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error('missing');
      }
      return content;
    }),
    rm: mock(async () => undefined),
    writeFile: mock(async (path: string, content: string) => {
      files.set(path, content);
    }),
  };
  await run(
    ['init', '/tmp/.agents/skills/public-demo', 'Public demo skill.'],
    undefined,
    write,
    fileSystem,
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"status": "created"'));
  expect(files.get('/tmp/.agents/skills/public-demo/SKILL.md')).toContain('name: public-demo');
});

const trainQuerySet = JSON.stringify({
  pass_threshold: 0.5,
  queries: [
    { id: 'train-01', query: 'Create a new Agent Skill.', should_trigger: true, split: 'train' },
    {
      id: 'train-02',
      query: 'Install the spreadsheet skill.',
      should_trigger: false,
      split: 'train',
    },
    {
      id: 'validation-01',
      query: 'Review this skill package.',
      should_trigger: true,
      split: 'validation',
    },
    {
      id: 'validation-02',
      query: 'Convert this JSON to YAML.',
      should_trigger: false,
      split: 'validation',
    },
  ],
  runs_per_query: 3,
  skill_name: 'skill-manager',
  splits: { train: 'revise', validation: 'hold out' },
});

const trainAnswers = (answers: Readonly<Record<string, readonly string[]>>): string =>
  `${Object.entries(answers)
    .flatMap(([queryId, values]) =>
      values.map((skillName, index) =>
        JSON.stringify({ query_id: queryId, run: index + 1, skill_name: skillName }),
      ),
    )
    .join('\n')}\n`;

const baselineAnswers = trainAnswers({
  'train-01': ['knowledge-base', 'knowledge-base', 'skill-manager'],
  'train-02': ['knowledge-base', 'knowledge-base', 'knowledge-base'],
  'validation-01': ['knowledge-base', 'knowledge-base', 'knowledge-base'],
  'validation-02': ['knowledge-base', 'knowledge-base', 'knowledge-base'],
});

const improvedAnswers = trainAnswers({
  'train-01': ['skill-manager', 'skill-manager', 'skill-manager'],
  'train-02': ['knowledge-base', 'knowledge-base', 'knowledge-base'],
  'validation-01': ['skill-manager', 'skill-manager', 'skill-manager'],
  'validation-02': ['knowledge-base', 'knowledge-base', 'knowledge-base'],
});

const trainFileSystem = (
  files: Readonly<Record<string, string>>,
  skillSource = '# Skill Manager\n',
) => {
  const written = new Map<string, string>();
  const readable: Record<string, string> = {
    ...files,
    '/tmp/.agents/skills/knowledge-base/SKILL.md':
      '---\nname: knowledge-base\ndescription: KB owner.\n---\n# KB',
    '/tmp/.agents/skills/skill-manager/evals/trigger-queries.json': trainQuerySet,
    '/tmp/.agents/skills/skill-manager/SKILL.md': skillSource,
  };
  return {
    fileSystem: {
      exists: async (path: string) => written.has(path) || path in readable,
      mkdir: mock(async () => undefined),
      readdir: mock(async (path: string) => {
        if (path === '/tmp/.agents/skills') {
          return [
            { isDirectory: () => true, name: 'knowledge-base' },
            { isDirectory: () => true, name: 'skill-manager' },
          ];
        }
        throw new Error(`Missing ${path}`);
      }),
      readFile: mock(async (path: string) => {
        const content = written.get(path) ?? readable[path];
        if (content === undefined) {
          throw new Error(`Missing ${path}`);
        }
        return content;
      }),
      rm: mock(async () => undefined),
      writeFile: mock(async (path: string, content: string) => {
        written.set(path, content);
      }),
    },
    written,
  };
};

const trainSkillPath = '/tmp/.agents/skills/skill-manager';

const receiptFor = (write: ReturnType<typeof mock>): Record<string, unknown> =>
  JSON.parse(String(write.mock.calls.at(-1)?.[0])) as Record<string, unknown>;

test('bundles one measurement request without writing a ledger entry', async () => {
  const { fileSystem } = trainFileSystem({});
  const write = mock();
  await run(
    ['train', 'bundle', trainSkillPath, '--skills-root', '/tmp/.agents/skills'],
    undefined,
    write,
    fileSystem,
  );
  const receipt = receiptFor(write);
  expect(receipt.boundary).toBe('in-session');
  expect(receipt.skillName).toBe('skill-manager');
  expect(receipt.passThreshold).toBe(0.5);
  expect(receipt.runsPerQuery).toBe(3);
  expect(receipt.catalog).toEqual([
    { description: 'KB owner.', name: 'knowledge-base' },
    { description: '', name: 'skill-manager' },
  ]);
  expect(receipt.queries).toHaveLength(4);
  expect(receipt.instructions).toContain('NO_SKILL');
  expect(JSON.stringify(receipt)).not.toContain('apiKey');
  expect(JSON.stringify(receipt)).not.toContain('NVIDIA');
  expect(fileSystem.writeFile).not.toHaveBeenCalled();
  await expect(
    run(['train', 'bundle', trainSkillPath, '--model', 'demo'], undefined, write, fileSystem),
  ).rejects.toThrow(usage());
  await expect(
    run(['train', 'bundle', trainSkillPath, '--status', 'baseline'], undefined, write, fileSystem),
  ).rejects.toThrow(usage());
  await expect(
    run(['train', 'bundle', 'relative-path'], undefined, write, fileSystem),
  ).rejects.toThrow(usage());
});

test('records the measured baseline before the first attempt is gated', async () => {
  const { fileSystem, written } = trainFileSystem({
    '/tmp/.agents/responses.jsonl': baselineAnswers,
  });
  const write = mock();
  await run(
    [
      'train',
      'measure',
      trainSkillPath,
      '/tmp/.agents/responses.jsonl',
      '--measure-only',
      '--ledger-root',
      '/tmp/.agents/quality',
    ],
    undefined,
    write,
    fileSystem,
  );
  const receipt = receiptFor(write);
  expect(receipt.status).toBe('baseline');
  expect(receipt.decision).toBeUndefined();
  expect(receipt.ledger).toMatchObject({ entries: 1, entryId: 'skill-manager-baseline-1' });
  expect(receipt.measurement).toMatchObject({
    boundary: 'in-session',
    train: { passedQueries: 1, score: 0.5, totalQueries: 2 },
    validation: { passedQueries: 1, score: 0.5, totalQueries: 2 },
  });
  expect(receipt.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(receipt.matrixFingerprint).toMatch(/^[0-9a-f]{64}$/);
  const ledgerLines = String(written.get('/tmp/.agents/quality/skill-manager.json') ?? '')
    .split('\n')
    .filter((line) => line.length > 0);
  expect(ledgerLines).toHaveLength(1);
});

test('requires a recorded baseline before an attempt is gated', async () => {
  const { fileSystem, written } = trainFileSystem({
    '/tmp/.agents/responses.jsonl': improvedAnswers,
  });
  const write = mock();
  await expect(
    run(
      [
        'train',
        'measure',
        trainSkillPath,
        '/tmp/.agents/responses.jsonl',
        '--ledger-root',
        '/tmp/.agents/quality',
      ],
      undefined,
      write,
      fileSystem,
    ),
  ).rejects.toThrow('A recorded baseline is required before a attempt ledger entry');
  expect(fileSystem.writeFile).not.toHaveBeenCalled();
  expect(written.size).toBe(0);
});

test('gates an improved attempt against the baseline and appends the ledger entry', async () => {
  const { fileSystem, written } = trainFileSystem({
    '/tmp/.agents/responses.jsonl': baselineAnswers,
  });
  const write = mock();
  await run(
    [
      'train',
      'measure',
      trainSkillPath,
      '/tmp/.agents/responses.jsonl',
      '--measure-only',
      '--ledger-root',
      '/tmp/.agents/quality',
    ],
    undefined,
    write,
    fileSystem,
  );
  const baseline = receiptFor(write);
  expect(baseline.status).toBe('baseline');
  const { fileSystem: measured, written: ledger } = trainFileSystem({
    '/tmp/.agents/improved.jsonl': improvedAnswers,
    '/tmp/.agents/quality/skill-manager.json': String(
      written.get('/tmp/.agents/quality/skill-manager.json') ?? '',
    ),
  });
  await run(
    [
      'train',
      'measure',
      trainSkillPath,
      '/tmp/.agents/improved.jsonl',
      '--attempt',
      '1',
      '--ledger-root',
      '/tmp/.agents/quality',
    ],
    undefined,
    write,
    measured,
  );
  const receipt = receiptFor(write);
  expect(receipt.status).toBe('attempt');
  expect(receipt.decision).toMatchObject({ decision: 'accepted' });
  expect(receipt.ledger).toMatchObject({ entries: 2, entryId: 'skill-manager-attempt-2' });
  const ledgerLines = String(ledger.get('/tmp/.agents/quality/skill-manager.json') ?? '')
    .split('\n')
    .filter((line) => line.length > 0);
  expect(ledgerLines).toHaveLength(2);
  expect(ledgerLines[0]).toContain('baseline');
});

test('blocks an attempt that does not beat the baseline on the train split', async () => {
  const { fileSystem, written } = trainFileSystem({
    '/tmp/.agents/responses.jsonl': baselineAnswers,
  });
  const write = mock();
  await run(
    [
      'train',
      'measure',
      trainSkillPath,
      '/tmp/.agents/responses.jsonl',
      '--measure-only',
      '--ledger-root',
      '/tmp/.agents/quality',
    ],
    undefined,
    write,
    fileSystem,
  );
  const { fileSystem: blocked, written: ledger } = trainFileSystem({
    '/tmp/.agents/quality/skill-manager.json': String(
      written.get('/tmp/.agents/quality/skill-manager.json') ?? '',
    ),
    '/tmp/.agents/same.jsonl': baselineAnswers,
  });
  await run(
    [
      'train',
      'measure',
      trainSkillPath,
      '/tmp/.agents/same.jsonl',
      '--attempt',
      '2',
      '--ledger-root',
      '/tmp/.agents/quality',
    ],
    undefined,
    write,
    blocked,
  );
  const receipt = receiptFor(write);
  expect(receipt.decision).toMatchObject({ decision: 'blocked' });
  expect(String((receipt.decision as Record<string, unknown>).reason)).toContain(
    'Train 0.5 <= baseline 0.5.',
  );
  const ledgerLines = String(ledger.get('/tmp/.agents/quality/skill-manager.json') ?? '')
    .split('\n')
    .filter((line) => line.length > 0);
  expect(ledgerLines).toHaveLength(2);
  expect(ledgerLines[1]).toContain('"status":"attempt"');
});

test('rejects an unknown train mode and a responses path outside the JSONL contract', async () => {
  const { fileSystem } = trainFileSystem({});
  const write = mock();
  await expect(
    run(['train', 'unknown', trainSkillPath], undefined, write, fileSystem),
  ).rejects.toThrow(usage());
  await expect(
    run(
      ['train', 'measure', trainSkillPath, '/tmp/.agents/responses.json'],
      undefined,
      write,
      fileSystem,
    ),
  ).rejects.toThrow(usage());
  await expect(
    run(
      ['train', 'measure', trainSkillPath, '/tmp/.agents/responses.jsonl', '--runs', '2'],
      undefined,
      write,
      fileSystem,
    ),
  ).rejects.toThrow(usage());
  expect(fileSystem.writeFile).not.toHaveBeenCalled();
});
