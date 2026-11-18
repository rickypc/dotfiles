import { expect, mock, test } from 'bun:test';

import { run } from '../../../scripts/skill-manager/index.js';
import { fingerprint } from '../../../utils/quality-engine/packet.js';

const skillSource = (): string =>
  '---\nname: skill-manager\ndescription: Manage skills.\n---\n\n# Skill Manager\n\ncontract\n';

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

const sharedRubricSource = [
  '---',
  'acceptanceRule: all-hard-assertions-and-axes-pass',
  'aggregateScore: none',
  'axes:',
  '  negative-constraint-adherence:',
  '    evidence: Captured output, tool trace, and changed-file diff.',
  '    fail: A forbidden outcome appears in output, trace, or diff.',
  '    pass: No forbidden outcome appears in captured evidence.',
  '  schema-diff-integrity:',
  '    evidence: Changed-file diff and parsed structure.',
  '    fail: An unrelated structure or data field changed.',
  '    pass: Only the requested structure and data changed.',
  '  scope-discipline:',
  '    evidence: Changed-path list and declared repair boundary.',
  '    fail: A changed path is outside the declared boundary.',
  '    pass: Every changed path is inside the declared boundary.',
  '  step-sequence-compliance:',
  '    evidence: Captured tool trace with ordered steps.',
  '    fail: A required action is missing, skipped, or reordered.',
  '    pass: Required actions appear in the required order.',
  'graderDisagreement: block',
  'minimumPassRate: 1',
  'requiredCaseFields:',
  '  contract: [kind, id, visibility, scenario, assertions, failureMode, repairBoundary, independentVerifier]',
  '  behavior: [kind, id, split, taskFamily, task, fixture, expectedOutcomes, forbiddenOutcomes, hardAssertions, rubricAxes, failureMode, repairBoundary]',
  'requiredSplits: [train, validation, challenge]',
  'requiredVisibility: [candidate, challenge]',
  'schemaVersion: 2',
  'verifierIds: [matrix-shape, source-structure]',
  '---',
].join('\n');

const matrixSource = ['candidate', 'challenge']
  .map((visibility) =>
    JSON.stringify({
      assertions: [
        {
          expected: visibility === 'candidate' ? 'contract' : 'secret',
          kind: visibility === 'candidate' ? 'required-text' : 'forbidden-text',
        },
      ],
      failureMode: 'The contract is violated.',
      id: visibility,
      independentVerifier: 'source-structure',
      repairBoundary: 'SKILL.md',
      scenario: visibility,
      visibility,
    }),
  )
  .join('\n');

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

const execute = async <T>(
  world: ReturnType<typeof createWorld>,
  args: readonly string[],
): Promise<T> => {
  const write = mock();
  await run(args, undefined, write, world.fileSystem);
  return JSON.parse(String(write.mock.calls.at(-1)?.[0])) as T;
};

const triggerQueries = (): string =>
  JSON.stringify({
    queries: ['train', 'validation'].flatMap((split) => [
      { id: `${split}-p1`, query: `${split} positive task one`, should_trigger: true, split },
      { id: `${split}-p2`, query: `${split} positive task two`, should_trigger: true, split },
      { id: `${split}-n1`, query: `${split} unrelated question one`, should_trigger: false, split },
      { id: `${split}-n2`, query: `${split} unrelated question two`, should_trigger: false, split },
    ]),
    runs_per_query: 3,
    skill_name: 'skill-manager',
  });

const createWorld = () => {
  const root = import.meta.dir.replace(/\/tests\/scripts\/skill-manager$/u, '');
  const skillPath = `${root}/skills/skill-manager`;
  const sourcePath = `${skillPath}/SKILL.md`;
  const ownerRelative = 'evals/skills/skill-manager';
  const ownerRoot = `${root}/${ownerRelative}`;
  const casesPath = `${ownerRelative}/cases.jsonl`;
  const triggerPath = `${ownerRelative}/trigger-queries.json`;
  const rubricPath = `${ownerRelative}/rubric.md`;
  const comprehensionPath = `${ownerRelative}/comprehension/SKILL.json`;
  const sourceText = skillSource();
  const triggerSource = triggerQueries();
  const cases = matrixSource
    .split('\n')
    .map((line) => JSON.stringify({ kind: 'contract', ...(JSON.parse(line) as object) }))
    .join('\n');
  const manifest = {
    artifacts: {
      activationQueries: triggerPath,
      cases: casesPath,
      comprehension: [
        {
          queryCount: 4,
          queryIds: ['t1', 't2', 'v1', 'v2'],
          setPath: comprehensionPath,
          sourcePath: 'skills/skill-manager/SKILL.md',
        },
        {
          queryCount: 4,
          queryIds: ['t1', 't2', 'v1', 'v2'],
          setPath: `${ownerRelative}/comprehension/rubric.json`,
          sourcePath: rubricPath,
        },
      ],
    },
    fingerprints: {
      activationQueriesSha256: fingerprint(triggerSource),
      casesSha256: fingerprint(cases),
      sourceRubricSha256: fingerprint(rubricSource),
    },
    manifestVersion: 1,
    ownerId: 'skill:skill-manager',
    schemaVersion: 2,
    scope: 'evals/skills/skill-manager/',
    sharedRubric: 'evals/rubric.md',
    sourceRubric: rubricPath,
    sources: [
      { sha256: fingerprint(sourceText), sourcePath: 'skills/skill-manager/SKILL.md' },
      { sha256: fingerprint(rubricSource), sourcePath: rubricPath },
    ],
  };
  const files = new Map<string, string>([
    [sourcePath, sourceText],
    [
      `${root}/skills/knowledge-base/SKILL.md`,
      '---\nname: knowledge-base\ndescription: KB owner.\n---\n# KB',
    ],
    [`${root}/evals/rubric.md`, sharedRubricSource],
    [`${ownerRoot}/manifest.json`, JSON.stringify(manifest)],
    [`${root}/${casesPath}`, cases],
    [`${root}/${triggerPath}`, triggerSource],
    [`${root}/${rubricPath}`, rubricSource],
    [
      `${root}/${comprehensionPath}`,
      comprehensionSource('skill-manager--SKILL', '../../../../skills/skill-manager/SKILL.md'),
    ],
    [
      `${ownerRoot}/comprehension/rubric.json`,
      comprehensionSource('skill-manager--rubric', '../rubric.md'),
    ],
    [`${skillPath}/evals/cases.jsonl`, matrixSource],
    [`${skillPath}/evals/rubric.md`, rubricSource],
    [`${skillPath}/evals/trigger-queries.json`, triggerSource],
    [
      `${skillPath}/evals/comprehension/SKILL.json`,
      comprehensionSource('skill-manager--SKILL', '../../SKILL.md'),
    ],
    [
      `${skillPath}/evals/comprehension/evals-rubric.json`,
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
          const remainder = file.slice(prefix.length);
          const [name = ''] = remainder.split('/');
          children.set(name, remainder.includes('/') || children.get(name) === true);
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
  return { fileSystem, files, root, skillPath };
};

test('scopes interleaved contract and activation history in the owner ledger', async () => {
  const world = createWorld();
  const ownerLedger = `${world.root}/evals/skills/skill-manager/ledger.jsonl`;
  const responsesPath = '/tmp/skill-manager-owner-ledger-answers.jsonl';
  const triggerSet = JSON.parse(triggerQueries()) as {
    queries: { id: string; should_trigger: boolean }[];
  };
  world.files.set(
    responsesPath,
    `${triggerSet.queries
      .flatMap(({ id, should_trigger }) =>
        [1, 2, 3].map((run) =>
          JSON.stringify({
            query_id: id,
            run,
            skill_name: should_trigger ? 'skill-manager' : 'knowledge-base',
          }),
        ),
      )
      .join('\n')}\n`,
  );

  const activation = await execute<{ ledger: { entries: number; entryId: string; path: string } }>(
    world,
    ['train', 'measure', world.skillPath, responsesPath, '--measure-only'],
  );
  const contract = await execute<{ ledger: { entries: number; entryId: string; path: string } }>(
    world,
    ['train', 'measure', world.skillPath, '--track', 'contract', '--measure-only'],
  );
  expect(activation.ledger).toMatchObject({ entries: 1, path: ownerLedger });
  expect(contract.ledger).toMatchObject({ entries: 2, path: ownerLedger });

  const lines = String(world.files.get(ownerLedger)).trim().split('\n');
  const entry = JSON.parse(lines[1] ?? '') as Record<string, unknown>;
  world.files.set(
    ownerLedger,
    `${lines.join('\n')}\n${JSON.stringify({
      ...entry,
      attempt: 3,
      id: 'skill-manager-contract-attempt-3',
      sourceFingerprint: fingerprint(skillSource().replace('\ncontract\n', '\ncontract revised\n')),
      status: 'attempt',
      timestamp: '2026-11-14T00:00:00.000Z',
    })}\n`,
  );

  const contractSelection = await execute<{
    attempts: unknown[];
    baseline: { entryId: string };
    decision: string;
  }>(world, ['train', 'select', world.skillPath, '--track', 'contract']);
  const activationSelection = await execute<{
    attempts: unknown[];
    baseline: { entryId: string };
    decision: string;
  }>(world, ['train', 'select', world.skillPath]);
  expect(contractSelection).toMatchObject({
    attempts: [expect.anything()],
    baseline: { entryId: contract.ledger.entryId },
    decision: 'keep-baseline',
  });
  expect(activationSelection).toMatchObject({
    attempts: [],
    baseline: { entryId: activation.ledger.entryId },
    decision: 'keep-baseline',
  });
});
