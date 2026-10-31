import { expect, mock, test } from 'bun:test';

import { dirname, join } from 'node:path';

import { run, runWhenMain, usage } from '../../scripts/skill-manager.js';

interface BundleReceipt {
  readonly boundary: string;
  readonly catalog: unknown;
  readonly instructions: string;
  readonly prompts: readonly unknown[];
}

interface Counts {
  readonly train: number;
  readonly validation: number;
}

interface MeasureReceipt {
  readonly decision?: {
    readonly baseline?: unknown;
    readonly decision: string;
    readonly gained: Counts;
    readonly reason: string;
    readonly regressed: Counts;
  };
  readonly ledger: {
    readonly entries: number;
    readonly entryId: string;
    readonly path: string;
    readonly snapshot: string;
  };
  readonly matrixFingerprint: string;
  readonly measurement: {
    readonly clear: boolean;
    readonly train: { readonly passedQueries: number; readonly totalQueries: number };
    readonly trainQueries: readonly unknown[];
    readonly validationFailures: number;
  };
  readonly sourceFingerprint: string;
  readonly status: string;
}

interface SelectReceipt {
  readonly attempts: readonly unknown[];
  readonly decision: string;
  readonly liveEntry?: { readonly entryId: string; readonly status: string };
  readonly liveState: string;
  readonly nextAction: string;
  readonly winner?: { readonly snapshot: string };
}

type World = ReturnType<typeof newWorld>;

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

const SKILLS = '/tmp/.agents/skills';
const trainSkillPath = `${SKILLS}/skill-manager`;
const skillFile = `${trainSkillPath}/SKILL.md`;
const RESPONSES = '/tmp/.agents/responses.jsonl';
const LEDGER_ROOT = '/tmp/.agents/quality';
const LEDGER = `${LEDGER_ROOT}/skill-manager.json`;
const WIDE_CAP = '100000';

const comprehensionSource = (subject: string, target: string): string =>
  JSON.stringify({
    kind: 'comprehension',
    queries: [
      ['t1', 'train', 'A'],
      ['t2', 'train', 'B'],
      ['v1', 'validation', 'C'],
      ['v2', 'validation', 'A'],
    ].map(([id, split, expected]) => ({
      expected,
      id,
      query: `Question ${id}?\nA) one\nB) two\nC) three`,
      split,
    })),
    runs_per_query: 3,
    skill_name: subject,
    target,
  });

const skillSource = (description = 'Manage skills.'): string =>
  `---\nname: skill-manager\ndescription: ${description}\n---\n\n# Skill Manager\n\ncontract\n`;

const triggerQueries = (extra: readonly Record<string, unknown>[] = []): string =>
  JSON.stringify({
    queries: [
      ...['train', 'validation'].flatMap((split) => [
        { id: `${split}-p1`, query: `${split} positive one`, should_trigger: true, split },
        { id: `${split}-p2`, query: `${split} positive two`, should_trigger: true, split },
        { id: `${split}-n1`, query: `${split} negative one`, should_trigger: false, split },
        { id: `${split}-n2`, query: `${split} negative two`, should_trigger: false, split },
      ]),
      ...extra,
    ],
    runs_per_query: 3,
    skill_name: 'skill-manager',
  });

const rubricSource = [
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

const matrixSource = ['candidate', 'challenge']
  .map((visibility) =>
    JSON.stringify({
      assertions: [
        visibility === 'candidate'
          ? { expected: 'contract', kind: 'required-text' }
          : { expected: 'secret', kind: 'forbidden-text' },
      ],
      failureMode: 'invalid',
      id: visibility,
      independentVerifier: 'source-structure',
      repairBoundary: 'SKILL.md',
      scenario: visibility,
      visibility,
    }),
  )
  .join('\n');

const answersFor = (correct: readonly string[], ids = allQueryIds): string =>
  `${ids
    .flatMap((id) =>
      [1, 2, 3].map((run) => {
        const positive = id.includes('-p');
        const right = correct.includes(id);
        const skillName = positive === right ? 'skill-manager' : 'knowledge-base';
        return JSON.stringify({ query_id: id, run, skill_name: skillName });
      }),
    )
    .join('\n')}\n`;

const allQueryIds = [
  'train-p1',
  'train-p2',
  'train-n1',
  'train-n2',
  'validation-p1',
  'validation-p2',
  'validation-n1',
  'validation-n2',
];

const BASELINE_CORRECT = allQueryIds.filter((id) => id !== 'train-p1' && id !== 'validation-p1');

const exec = async <Receipt>(world: World, args: readonly string[]): Promise<Receipt> => {
  const write = mock();
  await run(args, undefined, write, world.fileSystem);
  return JSON.parse(String(write.mock.calls.at(-1)?.[0])) as Receipt;
};

const measure = (world: World, correct: readonly string[], ...flags: string[]) => {
  world.files.set(RESPONSES, answersFor(correct));
  return exec<MeasureReceipt>(world, [
    'train',
    'measure',
    trainSkillPath,
    RESPONSES,
    '--ledger-root',
    LEDGER_ROOT,
    '--max-description-change',
    WIDE_CAP,
    ...flags,
  ]);
};

const newWorld = () => {
  const files = new Map<string, string>([
    [
      `${SKILLS}/knowledge-base/SKILL.md`,
      '---\nname: knowledge-base\ndescription: KB owner.\n---\n# KB',
    ],
    [skillFile, skillSource()],
    [`${trainSkillPath}/evals/cases.jsonl`, matrixSource],
    [`${trainSkillPath}/evals/rubric.md`, rubricSource],
    [`${trainSkillPath}/evals/trigger-queries.json`, triggerQueries()],
    [
      `${trainSkillPath}/evals/comprehension/SKILL.json`,
      comprehensionSource('skill-manager--SKILL', '../../SKILL.md'),
    ],
    [
      `${trainSkillPath}/evals/comprehension/evals-rubric.json`,
      comprehensionSource('skill-manager--evals-rubric', '../../evals/rubric.md'),
    ],
  ]);
  const fileSystem = {
    exists: async (path: string) => files.has(path),
    mkdir: mock(async () => undefined),
    readdir: mock(async (path: string) => {
      const prefix = `${path}/`;
      const children = new Map<string, boolean>();
      for (const file of files.keys()) {
        if (file.startsWith(prefix)) {
          const rest = file.slice(prefix.length);
          const [name = ''] = rest.split('/');
          children.set(name, rest.includes('/') || children.get(name) === true);
        }
      }
      if (children.size === 0) {
        throw new Error(`Missing ${path}`);
      }
      return [...children].map(([name, directory]) => ({ isDirectory: () => directory, name }));
    }),
    readFile: mock(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`Missing ${path}`);
      }
      return content;
    }),
    rm: mock(async () => undefined),
    writeFile: mock(async (path: string, content: string) => {
      files.set(path, content);
    }),
  };
  return { fileSystem, files };
};

const withBaseline = async (): Promise<World> => {
  const world = newWorld();
  await measure(world, BASELINE_CORRECT, '--measure-only');
  return world;
};

const IMPROVED_CORRECT = [...BASELINE_CORRECT, 'train-p1'];

test('bundles one blind request with the candidate description and no labels', async () => {
  const world = newWorld();
  world.files.set(skillFile, skillSource('Candidate description under test.'));
  const bundle = await exec<BundleReceipt>(world, [
    'train',
    'bundle',
    trainSkillPath,
    '--skills-root',
    SKILLS,
  ]);
  expect(bundle.boundary).toBe('in-session');
  expect(bundle.catalog).toEqual([
    { description: 'KB owner.', name: 'knowledge-base' },
    { description: 'Candidate description under test.', name: 'skill-manager' },
  ]);
  expect(bundle.prompts).toHaveLength(24);
  expect(bundle.prompts[0]).toEqual({ query: 'train positive one', query_id: 'train-p1', run: 1 });
  expect(bundle.instructions).toContain('NO_SKILL');
  const serialized = JSON.stringify(bundle);
  for (const leaked of ['should_trigger', 'split', 'skillName', 'passThreshold', 'apiKey']) {
    expect(serialized).not.toContain(leaked);
  }
  expect(world.fileSystem.writeFile).not.toHaveBeenCalled();
  for (const args of [
    ['train', 'bundle', trainSkillPath, '--model', 'demo'],
    ['train', 'bundle', trainSkillPath, '--status', 'baseline'],
    ['train', 'bundle', 'relative-path'],
  ]) {
    await expect(run(args, undefined, mock(), world.fileSystem)).rejects.toThrow(usage());
  }
});

test('rejects malformed train flags and a missing responses path without a ledger write', async () => {
  const world = newWorld();
  const write = mock();
  for (const flags of [
    ['--status', 'bogus'],
    ['--status', 'blocked'],
    ['--attempt'],
    ['--runs', '--measure-only'],
  ]) {
    await expect(
      run(
        ['train', 'measure', trainSkillPath, RESPONSES, ...flags],
        undefined,
        write,
        world.fileSystem,
      ),
    ).rejects.toThrow(usage());
  }
  await expect(
    run(['train', 'measure', trainSkillPath], undefined, write, world.fileSystem),
  ).rejects.toThrow(usage());
  expect(write).not.toHaveBeenCalled();
  expect(world.fileSystem.writeFile).not.toHaveBeenCalled();
});

test('records a blind-safe baseline with a source snapshot and no decision', async () => {
  const world = newWorld();
  const receipt = await measure(world, BASELINE_CORRECT, '--measure-only');
  expect(receipt.status).toBe('baseline');
  expect(receipt.decision).toBeUndefined();
  expect(receipt.ledger).toMatchObject({
    entries: 1,
    entryId: 'skill-manager-baseline-1',
    snapshot: `${LEDGER_ROOT}/skill-manager-baseline-1.snapshot.md`,
  });
  expect(world.files.get(receipt.ledger.snapshot)).toBe(skillSource());
  expect(receipt.measurement.train).toMatchObject({ passedQueries: 3, totalQueries: 4 });
  expect(receipt.measurement.validationFailures).toBe(1);
  expect(receipt.measurement.trainQueries).toHaveLength(4);
  expect(JSON.stringify(receipt)).not.toContain('validation-p1');
  expect(receipt.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(receipt.matrixFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(String(world.files.get(LEDGER)).split('\n').filter(Boolean)).toHaveLength(1);
});

test('records the default ledger root derived from the agents root', async () => {
  const agentsRootFromTests = dirname(dirname(import.meta.dir));
  const plansIndex = agentsRootFromTests.replace(/^\/+/u, '').replaceAll('/', '-');
  const defaultLedgerPath = join(
    agentsRootFromTests,
    'plans',
    plansIndex,
    'quality',
    'skill-manager.json',
  );
  const world = newWorld();
  world.files.set(RESPONSES, answersFor(BASELINE_CORRECT));
  const receipt = await exec<MeasureReceipt>(world, [
    'train',
    'measure',
    trainSkillPath,
    RESPONSES,
    '--measure-only',
  ]);
  expect(receipt.ledger).toMatchObject({ entries: 1, path: defaultLedgerPath });
  expect(String(world.files.get(defaultLedgerPath))).toContain('"status":"baseline"');
});

test('requires a recorded baseline before an attempt and a clean baseline source', async () => {
  const world = newWorld();
  world.files.set(RESPONSES, answersFor(IMPROVED_CORRECT));
  await expect(
    run(
      ['train', 'measure', trainSkillPath, RESPONSES, '--ledger-root', LEDGER_ROOT],
      undefined,
      mock(),
      world.fileSystem,
    ),
  ).rejects.toThrow('A recorded baseline is required before a attempt ledger entry');
  expect(world.fileSystem.writeFile).not.toHaveBeenCalled();
  world.files.set(skillFile, skillSource('x'.repeat(1025)));
  await expect(
    run(
      [
        'train',
        'measure',
        trainSkillPath,
        RESPONSES,
        '--measure-only',
        '--ledger-root',
        LEDGER_ROOT,
      ],
      undefined,
      mock(),
      world.fileSystem,
    ),
  ).rejects.toThrow('Repair the deterministic failure before recording a baseline');
  expect(world.fileSystem.writeFile).not.toHaveBeenCalled();
});

test('accepts an attempt that gains a query without regressing any other', async () => {
  const world = await withBaseline();
  world.files.set(skillFile, skillSource('Manage skills, packages, and instruction documents.'));
  const receipt = await measure(world, IMPROVED_CORRECT, '--attempt', '1');
  expect(receipt.status).toBe('attempt');
  expect(receipt.decision).toMatchObject({
    decision: 'accepted',
    gained: { train: 1, validation: 0 },
    regressed: { train: 0, validation: 0 },
  });
  expect(receipt.decision?.baseline).toBeUndefined();
  expect(receipt.ledger).toMatchObject({ entries: 2, entryId: 'skill-manager-attempt-2' });
  expect(world.files.get(receipt.ledger.snapshot)).toContain('instruction documents');
});

test('blocks an unchanged source, a regression, and a deterministic failure', async () => {
  const world = await withBaseline();
  const unchanged = await measure(world, IMPROVED_CORRECT, '--attempt', '1');
  expect(unchanged.decision?.reason).toBe(
    'The candidate source is identical to the baseline source.',
  );
  world.files.set(skillFile, skillSource('Changed description.'));
  const regressed = await measure(
    world,
    [...IMPROVED_CORRECT.filter((id) => id !== 'validation-n1')],
    '--attempt',
    '2',
  );
  expect(regressed.decision).toMatchObject({
    decision: 'blocked',
    reason: 'Regressed 1 previously passing queries (train 0, validation 1).',
  });
  world.files.set(skillFile, skillSource('y'.repeat(1025)));
  const broken = await measure(world, IMPROVED_CORRECT, '--attempt', '3');
  expect(broken.decision?.reason).toContain('Deterministic check failed');
  expect(String(world.files.get(LEDGER))).toContain('"hardFailure"');
});

test('selects the accepted winner and reports where the live source stands', async () => {
  const world = await withBaseline();
  const select = () =>
    exec<SelectReceipt>(world, ['train', 'select', trainSkillPath, '--ledger-root', LEDGER_ROOT]);
  const initial = await select();
  expect(initial).toMatchObject({ decision: 'keep-baseline', liveState: 'baseline' });
  expect(initial.nextAction).toContain('Keep the baseline');
  expect(initial.winner).toBeUndefined();
  const candidate = skillSource('Manage skills, packages, and instruction documents.');
  world.files.set(skillFile, candidate);
  await measure(world, IMPROVED_CORRECT, '--attempt', '1');
  const winner = await select();
  expect(winner).toMatchObject({ decision: 'apply', liveState: 'winner' });
  expect(winner.nextAction).toContain('winner is live');
  expect(winner.winner?.snapshot).toBe(`${LEDGER_ROOT}/skill-manager-attempt-2.snapshot.md`);
  expect(winner.attempts).toEqual([
    expect.objectContaining({
      attempt: 1,
      decision: 'accepted',
      entryId: 'skill-manager-attempt-2',
    }),
  ]);
  world.files.set(skillFile, skillSource());
  expect((await select()).nextAction).toContain('Copy the winner snapshot');
  world.files.set(skillFile, skillSource('Measured but blocked.'));
  await measure(
    world,
    IMPROVED_CORRECT.filter((id) => id !== 'validation-n1'),
    '--attempt',
    '2',
  );
  const measured = await select();
  expect(measured).toMatchObject({
    decision: 'apply',
    liveEntry: { entryId: 'skill-manager-attempt-3', status: 'attempt' },
    liveState: 'measured',
  });
  expect(measured.nextAction).toContain('Copy the winner snapshot');
  world.files.set(skillFile, skillSource('Edited without measurement.'));
  const unrecorded = await select();
  expect(unrecorded.liveState).toBe('unrecorded');
  expect(unrecorded.nextAction).toContain('matches no recorded entry');
});

test('requires a baseline and plain flags for selection', async () => {
  const world = newWorld();
  await expect(
    run(
      ['train', 'select', trainSkillPath, '--ledger-root', LEDGER_ROOT],
      undefined,
      mock(),
      world.fileSystem,
    ),
  ).rejects.toThrow('A recorded baseline is required before selection');
  for (const flag of [
    ['--runs', '3'],
    ['--status', 'baseline'],
    ['--skills-root', SKILLS],
    ['--measure-only'],
  ]) {
    await expect(
      run(['train', 'select', trainSkillPath, ...flag], undefined, mock(), world.fileSystem),
    ).rejects.toThrow(usage());
  }
});

test('verifies applied, post-change, and rollback entries against the baseline', async () => {
  const world = await withBaseline();
  const winnerSource = skillSource('Manage skills, packages, and instruction documents.');
  world.files.set(skillFile, winnerSource);
  await measure(world, IMPROVED_CORRECT, '--attempt', '1');
  const applied = await measure(world, IMPROVED_CORRECT, '--status', 'applied');
  expect(applied.decision?.decision).toBe('accepted');
  const postChange = await measure(world, IMPROVED_CORRECT, '--status', 'post-change');
  expect(postChange.decision?.decision).toBe('accepted');
  world.files.set(skillFile, skillSource('Edited without measurement.'));
  const unmeasured = await measure(world, IMPROVED_CORRECT, '--status', 'applied');
  expect(unmeasured.decision?.reason).toContain('matches no accepted attempt snapshot');
  const diverged = await measure(world, BASELINE_CORRECT, '--status', 'rollback');
  expect(diverged.decision?.decision).toBe('blocked');
  world.files.set(skillFile, skillSource());
  const restored = await measure(world, BASELINE_CORRECT, '--status', 'rollback');
  expect(restored.decision?.decision).toBe('accepted');
});

test('rebaselines only when the query set is extended and never when it shrinks', async () => {
  const world = await withBaseline();
  world.files.set(RESPONSES, answersFor(BASELINE_CORRECT));
  const duplicate = run(
    ['train', 'measure', trainSkillPath, RESPONSES, '--measure-only', '--ledger-root', LEDGER_ROOT],
    undefined,
    mock(),
    world.fileSystem,
  );
  await expect(duplicate).rejects.toThrow('A baseline already exists for this frozen query set');
  const extra = [
    { id: 'train-n3', query: 'train negative three', should_trigger: false, split: 'train' },
  ];
  world.files.set(`${trainSkillPath}/evals/trigger-queries.json`, triggerQueries(extra));
  world.files.set(RESPONSES, answersFor(BASELINE_CORRECT, [...allQueryIds, 'train-n3']));
  const extended = await exec<MeasureReceipt>(world, [
    'train',
    'measure',
    trainSkillPath,
    RESPONSES,
    '--measure-only',
    '--ledger-root',
    LEDGER_ROOT,
  ]);
  expect(extended.ledger.entryId).toBe('skill-manager-baseline-2');
  expect(extended.decision).toBeUndefined();
  world.files.set(
    `${trainSkillPath}/evals/trigger-queries.json`,
    JSON.stringify({
      ...JSON.parse(triggerQueries(extra)),
      queries: JSON.parse(triggerQueries(extra)).queries.slice(1),
    }),
  );
  await expect(
    run(
      [
        'train',
        'measure',
        trainSkillPath,
        RESPONSES,
        '--measure-only',
        '--ledger-root',
        LEDGER_ROOT,
      ],
      undefined,
      mock(),
      world.fileSystem,
    ),
  ).rejects.toThrow('A new baseline may only extend the query set');
});

test('rejects an unknown train mode and a responses path outside the JSONL contract', async () => {
  const world = newWorld();
  const write = mock();
  for (const args of [
    ['train', 'unknown', trainSkillPath],
    ['train', 'measure', trainSkillPath, '/tmp/.agents/responses.json'],
    ['train', 'measure', trainSkillPath, RESPONSES, '--runs', '2'],
  ]) {
    await expect(run(args, undefined, write, world.fileSystem)).rejects.toThrow(usage());
  }
  expect(world.fileSystem.writeFile).not.toHaveBeenCalled();
});

test('ratchets a matrix or query set so frozen checks are never weakened', async () => {
  const files = new Map<string, string>([
    ['/prev.jsonl', matrixSource],
    ['/same.jsonl', matrixSource],
    ['/weak.jsonl', matrixSource.split('\n')[0] ?? ''],
    ['/prev.json', triggerQueries()],
    [
      '/grown.json',
      triggerQueries([{ id: 'x', query: 'extra', should_trigger: true, split: 'train' }]),
    ],
    [
      '/shrunk.json',
      JSON.stringify({
        ...JSON.parse(triggerQueries()),
        queries: JSON.parse(triggerQueries()).queries.slice(1),
      }),
    ],
  ]);
  const read = mock(async (path: string) => files.get(path) ?? '');
  const write = mock();
  await run(['ratchet', '/prev.jsonl', '/same.jsonl'], read, write);
  await run(['ratchet', '/prev.json', '/grown.json'], read, write);
  expect(JSON.parse(String(write.mock.calls.at(-1)?.[0]))).toMatchObject({ status: 'ratchet-ok' });
  await expect(run(['ratchet', '/prev.jsonl', '/weak.jsonl'], read, write)).rejects.toThrow(
    'Case challenge was removed.',
  );
  await expect(run(['ratchet', '/prev.json', '/shrunk.json'], read, write)).rejects.toThrow(
    'was removed',
  );
  for (const args of [
    ['ratchet', '/prev.jsonl'],
    ['ratchet', 'prev.jsonl', '/same.jsonl'],
    ['ratchet', '/prev.jsonl', '/same.json'],
    ['ratchet', '/prev.json', 'same.json'],
  ]) {
    await expect(run(args, read, write)).rejects.toThrow(usage());
  }
});

test('flags a measured non-baseline source when no attempt won', async () => {
  const world = await withBaseline();
  world.files.set(skillFile, skillSource('Measured regression.'));
  await measure(
    world,
    IMPROVED_CORRECT.filter((id) => id !== 'validation-n1'),
    '--attempt',
    '1',
  );
  const state = await exec<SelectReceipt>(world, [
    'train',
    'select',
    trainSkillPath,
    '--ledger-root',
    LEDGER_ROOT,
  ]);
  expect(state).toMatchObject({ decision: 'keep-baseline', liveState: 'measured' });
  expect(state.nextAction).toContain('measured entry other than the baseline');
});

const SKILL_SET = `${trainSkillPath}/evals/comprehension/SKILL.json`;
const RUBRIC_SET = `${trainSkillPath}/evals/comprehension/evals-rubric.json`;
const DOC_LEDGER = `${LEDGER_ROOT}/skill-manager--SKILL.json`;

const letterAnswers = (answers: Readonly<Record<string, string>>): string =>
  `${Object.entries(answers)
    .flatMap(([id, letter]) =>
      [1, 2, 3].map((run) => JSON.stringify({ answer: letter, query_id: id, run })),
    )
    .join('\n')}\n`;

const DOC_BASELINE = { t1: 'A', t2: 'C', v1: 'C', v2: 'A' };
const DOC_IMPROVED = { t1: 'A', t2: 'B', v1: 'C', v2: 'A' };

const measureDocument = (
  world: World,
  setPath: string,
  answers: Record<string, string>,
  ...flags: string[]
) => {
  world.files.set(RESPONSES, letterAnswers(answers));
  return exec<MeasureReceipt>(world, [
    'train',
    'measure',
    setPath,
    RESPONSES,
    '--ledger-root',
    LEDGER_ROOT,
    '--max-description-change',
    WIDE_CAP,
    ...flags,
  ]);
};

test('bundles a blind document request with the live document text', async () => {
  const world = newWorld();
  const bundle = await exec<{
    document: string;
    instructions: string;
    prompts: readonly { query_id: string }[];
  }>(world, ['train', 'bundle', SKILL_SET]);
  expect(bundle.document).toBe(skillSource());
  expect(bundle.prompts).toHaveLength(12);
  expect(bundle.instructions).toContain('option letter');
  expect(JSON.stringify(bundle)).not.toContain('expected');
  await expect(
    run(
      ['train', 'bundle', `${trainSkillPath}/evals/trigger-queries.json`],
      undefined,
      mock(),
      world.fileSystem,
    ),
  ).rejects.toThrow('must be a comprehension set');
});

test('gates a document attempt by comprehension and selects it', async () => {
  const world = newWorld();
  const baseline = await measureDocument(world, SKILL_SET, DOC_BASELINE, '--measure-only');
  expect(baseline.ledger.path).toBe(DOC_LEDGER);
  expect(baseline.measurement.clear).toBe(false);
  world.files.set(skillFile, skillSource('A clearer description.'));
  const attempt = await measureDocument(world, SKILL_SET, DOC_IMPROVED, '--attempt', '1');
  expect(attempt.decision).toMatchObject({ decision: 'accepted', gained: { train: 1 } });
  expect(attempt.measurement.clear).toBe(true);
  const state = await exec<SelectReceipt>(world, [
    'train',
    'select',
    SKILL_SET,
    '--ledger-root',
    LEDGER_ROOT,
  ]);
  expect(state).toMatchObject({ decision: 'apply', liveState: 'winner' });
});

test('treats a non-skill document as a plain source and blocks a blank one', async () => {
  const world = newWorld();
  world.files.set(`${trainSkillPath}/evals/rubric.md`, rubricSource);
  const baseline = await measureDocument(world, RUBRIC_SET, DOC_BASELINE, '--measure-only');
  expect(baseline.status).toBe('baseline');
  world.files.set(`${trainSkillPath}/evals/rubric.md`, '   ');
  const blank = await measureDocument(world, RUBRIC_SET, DOC_IMPROVED, '--attempt', '1');
  expect(blank.decision?.reason).toContain('The document is blank');
  expect(String(world.files.get(`${LEDGER_ROOT}/skill-manager--evals-rubric.json`))).toContain(
    'hardFailure',
  );
});

const attemptWith = (world: World, correct: readonly string[], ...flags: string[]) => {
  world.files.set(RESPONSES, answersFor(correct));
  return exec<MeasureReceipt>(world, [
    'train',
    'measure',
    trainSkillPath,
    RESPONSES,
    '--attempt',
    '1',
    '--ledger-root',
    LEDGER_ROOT,
    ...flags,
  ]);
};

const snapshotOf = (world: World): string =>
  JSON.stringify([...world.files].filter(([path]) => path !== RESPONSES));

test('fails an over-cap attempt before a ledger or snapshot write', async () => {
  const world = await withBaseline();
  world.files.set(skillFile, skillSource('A completely different and much longer description.'));
  const before = snapshotOf(world);
  await expect(attemptWith(world, IMPROVED_CORRECT)).rejects.toThrow(
    'Edit cap exceeded; nothing was recorded: The description edit changes',
  );
  expect(snapshotOf(world)).toBe(before);
  await expect(
    attemptWith(world, IMPROVED_CORRECT, '--max-description-change', '25'),
  ).rejects.toThrow('the cap is 3 (25 percent of 14)');
  expect(snapshotOf(world)).toBe(before);
  const wide = await attemptWith(world, IMPROVED_CORRECT, '--max-description-change', WIDE_CAP);
  expect(wide.status).toBe('attempt');
  expect(snapshotOf(world)).not.toBe(before);
});

test('caps changed body lines and rejects a description-and-body edit', async () => {
  const world = await withBaseline();
  const longBody = Array.from({ length: 41 }, (_, index) => `rule ${index}`).join('\n');
  world.files.set(skillFile, `${skillSource()}${longBody}\n`);
  const before = snapshotOf(world);
  await expect(attemptWith(world, IMPROVED_CORRECT)).rejects.toThrow('the cap is 40');
  expect(snapshotOf(world)).toBe(before);
  expect((await attemptWith(world, IMPROVED_CORRECT, '--max-body-lines', '41')).status).toBe(
    'attempt',
  );
  world.files.set(skillFile, `${skillSource('Manage skills!')}extra line\n`);
  await expect(
    attemptWith(world, IMPROVED_CORRECT, '--max-description-change', WIDE_CAP),
  ).rejects.toThrow('one edit');
});

test('rejects invalid cap flags and cap flags on bundle and select', async () => {
  const world = newWorld();
  for (const args of [
    ['train', 'bundle', trainSkillPath, '--max-body-lines', '5'],
    ['train', 'bundle', trainSkillPath, '--max-description-change', '5'],
    ['train', 'bundle', trainSkillPath, '--track', 'contract'],
    ['train', 'select', trainSkillPath, '--max-body-lines', '5'],
    ['train', 'select', trainSkillPath, '--max-description-change', '5'],
    ['train', 'measure', trainSkillPath, RESPONSES, '--max-body-lines', '0'],
    ['train', 'measure', trainSkillPath, RESPONSES, '--max-description-change', 'x'],
    ['train', 'measure', trainSkillPath, RESPONSES, '--track', 'other'],
    ['train', 'measure', trainSkillPath, RESPONSES, '--track', 'contract'],
    ['train', 'measure', trainSkillPath, '--track', 'contract', '--runs', '3'],
  ]) {
    await expect(run(args, undefined, mock(), world.fileSystem)).rejects.toThrow(usage());
  }
});

test('stores the rejected edit on a blocked attempt and lists it in doNotRetry', async () => {
  const world = await withBaseline();
  world.files.set(skillFile, skillSource('Manage skill packs.'));
  const regressed = await attemptWith(
    world,
    IMPROVED_CORRECT.filter((id) => id !== 'validation-n1'),
    '--max-description-change',
    WIDE_CAP,
  );
  expect(regressed.decision?.decision).toBe('blocked');
  const lines = String(world.files.get(LEDGER)).trim().split('\n');
  expect(JSON.parse(lines[0] ?? '')).not.toHaveProperty('rejected');
  expect(JSON.parse(lines[1] ?? '')).toMatchObject({
    rejected: {
      changeSummary: expect.stringContaining('description'),
      gainedIds: ['train-p1'],
      reason: 'Regressed 1 previously passing queries (train 0, validation 1).',
      regressedIds: ['validation-n1'],
    },
  });
  world.files.set(skillFile, skillSource('Manage skills, packages, and docs.'));
  const accepted = await attemptWith(world, IMPROVED_CORRECT, '--max-description-change', WIDE_CAP);
  expect(accepted.decision?.decision).toBe('accepted');
  expect(String(world.files.get(LEDGER)).trim().split('\n')[2]).not.toContain('rejected');
  const select = await exec<{ doNotRetry: Record<string, unknown>[] }>(world, [
    'train',
    'select',
    trainSkillPath,
    '--ledger-root',
    LEDGER_ROOT,
  ]);
  expect(select.doNotRetry).toHaveLength(1);
  expect(select.doNotRetry[0]).toMatchObject({
    attempt: 1,
    entryId: 'skill-manager-attempt-2',
    gainedIds: ['train-p1'],
    regressedIds: ['validation-n1'],
  });
  expect(JSON.stringify(select)).not.toContain('validation positive');
});

const CONTRACT_LEDGER = `${LEDGER_ROOT}/skill-manager-contract.json`;

const contractMeasure = (world: World, ...flags: string[]) =>
  exec<MeasureReceipt>(world, [
    'train',
    'measure',
    trainSkillPath,
    '--track',
    'contract',
    '--ledger-root',
    LEDGER_ROOT,
    ...flags,
  ]);

const contractWorld = async (): Promise<World> => {
  const world = newWorld();
  world.files.set(skillFile, skillSource().replace('contract', 'agreement'));
  await contractMeasure(world, '--measure-only');
  return world;
};

test('records a contract baseline from the matrix with no responses file', async () => {
  const world = await contractWorld();
  const ledger = JSON.parse(String(world.files.get(CONTRACT_LEDGER)).trim()) as {
    boundary: string;
    measurement: { perQuery: { id: string; split: string }[] };
  };
  expect(ledger.boundary).toBe('deterministic-matrix');
  expect(ledger.measurement.perQuery.map(({ id, split }) => [id, split])).toEqual([
    ['candidate:required-text:1', 'train'],
    ['challenge:forbidden-text:1', 'validation'],
  ]);
  expect(world.files.has(`${LEDGER_ROOT}/skill-manager-contract-baseline-1.snapshot.md`)).toBe(
    true,
  );
  expect(world.files.has(LEDGER)).toBe(false);
});

test('gates a contract attempt with the never-worse gate and selects the winner', async () => {
  const world = await contractWorld();
  world.files.set(skillFile, skillSource());
  const gained = await contractMeasure(world, '--attempt', '1');
  expect(gained.decision).toMatchObject({ decision: 'accepted', gained: { train: 1 } });
  expect(gained.measurement.clear).toBe(true);
  const select = await exec<{ decision: string; liveState: string }>(world, [
    'train',
    'select',
    trainSkillPath,
    '--track',
    'contract',
    '--ledger-root',
    LEDGER_ROOT,
  ]);
  expect(select).toMatchObject({ decision: 'apply', liveState: 'winner' });
});

test('blocks a contract regression, stores it, and hides challenge assertion text', async () => {
  const world = await contractWorld();
  world.files.set(skillFile, `${skillSource()}secret\n`);
  const blocked = await contractMeasure(world, '--attempt', '1');
  expect(blocked.decision).toMatchObject({
    decision: 'blocked',
    gained: { train: 1, validation: 0 },
    regressed: { train: 0, validation: 1 },
  });
  expect(String(world.files.get(CONTRACT_LEDGER))).toContain(
    '"regressedIds":["challenge:forbidden-text:1"]',
  );
  expect(JSON.stringify(blocked)).not.toContain('Found forbidden');
  expect(JSON.stringify(blocked.measurement)).not.toContain('secret');
  world.files.set(skillFile, skillSource().replace('contract', 'agreement'));
  const stuck = await contractMeasure(world, '--attempt', '2');
  expect(stuck.decision?.reason).toBe('The candidate source is identical to the baseline source.');
});

test('lists contract candidate failures in detail and applies the edit cap', async () => {
  const world = await contractWorld();
  const unchanged = await contractMeasure(world, '--attempt', '1');
  expect(JSON.stringify(unchanged.measurement.trainQueries)).toContain('Missing contract');
  expect(unchanged.measurement.validationFailures).toBe(0);
  world.files.set(skillFile, skillSource('y'.repeat(1025)).replace('contract', 'agreement'));
  const invalid = await contractMeasure(
    world,
    '--attempt',
    '3',
    '--max-description-change',
    WIDE_CAP,
  );
  expect(invalid.decision?.reason).toContain('Deterministic check failed');
  const longBody = Array.from({ length: 41 }, (_, index) => `rule ${index}`).join('\n');
  world.files.set(skillFile, `${skillSource()}${longBody}\n`);
  const before = snapshotOf(world);
  await expect(contractMeasure(world, '--attempt', '2')).rejects.toThrow('the cap is 40');
  expect(snapshotOf(world)).toBe(before);
});
