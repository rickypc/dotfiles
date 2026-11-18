import { expect, mock, test } from 'bun:test';
import * as realOs from 'node:os';
import * as path from 'node:path';
import realMatter from 'gray-matter';

let mockedHome = '/test-home';

mock.module('node:path', () => path);
mock.module('node:os', () => ({ ...realOs, homedir: mock(() => mockedHome) }));
mock.module('gray-matter', () => ({ default: realMatter }));

const { validateSkillEvaluations } = await import('../../../utils/skill-manager/index.js');
const { run: runSkillManager } = await import('../../../scripts/skill-manager/index.js');

const sharedRubric = [
  '---',
  'schemaVersion: 2',
  'acceptanceRule: all-hard-assertions-and-axes-pass',
  'aggregateScore: none',
  'graderDisagreement: block',
  'minimumPassRate: 1',
  'requiredCaseFields:',
  '  contract: [kind, id, visibility, scenario, assertions, failureMode, repairBoundary, independentVerifier]',
  '  behavior: [kind, id, split, taskFamily, task, fixture, expectedOutcomes, forbiddenOutcomes, hardAssertions, rubricAxes, failureMode, repairBoundary]',
  'requiredSplits: [train, validation, challenge]',
  'requiredVisibility: [candidate, challenge]',
  'verifierIds: [matrix-shape, source-structure]',
  'axes:',
  '  schema-diff-integrity: { evidence: structure, pass: scoped, fail: unrelated }',
  '  negative-constraint-adherence: { evidence: output, pass: no forbidden outcome, fail: forbidden outcome }',
  '  step-sequence-compliance: { evidence: trace, pass: ordered, fail: missing or reordered }',
  '  scope-discipline: { evidence: paths, pass: owned, fail: outside boundary }',
  '---',
  '',
  '# Shared rubric',
].join('\n');

const skillSource = [
  '---',
  'name: demo',
  'description: Demo skill.',
  '---',
  '',
  '# Demo',
  '',
  'contract',
].join('\n');

const sourceRubric = '# Local source rubric';
const queryIds = ['t1', 't2', 'v1', 'v2'];

const comprehensionSetFor = (subject: string, target: string): string =>
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

const evaluationCasesFor = (): string =>
  `${[
    {
      assertions: [{ expected: 'contract', kind: 'required-text' }],
      failureMode: 'missing contract',
      id: 'candidate',
      independentVerifier: 'source-structure',
      kind: 'contract',
      repairBoundary: 'SKILL.md',
      scenario: 'contract',
      visibility: 'candidate',
    },
    {
      assertions: [{ expected: 'secret', kind: 'forbidden-text' }],
      failureMode: 'secret leak',
      id: 'challenge',
      independentVerifier: 'source-structure',
      kind: 'contract',
      repairBoundary: 'SKILL.md',
      scenario: 'safety',
      visibility: 'challenge',
    },
  ]
    .map((row) => JSON.stringify(row))
    .join('\n')}\n`;

const queryResponsesFor = (answerById: Readonly<Record<string, string>>): string =>
  `${queryIds
    .flatMap((id) =>
      [1, 2, 3].map((run) =>
        JSON.stringify({
          answer: answerById[id] ?? 'A',
          query_id: id,
          run,
        }),
      ),
    )
    .join('\n')}\n`;

const sha256For = (value: string): string => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(value);
  return hasher.digest('hex');
};

const triggerQueriesFor = (): string =>
  JSON.stringify({
    pass_threshold: 0.5,
    queries: ['train', 'validation'].flatMap((split) => [
      { id: `${split}-p1`, query: `${split} positive one`, should_trigger: true, split },
      { id: `${split}-p2`, query: `${split} positive two`, should_trigger: true, split },
      { id: `${split}-n1`, query: `${split} negative one`, should_trigger: false, split },
      { id: `${split}-n2`, query: `${split} negative two`, should_trigger: false, split },
    ]),
    runs_per_query: 3,
    skill_name: 'demo',
  });

const centralSkillFixtureFor = (
  manifestOverride?: Record<string, unknown> | null,
  agentsRoot = '/test-home/.agents',
) => {
  const skillPath = `${agentsRoot}/skills/demo`;
  const cases = evaluationCasesFor();
  const triggerQueries = triggerQueriesFor();
  const casesManifest = {
    artifacts: {
      activationQueries: 'evals/skills/demo/trigger-queries.json',
      cases: 'evals/skills/demo/cases.jsonl',
      comprehension: [
        {
          queryCount: 4,
          queryIds,
          setPath: 'evals/skills/demo/comprehension/SKILL.json',
          sourcePath: 'skills/demo/SKILL.md',
        },
        {
          queryCount: 4,
          queryIds,
          setPath: 'evals/skills/demo/comprehension/evals-rubric.json',
          sourcePath: 'evals/skills/demo/rubric.md',
        },
      ],
    },
    fingerprints: {
      activationQueriesSha256: sha256For(triggerQueries),
      casesSha256: sha256For(cases),
      sourceRubricSha256: sha256For(sourceRubric),
    },
    manifestVersion: 1,
    ownerId: 'skill:demo',
    requiredLanes: ['contract', 'behavior', 'comprehension', 'activation'],
    schemaVersion: 2,
    scope: 'evals/skills/demo/',
    sharedRubric: 'evals/rubric.md',
    sourceRubric: 'evals/skills/demo/rubric.md',
    sources: [
      { sha256: sha256For(skillSource), sourcePath: 'skills/demo/SKILL.md' },
      { sha256: sha256For(sourceRubric), sourcePath: 'evals/skills/demo/rubric.md' },
    ],
  };
  const manifest = manifestOverride === null ? undefined : (manifestOverride ?? casesManifest);
  const files = new Map<string, string>([
    [`${skillPath}/SKILL.md`, skillSource],
    [`${skillPath}/evals/cases.jsonl`, '{}'],
    [`${skillPath}/evals/rubric.md`, '# Legacy rubric'],
    [`${skillPath}/evals/trigger-queries.json`, '{ invalid legacy trigger set'],
    [`${agentsRoot}/evals/rubric.md`, sharedRubric],
    [`${agentsRoot}/evals/skills/demo/cases.jsonl`, cases],
    [`${agentsRoot}/evals/skills/demo/rubric.md`, sourceRubric],
    [`${agentsRoot}/evals/skills/demo/trigger-queries.json`, triggerQueries],
    [
      `${agentsRoot}/evals/skills/demo/comprehension/SKILL.json`,
      comprehensionSetFor('demo--SKILL', '../../../../skills/demo/SKILL.md'),
    ],
    [
      `${agentsRoot}/evals/skills/demo/comprehension/evals-rubric.json`,
      comprehensionSetFor('demo--evals-rubric', '../rubric.md'),
    ],
  ]);
  if (manifest !== undefined) {
    files.set(`${agentsRoot}/evals/skills/demo/manifest.json`, JSON.stringify(manifest));
  }
  const reads: string[] = [];
  const directories: Record<string, readonly string[]> = {
    [agentsRoot]: ['evals', 'skills'],
    [`${agentsRoot}/skills`]: ['demo'],
    [skillPath]: ['SKILL.md', 'evals'],
    [`${skillPath}/evals`]: ['cases.jsonl', 'rubric.md', 'trigger-queries.json', 'comprehension'],
    [`${skillPath}/evals/comprehension`]: ['SKILL.json', 'evals-rubric.json'],
  };
  return {
    fileSystem: {
      exists: async (path: string) => files.has(path),
      mkdir: async () => undefined,
      readdir: async (path: string) =>
        (directories[path] ?? []).map((name) => ({
          isDirectory: () => directories[`${path}/${name}`] !== undefined,
          name,
        })),
      readFile: async (path: string): Promise<string> => {
        reads.push(path);
        const content = files.get(path);
        if (content === undefined) {
          throw new Error(`Missing ${path}`);
        }
        return content;
      },
      rm: async (path: string) => {
        files.delete(path);
      },
      writeFile: async (path: string, content: string) => {
        files.set(path, content);
      },
    },
    files,
    manifestPath: `${agentsRoot}/evals/skills/demo/manifest.json`,
    reads,
    skillPath,
  };
};

const withGlobalSkillManagerRoot = async <T>(
  work: (fixture: ReturnType<typeof centralSkillFixtureFor>, root: string) => Promise<T>,
): Promise<T> => {
  const priorHome = mockedHome;
  const root = path.resolve(import.meta.dir, '../../..');
  mockedHome = path.dirname(root);
  try {
    return await work(centralSkillFixtureFor(undefined, root), root);
  } finally {
    mockedHome = priorHome;
  }
};

test('central training commands resolve source ownership and record under the central skill ledger', async () => {
  await withGlobalSkillManagerRoot(async (fixture, root) => {
    const output: string[] = [];
    await runSkillManager(
      ['train', 'bundle', fixture.skillPath],
      undefined,
      (message) => output.push(message),
      fixture.fileSystem,
    );
    expect(JSON.parse(output[0] ?? '{}')).toHaveProperty('prompts');

    output.length = 0;
    await runSkillManager(
      ['train', 'measure', fixture.skillPath, '--track', 'contract', '--measure-only'],
      undefined,
      (message) => output.push(message),
      fixture.fileSystem,
    );
    const receipt = JSON.parse(output[0] ?? '{}') as { ledger?: { path?: string } };
    expect(receipt.ledger?.path).toBe(`${root}/evals/skills/demo/ledger.jsonl`);
  });
});

test('central training commands reject stale activation and case fingerprints', async () => {
  await withGlobalSkillManagerRoot(async (fixture) => {
    fixture.files.set(`${fixture.skillPath}/evals/trigger-queries.json`, triggerQueriesFor());
    fixture.files.set(
      `${fixture.skillPath}/evals/comprehension/answers.jsonl`,
      queryResponsesFor({}),
    );
    const activationPath = `${path.resolve(import.meta.dir, '../../..')}/evals/skills/demo/trigger-queries.json`;
    fixture.files.set(activationPath, `${fixture.files.get(activationPath)} `);
    await expect(
      runSkillManager(
        ['train', 'bundle', fixture.skillPath],
        undefined,
        () => undefined,
        fixture.fileSystem,
      ),
    ).rejects.toThrow('activation-query fingerprint is stale');

    const root = path.resolve(import.meta.dir, '../../..');
    const casePath = `${root}/evals/skills/demo/cases.jsonl`;
    fixture.files.set(casePath, `${fixture.files.get(casePath)} `);
    await expect(
      runSkillManager(
        ['train', 'measure', fixture.skillPath, '--track', 'contract', '--measure-only'],
        undefined,
        () => undefined,
        fixture.fileSystem,
      ),
    ).rejects.toThrow('case-matrix fingerprint is stale');
  });
});

test('central comprehension measurements resolve source scopes and persist under their owners', async () => {
  await withGlobalSkillManagerRoot(async (fixture, root) => {
    const cases = [
      {
        ledgerPath: `${root}/evals/skills/demo/ledger.jsonl`,
        responsesPath: `${root}/evals/skills/demo/responses.jsonl`,
        setPath: `${root}/evals/skills/demo/comprehension/evals-rubric.json`,
      },
      {
        ledgerPath: `${root}/evals/ledger.jsonl`,
        responsesPath: `${root}/evals/comprehension/answers.jsonl`,
        setPath: `${root}/evals/comprehension/AGENTS.json`,
      },
      {
        ledgerPath: `${root}/plans/${root.replace(/^\/+/, '').replaceAll('/', '-')}/quality/catalog.json`,
        responsesPath: `${root}/evals/skills/_catalog/comprehension/answers.jsonl`,
        setPath: `${root}/evals/skills/_catalog/comprehension/catalog.json`,
      },
    ];
    fixture.files.set(
      cases[0]?.setPath ?? '',
      comprehensionSetFor('demo--evals-rubric', '../rubric.md'),
    );
    fixture.files.set(cases[1]?.setPath ?? '', comprehensionSetFor('AGENTS', '../../AGENTS.md'));
    fixture.files.set(`${root}/AGENTS.md`, '# Root guidance');
    fixture.files.set(cases[2]?.setPath ?? '', comprehensionSetFor('catalog', '../rubric.md'));
    fixture.files.set(`${root}/evals/skills/_catalog/rubric.md`, '# Catalog guidance');
    for (const item of cases) {
      fixture.files.set(item.responsesPath, queryResponsesFor({}));
      const output: string[] = [];
      await runSkillManager(
        ['train', 'measure', item.setPath, item.responsesPath, '--measure-only'],
        undefined,
        (message) => output.push(message),
        fixture.fileSystem,
      );
      const receipt = JSON.parse(output[0] ?? '{}') as { ledger?: { path?: string } };
      expect(receipt.ledger?.path).toBe(item.ledgerPath);
    }
  });
});

test('central source ownership falls back for out-of-root, non-owner, and unmapped documents', async () => {
  await withGlobalSkillManagerRoot(async (fixture, root) => {
    const scenarios = [
      {
        id: 'outside',
        ledgerPath: `${root}/plans/Users-rhuang-.agents/quality/outside.json`,
        setPath: `${root}/evals/comprehension/outside.json`,
        target: '/tmp/outside.md',
      },
      {
        id: 'unowned',
        ledgerPath: `${root}/plans/Users-rhuang-.agents/quality/unowned.json`,
        setPath: `${root}/evals/comprehension/unowned.json`,
        target: '../other/unowned.md',
      },
      {
        id: 'unlisted',
        ledgerPath: `${root}/plans/Users-rhuang-.agents/quality/unlisted.json`,
        setPath: `${root}/evals/skills/demo/comprehension/unlisted.json`,
        target: '../unlisted.md',
      },
    ];
    for (const scenario of scenarios) {
      fixture.files.set(scenario.setPath, comprehensionSetFor(scenario.id, scenario.target));
      fixture.files.set(
        path.resolve(path.dirname(scenario.setPath), scenario.target),
        '# Unowned source',
      );
      const responsesPath = `${scenario.setPath}.answers.jsonl`;
      fixture.files.set(responsesPath, queryResponsesFor({}));
      const output: string[] = [];
      await runSkillManager(
        ['train', 'measure', scenario.setPath, responsesPath, '--measure-only'],
        undefined,
        (message) => output.push(message),
        fixture.fileSystem,
      );
      const receipt = JSON.parse(output[0] ?? '{}') as { ledger?: { path?: string } };
      expect(receipt.ledger?.path).toBe(scenario.ledgerPath);
    }
  });
});

test('non-global skill roots keep their legacy history location', async () => {
  await withGlobalSkillManagerRoot(async (fixture, root) => {
    mockedHome = '/test-home';
    const setPath = `${root}/evals/comprehension/local.json`;
    const responsesPath = `${root}/responses.jsonl`;
    fixture.files.set(setPath, comprehensionSetFor('root-doc', '../../AGENTS.md'));
    fixture.files.set(`${root}/AGENTS.md`, '# Root guidance');
    fixture.files.set(responsesPath, queryResponsesFor({}));
    const output: string[] = [];
    await runSkillManager(
      ['train', 'measure', setPath, responsesPath, '--measure-only'],
      undefined,
      (message) => output.push(message),
      fixture.fileSystem,
    );
    const receipt = JSON.parse(output[0] ?? '{}') as { ledger?: { path?: string } };
    expect(receipt.ledger?.path).toBe(`${root}/plans/Users-rhuang-.agents/quality/root-doc.json`);
  });
});

test('validates a global skill from its central manifest and ignores package-local evals', async () => {
  const fixture = centralSkillFixtureFor();
  const matrixCount = await validateSkillEvaluations(fixture.fileSystem, fixture.skillPath);
  expect(matrixCount).toBe(1);
  expect(fixture.reads).toContain('/test-home/.agents/evals/skills/demo/cases.jsonl');
  expect(fixture.reads).toContain('/test-home/.agents/evals/rubric.md');
  expect(fixture.reads).not.toContain('/test-home/.agents/skills/demo/evals/cases.jsonl');
  expect(fixture.reads).not.toContain('/test-home/.agents/skills/demo/evals/trigger-queries.json');
});

const atomsMessage = 'atoms lane and atoms artifacts must be declared together';
const mapsMessage = 'atom maps must be unique Markdown paths';
const atomMap = 'evals/skills/demo/atoms/SKILL.md';

test.each([
  ['atoms artifacts without the atoms lane', undefined, [], atomsMessage],
  ['atoms lane without atoms artifacts', ['contract', 'atoms'], undefined, atomsMessage],
  ['atom map outside the owner scope', ['atoms'], ['evals/atoms/SKILL.md'], mapsMessage],
  ['atom map that is not Markdown', ['atoms'], ['evals/skills/demo/atoms/SKILL.json'], mapsMessage],
  ['duplicate atom maps', ['atoms'], [atomMap, atomMap], mapsMessage],
  ['atom maps that are not a list', ['atoms'], atomMap, mapsMessage],
])('rejects an inconsistent atoms lane: %s', async (_name, lanes, maps, message) => {
  const fixture = centralSkillFixtureFor();
  const manifest = JSON.parse(fixture.files.get(fixture.manifestPath) ?? '') as Record<
    string,
    unknown
  >;
  if (lanes !== undefined) {
    manifest.requiredLanes = lanes;
  }
  if (maps !== undefined) {
    (manifest.artifacts as Record<string, unknown>).atoms = maps;
  }
  fixture.files.set(fixture.manifestPath, JSON.stringify(manifest));
  await expect(validateSkillEvaluations(fixture.fileSystem, fixture.skillPath)).rejects.toThrow(
    message,
  );
});

test.each([[[]], [['evals/skills/demo/atoms/SKILL.md']]])(
  'accepts a declared atoms lane with atom maps %j',
  async (maps) => {
    const fixture = centralSkillFixtureFor();
    const manifest = JSON.parse(fixture.files.get(fixture.manifestPath) ?? '') as Record<
      string,
      unknown
    >;
    manifest.requiredLanes = ['contract', 'behavior', 'comprehension', 'activation', 'atoms'];
    (manifest.artifacts as Record<string, unknown>).atoms = maps;
    fixture.files.set(fixture.manifestPath, JSON.stringify(manifest));
    expect(await validateSkillEvaluations(fixture.fileSystem, fixture.skillPath)).toBe(1);
  },
);

test('fails closed when a global skill manifest is missing despite complete legacy evals', async () => {
  const fixture = centralSkillFixtureFor(null);
  await expect(validateSkillEvaluations(fixture.fileSystem, fixture.skillPath)).rejects.toThrow(
    'central evaluation manifest is missing',
  );
  expect(fixture.reads).not.toContain('/test-home/.agents/skills/demo/evals/cases.jsonl');
});

test('rejects a central skill artifact path that escapes its owner scope', async () => {
  const fixture = centralSkillFixtureFor({
    artifacts: {
      activationQueries: 'evals/skills/demo/trigger-queries.json',
      cases: '../../../../outside.jsonl',
      comprehension: [],
    },
    manifestVersion: 1,
    ownerId: 'skill:demo',
    schemaVersion: 2,
    scope: 'evals/skills/demo/',
    sharedRubric: 'evals/rubric.md',
    sourceRubric: 'evals/skills/demo/rubric.md',
    sources: [],
  });
  await expect(validateSkillEvaluations(fixture.fileSystem, fixture.skillPath)).rejects.toThrow(
    'cases path must stay inside the central skill scope',
  );
  expect(fixture.reads).not.toContain('/test-home/outside.jsonl');
});

test('rejects malformed central artifact and comprehension mappings', async () => {
  const invalidCases: readonly [string, (manifest: Record<string, unknown>) => void, string][] = [
    [
      'artifacts object',
      (manifest) => {
        manifest.artifacts = null;
      },
      'invalid artifacts',
    ],
    [
      'activation path',
      (manifest) => {
        (manifest.artifacts as Record<string, unknown>).activationQueries = 'outside.json';
      },
      'activation path must stay inside',
    ],
    [
      'empty comprehension inventory',
      (manifest) => {
        (manifest.artifacts as Record<string, unknown>).comprehension = [];
      },
      'requires per-source comprehension sets',
    ],
    [
      'missing fingerprints',
      (manifest) => {
        manifest.fingerprints = null;
      },
      'requires input fingerprints',
    ],
    [
      'incomplete fingerprints',
      (manifest) => {
        manifest.fingerprints = { casesSha256: 'case', sourceRubricSha256: 'rubric' };
      },
      'incomplete input fingerprints',
    ],
    [
      'non-object comprehension row',
      (manifest) => {
        (manifest.artifacts as Record<string, unknown>).comprehension = [null];
      },
      'entries must be objects',
    ],
    [
      'comprehension row outside owner scope',
      (manifest) => {
        const artifacts = manifest.artifacts as Record<string, unknown>;
        const rows = artifacts.comprehension as Record<string, unknown>[];
        rows[0] = { ...rows[0], setPath: 'evals/other/comprehension/SKILL.json' };
      },
      'missing, duplicate, or outside its owner scope',
    ],
    [
      'comprehension set escaping after normalization',
      (manifest) => {
        const artifacts = manifest.artifacts as Record<string, unknown>;
        const rows = artifacts.comprehension as Record<string, unknown>[];
        rows[0] = {
          ...rows[0],
          setPath: 'evals/skills/demo/comprehension/../../../../outside.json',
        };
      },
      'escapes its owner scope',
    ],
    [
      'incomplete comprehension inventory',
      (manifest) => {
        const artifacts = manifest.artifacts as Record<string, unknown>;
        artifacts.comprehension = (artifacts.comprehension as unknown[]).slice(0, 1);
      },
      'inventory is incomplete',
    ],
  ];

  for (const [label, update, expectedMessage] of invalidCases) {
    const fixture = centralSkillFixtureFor();
    const manifestText = fixture.files.get(fixture.manifestPath);
    expect(manifestText, label).toBeDefined();
    const manifest = JSON.parse(manifestText ?? '') as Record<string, unknown>;
    update(manifest);
    fixture.files.set(fixture.manifestPath, JSON.stringify(manifest));
    await expect(
      validateSkillEvaluations(fixture.fileSystem, fixture.skillPath),
      label,
    ).rejects.toThrow(expectedMessage);
  }
});

test('rejects malformed central source inventories and owner metadata', async () => {
  const invalidCases: readonly [string, (manifest: Record<string, unknown>) => void, string][] = [
    [
      'missing source inventory',
      (manifest) => {
        delete manifest.sources;
      },
      'requires a source inventory',
    ],
    [
      'non-object source entry',
      (manifest) => {
        manifest.sources = [null];
      },
      'source entries must be objects',
    ],
    [
      'duplicate source entry',
      (manifest) => {
        const sources = manifest.sources as Record<string, unknown>[];
        manifest.sources = [sources[0], sources[0]];
      },
      'must be unique strings',
    ],
    [
      'source path outside the owner scope',
      (manifest) => {
        const sources = manifest.sources as Record<string, unknown>[];
        sources[0] = { ...sources[0], sourcePath: '../../outside.md' };
      },
      'escapes its owner scope',
    ],
    [
      'stale source fingerprint',
      (manifest) => {
        const sources = manifest.sources as Record<string, unknown>[];
        sources[0] = { ...sources[0], sha256: '0'.repeat(64) };
      },
      'source fingerprint is stale',
    ],
    [
      'missing local rubric source',
      (manifest) => {
        manifest.sources = (manifest.sources as Record<string, unknown>[]).slice(0, 1);
      },
      'local rubric source is not declared',
    ],
    [
      'incomplete source inventory',
      (manifest) => {
        manifest.sources = (manifest.sources as Record<string, unknown>[]).slice(1);
      },
      'source inventory is incomplete or stale',
    ],
    [
      'wrong central owner metadata',
      (manifest) => {
        manifest.ownerId = 'skill:other';
      },
      'does not match owner demo',
    ],
  ];

  for (const [label, update, expectedMessage] of invalidCases) {
    const fixture = centralSkillFixtureFor();
    const manifestText = fixture.files.get(fixture.manifestPath);
    expect(manifestText, label).toBeDefined();
    const manifest = JSON.parse(manifestText ?? '') as Record<string, unknown>;
    update(manifest);
    fixture.files.set(fixture.manifestPath, JSON.stringify(manifest));
    await expect(
      validateSkillEvaluations(fixture.fileSystem, fixture.skillPath),
      label,
    ).rejects.toThrow(expectedMessage);
  }
});

test('rejects non-object and invalid JSON central manifests', async () => {
  for (const [content, expectedMessage] of [
    ['{', 'invalid JSON'],
    ['[]', 'must be an object'],
  ]) {
    const fixture = centralSkillFixtureFor();
    fixture.files.set(fixture.manifestPath, content);
    await expect(validateSkillEvaluations(fixture.fileSystem, fixture.skillPath)).rejects.toThrow(
      expectedMessage,
    );
  }
});

test('rejects stale central activation, case, and comprehension inputs', async () => {
  const triggerFixture = centralSkillFixtureFor();
  triggerFixture.files.set(
    '/test-home/.agents/evals/skills/demo/trigger-queries.json',
    `${triggerQueriesFor()} `,
  );
  await expect(
    validateSkillEvaluations(triggerFixture.fileSystem, triggerFixture.skillPath),
  ).rejects.toThrow('activation-query fingerprint is stale');

  const caseFixture = centralSkillFixtureFor();
  caseFixture.files.set(
    '/test-home/.agents/evals/skills/demo/cases.jsonl',
    `${evaluationCasesFor()} `,
  );
  await expect(
    validateSkillEvaluations(caseFixture.fileSystem, caseFixture.skillPath),
  ).rejects.toThrow('case-matrix fingerprint is stale');

  const comprehensionFixture = centralSkillFixtureFor();
  const comprehensionPath = '/test-home/.agents/evals/skills/demo/comprehension/SKILL.json';
  const set = JSON.parse(comprehensionFixture.files.get(comprehensionPath) ?? '') as {
    queries: { id: string }[];
  };
  const firstQuery = set.queries[0];
  if (firstQuery) {
    firstQuery.id = 'changed-id';
  }
  comprehensionFixture.files.set(comprehensionPath, JSON.stringify(set));
  await expect(
    validateSkillEvaluations(comprehensionFixture.fileSystem, comprehensionFixture.skillPath),
  ).rejects.toThrow('comprehension IDs or count are stale');
});

test('requires a nonblank shared rubric for central skill evaluation', async () => {
  const fixture = centralSkillFixtureFor();
  fixture.files.set('/test-home/.agents/evals/rubric.md', '  \n');
  await expect(validateSkillEvaluations(fixture.fileSystem, fixture.skillPath)).rejects.toThrow(
    'nonblank evaluation rubric',
  );
});
