import { expect, mock, test } from 'bun:test';

import { runSkillManagerRatchet } from '../../scripts/skill-manager-evaluation.js';

const matrixCase = (visibility: 'candidate' | 'challenge') =>
  JSON.stringify({
    assertions: [
      {
        expected: visibility === 'candidate' ? 'required rule' : 'forbidden rule',
        kind: visibility === 'candidate' ? 'required-text' : 'forbidden-text',
      },
    ],
    failureMode: 'The instruction contract is violated.',
    id: visibility,
    independentVerifier: 'source-structure',
    repairBoundary: 'One instruction file.',
    scenario: `The ${visibility} case remains enforced.`,
    visibility,
  });

const legacyMatrix = [matrixCase('candidate'), matrixCase('challenge')].join('\n');

const querySet = (extra = false): string =>
  JSON.stringify({
    queries: [
      { id: 'train-positive', query: 'do the scoped task', should_trigger: true, split: 'train' },
      { id: 'train-negative', query: 'explain a rule', should_trigger: false, split: 'train' },
      {
        id: 'validation-positive',
        query: 'perform the scoped task',
        should_trigger: true,
        split: 'validation',
      },
      ...(extra
        ? [
            {
              id: 'validation-extra',
              query: 'another scoped task',
              should_trigger: true,
              split: 'validation',
            },
          ]
        : []),
      {
        id: 'validation-negative',
        query: 'summarize a rule',
        should_trigger: false,
        split: 'validation',
      },
    ],
    runs_per_query: 3,
    skill_name: 'skill-manager',
  });

const contractCase = {
  assertions: [
    { expected: 'required rule one', kind: 'required-text' },
    { expected: 'required rule two', kind: 'required-text' },
  ],
  failureMode: 'A required root rule is missing.',
  id: 'contract-row',
  independentVerifier: 'matrix-shape',
  kind: 'contract',
  repairBoundary: 'Root instruction wording only.',
  scenario: 'Root contract behavior stays intact.',
  visibility: 'candidate',
};

const behaviorCase = (id: string, task = 'Use the repository wrapper.') => ({
  expectedOutcomes: ['Use the approved wrapper.'],
  failureMode: 'The task is completed without wrapper evidence.',
  fixture: 'A repository with one source symbol.',
  forbiddenOutcomes: ['Use a direct search command.'],
  hardAssertions: [{ expected: 'repo-search', id: 'wrapper-used', kind: 'trace-contains' }],
  id,
  kind: 'behavior',
  repairBoundary: 'One read-only lookup.',
  rubricAxes: {
    'negative-constraint-adherence': 'The trace uses only the approved wrapper.',
    'schema-diff-integrity': 'The output reports the evidence-backed path.',
    'scope-discipline': 'The task makes no repository edits.',
    'step-sequence-compliance': 'The trace shows search before the answer.',
  },
  split: 'train',
  task,
  taskFamily: 'repository-discovery',
});

const jsonl = (...cases: readonly unknown[]): string =>
  `${cases.map((item) => JSON.stringify(item)).join('\n')}\n`;

const runRatchet = async (args: readonly string[], contents: ReadonlyMap<string, string>) => {
  const read = mock(async (path: string) => contents.get(path) ?? '');
  const write = mock();
  await runSkillManagerRatchet(args, read, write, () => 'usage');
  return JSON.parse(String(write.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
};

test('preserves legacy matrix and query-set ratchets', async () => {
  const contents = new Map([
    ['/previous.jsonl', legacyMatrix],
    ['/same.jsonl', legacyMatrix],
    ['/blank-legacy.jsonl', `\n${legacyMatrix}`],
    ['/weakened.jsonl', matrixCase('candidate')],
    ['/queries.json', querySet()],
    ['/grown.json', querySet(true)],
    ['/retirements.json', JSON.stringify({ retirements: [], schemaVersion: 1 })],
  ]);

  await expect(
    runRatchet(['ratchet', '/previous.jsonl', '/same.jsonl'], contents),
  ).resolves.toMatchObject({ status: 'ratchet-ok' });
  await expect(
    runRatchet(['ratchet', '/blank-legacy.jsonl', '/same.jsonl'], contents),
  ).resolves.toMatchObject({ status: 'ratchet-ok' });
  await expect(
    runRatchet(['ratchet', '/previous.jsonl', '/same.jsonl', '/retirements.json'], contents),
  ).rejects.toThrow('Retirement manifests require versioned evaluation case records.');
  await expect(
    runRatchet(['ratchet', '/queries.json', '/grown.json'], contents),
  ).resolves.toMatchObject({ status: 'ratchet-ok' });
  await expect(
    runRatchet(['ratchet', '/previous.jsonl', '/weakened.jsonl'], contents),
  ).rejects.toThrow('Case challenge was removed.');
  await expect(
    runRatchet(['ratchet', '/queries.json', '/queries.jsonl'], contents),
  ).rejects.toThrow('usage');
});

test('migrates archived contract-only rows into versioned mixed case sets', async () => {
  const legacyCases = ['candidate', 'challenge'].map(
    (visibility) =>
      JSON.parse(matrixCase(visibility as 'candidate' | 'challenge')) as Record<string, unknown>,
  );
  const next = jsonl(
    ...legacyCases.map((item) => ({ ...item, kind: 'contract' })),
    behaviorCase('behavior-row'),
  );
  const contents = new Map([
    ['/archived.jsonl', legacyMatrix],
    ['/central.jsonl', next],
  ]);

  await expect(
    runRatchet(['ratchet', '/archived.jsonl', '/central.jsonl'], contents),
  ).resolves.toMatchObject({
    addedCaseIds: ['behavior-row'],
    caseCounts: { next: 3, previous: 2 },
    schemaVersion: 2,
    status: 'ratchet-ok',
  });
});

test('rejects malformed legacy rows while reading a versioned case set', async () => {
  const next = jsonl(contractCase, behaviorCase('behavior-row'));
  for (const [previous, error] of [
    ['{invalid json', 'Evaluation case line 1 is not valid JSON.'],
    ['null', 'Evaluation case must be a JSON object.'],
  ]) {
    const contents = new Map([
      ['/previous.jsonl', previous],
      ['/next.jsonl', next],
    ]);
    await expect(
      runRatchet(['ratchet', '/previous.jsonl', '/next.jsonl'], contents),
    ).rejects.toThrow(error);
  }
});

test('ratchets mixed versioned cases and requires explicit reasons for retirement', async () => {
  const previous = jsonl(contractCase, behaviorCase('behavior-row'));
  const next = jsonl(
    contractCase,
    behaviorCase('behavior-row'),
    behaviorCase('another-new-behavior-row', 'Inspect another named symbol.'),
    behaviorCase('new-behavior-row', 'Read the named symbol.'),
  );
  const reducedContract = jsonl(
    { ...contractCase, assertions: [contractCase.assertions[0]] },
    behaviorCase('behavior-row'),
  );
  const changedBehavior = jsonl(
    contractCase,
    behaviorCase('behavior-row', 'Use a different task.'),
  );
  const removedBehavior = jsonl(contractCase);
  const validRetirement = JSON.stringify({
    retirements: [
      { caseId: 'behavior-row', reason: 'The fixture no longer represents a supported user task.' },
    ],
    schemaVersion: 1,
  });
  const staleRetirement = JSON.stringify({
    retirements: [{ caseId: 'missing-row', reason: 'No longer needed.' }],
    schemaVersion: 1,
  });
  const malformedRetirement = JSON.stringify({ retirements: [], schemaVersion: 2 });
  const duplicateRetirement = JSON.stringify({
    retirements: [
      { caseId: 'behavior-row', reason: 'First reason.' },
      { caseId: 'behavior-row', reason: 'Duplicate reason.' },
    ],
    schemaVersion: 1,
  });
  const changedKind = jsonl(contractCase, { ...contractCase, id: 'behavior-row' });
  const contents = new Map([
    ['/previous.jsonl', previous],
    ['/next.jsonl', next],
    ['/reduced.jsonl', reducedContract],
    ['/changed.jsonl', changedBehavior],
    ['/removed.jsonl', removedBehavior],
    ['/valid-retirement.json', validRetirement],
    ['/stale-retirement.json', staleRetirement],
    ['/malformed-retirement.json', malformedRetirement],
    ['/duplicate-retirement.json', duplicateRetirement],
    ['/invalid-retirement.json', '{invalid json'],
    ['/changed-kind.jsonl', changedKind],
  ]);

  await expect(
    runRatchet(['ratchet', '/previous.jsonl', '/next.jsonl'], contents),
  ).resolves.toMatchObject({
    addedCaseIds: ['another-new-behavior-row', 'new-behavior-row'],
    caseCounts: { next: 4, previous: 2 },
    schemaVersion: 2,
    status: 'ratchet-ok',
  });
  await expect(
    runRatchet(['ratchet', '/previous.jsonl', '/changed-kind.jsonl'], contents),
  ).rejects.toThrow('Case behavior-row changed kind.');
  await expect(
    runRatchet(['ratchet', '/previous.jsonl', '/reduced.jsonl'], contents),
  ).rejects.toThrow('dropped required-text assertion: required rule two');
  await expect(
    runRatchet(['ratchet', '/previous.jsonl', '/changed.jsonl'], contents),
  ).rejects.toThrow('Behavior case behavior-row changed its frozen record.');
  await expect(
    runRatchet(['ratchet', '/previous.jsonl', '/removed.jsonl'], contents),
  ).rejects.toThrow('Case behavior-row was removed without an owner-local retirement record.');
  await expect(
    runRatchet(
      ['ratchet', '/previous.jsonl', '/removed.jsonl', '/valid-retirement.json'],
      contents,
    ),
  ).resolves.toMatchObject({
    retiredCaseIds: ['behavior-row'],
    status: 'ratchet-ok',
  });
  await expect(
    runRatchet(
      ['ratchet', '/previous.jsonl', '/removed.jsonl', '/stale-retirement.json'],
      contents,
    ),
  ).rejects.toThrow('Retirement missing-row does not match a previous case.');
  await expect(
    runRatchet(
      ['ratchet', '/previous.jsonl', '/removed.jsonl', '/invalid-retirement.json'],
      contents,
    ),
  ).rejects.toThrow('Retirement manifest is not valid JSON.');
  await expect(
    runRatchet(
      ['ratchet', '/previous.jsonl', '/removed.jsonl', '/malformed-retirement.json'],
      contents,
    ),
  ).rejects.toThrow('Retirement manifest must contain schemaVersion 1 and a retirements array.');
  await expect(
    runRatchet(
      ['ratchet', '/previous.jsonl', '/removed.jsonl', '/duplicate-retirement.json'],
      contents,
    ),
  ).rejects.toThrow('Retirement record 2 is malformed or duplicated.');
  await expect(
    runRatchet(
      ['ratchet', '/previous.jsonl', '/removed.jsonl', '/valid-retirement.json'],
      contents,
    ),
  ).resolves.toMatchObject({ status: 'ratchet-ok' });
});
