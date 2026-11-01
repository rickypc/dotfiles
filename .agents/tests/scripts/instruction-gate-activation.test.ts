import { describe, expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realFsPromises from 'node:fs/promises';
import * as realOs from 'node:os';
import path from 'node:path';
import type { GateDependencies, Receipt } from '../../scripts/instruction-gate.js';
import type { CommandResult, CommandSpec } from '../../utils/contracts.js';

const realProcess = await import('../../utils/process.js');
const realWeakReader = await import('../../scripts/weak-reader.js');

mock.module('node:fs/promises', () => realFsPromises);
mock.module('node:os', () => realOs);
mock.module('node:path', () => ({ default: path }));
mock.module('node:crypto', () => realCrypto);
mock.module('../utils/process.js', () => realProcess);
mock.module('./weak-reader.js', () => realWeakReader);

const {
  ROUTING_BATCH,
  ROUTING_RECEIPT,
  ROUTING_TOKEN,
  activationSkills,
  catalogSha,
  currentFingerprint,
  decide,
  record,
  routingSkillTarget,
  sealReceipt,
  verifyRouting,
} = await import('../../scripts/instruction-gate.js');

const ROOT = '/agents';
const hash = (text: string): string => `h(${text})`;
const CATALOG = [
  { description: 'Plans work.', name: 'aidp' },
  { description: 'Runs plans.', name: 'aidx' },
];
const CATALOG_SHA = hash(JSON.stringify(CATALOG));
const TRIGGERS = JSON.stringify({
  queries: [
    { id: 'a1', query: 'Plan this feature', should_trigger: true, split: 'train' },
    { id: 'a2', query: 'Say hello', should_trigger: false, split: 'train' },
    { id: 'a3', query: 'Old', retired: 'obsolete', should_trigger: true, split: 'train' },
    { id: 'av', query: 'Held out', should_trigger: true, split: 'validation' },
  ],
});
const OK: CommandResult = { code: 0, stderr: '', stdout: '' };
const fixed = { aggregate: true, fingerprintChanged: false };

const measureStdout = (passed: readonly string[], failed: readonly string[], valid = 1): string =>
  JSON.stringify({
    measurement: {
      trainQueries: [
        ...passed.map((id) => ({ id, passed: true })),
        ...failed.map((id) => ({ id, passed: false })),
      ],
      validation: { passedQueries: valid, totalQueries: 1 },
    },
  });

const makeDeps = (
  options: {
    readonly catalogBundle?: CommandResult;
    readonly measures?: Record<string, string>;
    readonly skills?: readonly string[];
    readonly skipTriggerSetFor?: string;
  } = {},
) => {
  const skills = options.skills ?? ['aidp', 'aidx'];
  const files = new Map<string, string>(
    skills
      .filter((skill) => skill !== options.skipTriggerSetFor)
      .map((skill) => [path.join(ROOT, 'skills', skill, 'evals/trigger-queries.json'), TRIGGERS]),
  );
  const output: string[] = [];
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    const subject = spec.args.find((arg) => arg.startsWith('/agents/skills/')) ?? '';
    if (spec.args.includes('bundle')) {
      return options.catalogBundle ?? { ...OK, stdout: JSON.stringify({ catalog: CATALOG }) };
    }
    if (spec.args.includes('measure')) {
      return {
        ...OK,
        stdout: options.measures?.[path.basename(subject)] ?? measureStdout(['a1', 'a2'], []),
      };
    }
    if (spec.args.includes('suggest')) {
      files.set(
        '/work/suggestions.jsonl',
        '{"id":"a1","suggestion":"Name the trigger plainly."}\n',
      );
      return OK;
    }
    files.set(
      '/work/answers.jsonl',
      `${[
        { query_id: 'a1', run: 1, skill_name: 'aidx' },
        { query_id: 'a2', run: 1, skill_name: 'NO_SKILL' },
      ]
        .map((entry) => JSON.stringify(entry))
        .join('\n')}\n`,
    );
    return OK;
  });
  const deps: GateDependencies = {
    agentsRoot: ROOT,
    executor,
    listDirectory: mock(async (directory: string) => {
      if (directory === path.join(ROOT, 'skills')) {
        return [
          ...skills.map((name) => ({ isDirectory: true, name })),
          { isDirectory: false, name: 'stray.md' },
        ];
      }
      return directory.endsWith('empty') ? [] : [{ isDirectory: false, name: 'SKILL.md' }];
    }),
    makeTempDir: mock(async () => '/work'),
    readText: mock(async (file: string) => files.get(file)),
    sha256: hash,
    write: (message: string) => {
      output.push(message);
    },
    writeText: mock(async (file: string, content: string) => {
      files.set(file, content);
    }),
  };
  return { deps, executor, files, output };
};

const setSha = (skills: readonly string[]): string =>
  hash(skills.map((skill) => `${skill}\0${TRIGGERS}`).join('\n'));

const receiptFor = (
  overrides: Partial<Omit<Receipt, 'selfSha256'>> = {},
  skills: readonly string[] = ['aidp', 'aidx'],
): Receipt =>
  sealReceipt(
    {
      baseline: null,
      decision: 'baseline',
      document: 'skills/*/SKILL.md',
      documentSha256: CATALOG_SHA,
      fingerprint: currentFingerprint(true),
      measurement: {
        trainFailed: [],
        trainPassed: skills.flatMap((skill) => [`${skill}/a1`, `${skill}/a2`]),
        validationPassed: skills.length,
        validationTotal: skills.length,
      },
      reason: '',
      schema: 1,
      setPath: 'skills/*/evals/trigger-queries.json',
      setSha256: setSha(skills),
      ...overrides,
    },
    hash,
  );

describe('routing helpers', () => {
  test('maps a skill to its SKILL.md, trigger set, and the shared routing receipt', () => {
    expect(routingSkillTarget('aidp')).toEqual({
      document: 'skills/aidp/SKILL.md',
      receiptPath: 'evals/receipts/activation.json',
      setPath: 'skills/aidp/evals/trigger-queries.json',
      skill: 'aidp',
    });
    expect(ROUTING_RECEIPT).toBe('evals/receipts/activation.json');
    expect(ROUTING_TOKEN).toBe('descriptions');
  });

  test('the routing fingerprint carries the router version; documents do not', () => {
    expect(currentFingerprint(true).readerVersion).toContain('+router-');
    expect(currentFingerprint().readerVersion).not.toContain('+');
  });

  test('lists only directories that hold a SKILL.md', async () => {
    const { deps } = makeDeps({ skills: ['zeta', 'alpha', 'empty'] });

    expect(await activationSkills(deps)).toEqual(['alpha', 'zeta']);
  });

  test('the catalog hash comes from train bundle of the first skill, or is unknown', async () => {
    const good = makeDeps();

    expect(await catalogSha(good.deps, ['aidp', 'aidx'])).toBe(CATALOG_SHA);
    const spec = good.executor.mock.calls.map(([call]) => call as CommandSpec)[0];
    expect(spec?.args.at(-1)).toBe('/agents/skills/aidp');
    expect(await catalogSha(good.deps, [])).toBeUndefined();
    expect(
      await catalogSha(makeDeps({ catalogBundle: { code: 1, stderr: 'x', stdout: '' } }).deps, [
        'aidp',
      ]),
    ).toBeUndefined();
    expect(
      await catalogSha(makeDeps({ catalogBundle: { ...OK, stdout: 'not json' } }).deps, ['aidp']),
    ).toBeUndefined();
  });
});

describe('aggregate never-worse rule for routing', () => {
  const baseline = { trainPassed: ['aidp/a1', 'aidp/a2'], validationPassed: 2 };
  const swapped = {
    trainFailed: ['aidp/a2'],
    trainPassed: ['aidp/a1', 'aidx/a1'],
    validationPassed: 2,
    validationTotal: 3,
  };

  test('swapping which probe fails is not a regression when the score does not fall', () => {
    expect(decide(swapped, baseline, fixed)).toMatchObject({ accepted: false });
    expect(decide(swapped, baseline, fixed).problems[0]).toContain('did not improve');
    expect(decide(swapped, baseline, { ...fixed, allowEqualReason: 'swap' })).toMatchObject({
      accepted: true,
      decision: 'allowed-equal',
    });
    expect(decide(swapped, baseline, { fingerprintChanged: false }).problems[0]).toContain(
      'passed at baseline and now fails',
    );
  });

  test('a lower train total or a lower validation total is rejected', () => {
    const lowerTrain = { ...swapped, trainPassed: ['aidp/a1'] };
    const lowerValidation = { ...swapped, validationPassed: 1 };

    expect(decide(lowerTrain, baseline, fixed).problems[0]).toBe(
      'Train score fell from 2 to 1 passing probes.',
    );
    expect(decide(lowerValidation, baseline, fixed).problems[0]).toContain(
      'Held-out validation fell',
    );
  });

  test('more passing probes, in train or in validation, is an improvement', () => {
    const moreTrain = { ...swapped, trainPassed: ['aidp/a1', 'aidx/a1', 'aidx/a2'] };
    const moreValidation = { ...swapped, validationPassed: 3 };

    expect(decide(moreTrain, baseline, fixed)).toMatchObject({ decision: 'improved' });
    expect(decide(moreValidation, baseline, fixed)).toMatchObject({ decision: 'improved' });
  });
});

describe('verifying the routing receipt', () => {
  const withReceipt = (receipt: Receipt | undefined, options = {}) => {
    const harness = makeDeps(options);
    if (receipt) {
      harness.files.set(path.join(ROOT, ROUTING_RECEIPT), JSON.stringify(receipt));
    }
    return harness;
  };

  test('a current receipt has no problems', async () => {
    expect(await verifyRouting(withReceipt(receiptFor()).deps)).toEqual([]);
  });

  test('a changed description anywhere stales the receipt', async () => {
    const harness = withReceipt(receiptFor({ documentSha256: hash('older catalog') }));
    const problems = await verifyRouting(harness.deps);

    expect(problems[0]).toContain('A skill description changed');
    expect(problems[0]).toContain('reads every description');
  });

  test('a changed trigger query set stales the receipt', async () => {
    const problems = await verifyRouting(withReceipt(receiptFor({ setSha256: hash('x') })).deps);

    expect(problems[0]).toContain('A trigger query set changed');
  });

  test('a missing receipt, trigger set, skill list, or catalog is reported', async () => {
    expect((await verifyRouting(withReceipt(undefined).deps))[0]).toContain('No valid receipt');
    expect(
      (await verifyRouting(withReceipt(receiptFor(), { skipTriggerSetFor: 'aidx' }).deps))[0],
    ).toContain('No trigger query set at skills/aidx/evals/trigger-queries.json');
    expect((await verifyRouting(withReceipt(receiptFor(), { skills: [] }).deps))[0]).toContain(
      'No skills found',
    );
    expect(
      (
        await verifyRouting(
          withReceipt(receiptFor(), { catalogBundle: { code: 1, stderr: '', stdout: '' } }).deps,
        )
      )[0],
    ).toContain('Could not read the skill catalog');
  });

  test('a document-style fingerprint on the routing receipt is a different reader', async () => {
    const wrong = receiptFor({ fingerprint: currentFingerprint() });

    expect((await verifyRouting(withReceipt(wrong).deps))[0]).toContain('different reader');
  });

  test('a recorded score below its own baseline is rejected, a swap is not', async () => {
    const worse = receiptFor({
      baseline: {
        trainPassed: ['aidp/a1', 'aidp/a2', 'aidx/a1', 'aidx/a2', 'aidx/x'],
        validationPassed: 2,
      },
      decision: 'improved',
    });
    const swap = receiptFor({
      baseline: { trainPassed: ['aidp/a1', 'aidp/a2', 'aidx/a1', 'aidx/z'], validationPassed: 1 },
      decision: 'improved',
    });

    expect((await verifyRouting(withReceipt(worse).deps))[0]).toContain('Recorded result is worse');
    expect(await verifyRouting(withReceipt(swap).deps)).toEqual([]);
  });
});

describe('recording the routing receipt', () => {
  test('measures every skill and stores one merged receipt with namespaced probe ids', async () => {
    const harness = makeDeps();

    expect(await record([ROUTING_TOKEN], {}, harness.deps)).toBe(0);

    const commands = harness.executor.mock.calls.map(([spec]) =>
      (spec as CommandSpec).args.join(' '),
    );
    expect(
      commands.filter((line) => line.includes('train bundle /agents/skills/aidp')),
    ).toHaveLength(2);
    expect(
      commands.filter((line) => line.includes('train measure /agents/skills/aidx')),
    ).toHaveLength(1);
    const written = JSON.parse(harness.files.get(path.join(ROOT, ROUTING_RECEIPT)) ?? '{}');
    expect(written.documentSha256).toBe(CATALOG_SHA);
    expect(written.fingerprint).toEqual(currentFingerprint(true));
    expect(written.measurement.trainPassed).toEqual(['aidp/a1', 'aidp/a2', 'aidx/a1', 'aidx/a2']);
    expect(written.measurement.validationTotal).toBe(2);
    expect(harness.output.join('')).toContain(
      'ACCEPTED descriptions (train 4/4, validation 2/2; aidp 2/2, aidx 2/2) as baseline',
    );
    expect(await verifyRouting(harness.deps)).toEqual([]);
  });

  test('a lower score is rejected with the per-skill diagnosis and the old receipt stays', async () => {
    const harness = makeDeps({ measures: { aidp: measureStdout(['a2'], ['a1']) } });
    const before = JSON.stringify(receiptFor());
    harness.files.set(path.join(ROOT, ROUTING_RECEIPT), before);

    expect(await record([ROUTING_TOKEN], {}, harness.deps)).toBe(1);

    const text = harness.output.join('');
    expect(harness.files.get(path.join(ROOT, ROUTING_RECEIPT))).toBe(before);
    expect(text).toContain('REJECTED descriptions (train 3/4, validation 2/2; aidp 1/2, aidx 2/2)');
    expect(text).toContain('Train score fell from 4 to 3 passing probes.');
    expect(text).toContain('DIAGNOSIS description:aidp: failing train probes.');
    expect(text).toContain('--- a1: expected aidp, the reader answered aidx');
    expect(text).not.toContain('DIAGNOSIS description:aidx');
  });

  test('an accepted result that still has failing probes prints their diagnosis', async () => {
    const harness = makeDeps({ measures: { aidx: measureStdout(['a1'], ['a2']) } });

    expect(await record([ROUTING_TOKEN], { allowEqualReason: 'x' }, harness.deps)).toBe(0);
    expect(harness.output.join('')).toContain('--- a2: expected anything but aidx');
  });

  test('no improvement needs a written reason, and a changed reader needs a rebaseline', async () => {
    const harness = makeDeps({ measures: { aidx: measureStdout(['a1'], ['a2']) } });
    const partial = receiptFor({
      measurement: {
        trainFailed: ['aidx/a2'],
        trainPassed: ['aidp/a1', 'aidp/a2', 'aidx/a1'],
        validationPassed: 2,
        validationTotal: 2,
      },
    });
    harness.files.set(path.join(ROOT, ROUTING_RECEIPT), JSON.stringify(partial));

    expect(await record([ROUTING_TOKEN], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain(
      'did not improve a target that still has failing probes',
    );

    const changed = makeDeps({ measures: { aidx: measureStdout(['a1'], ['a2']) } });
    changed.files.set(
      path.join(ROOT, ROUTING_RECEIPT),
      JSON.stringify(
        receiptFor({ fingerprint: { ...currentFingerprint(true), readerVersion: 'old' } }),
      ),
    );

    expect(await record([ROUTING_TOKEN], { rebaselineReason: 'new model' }, changed.deps)).toBe(0);
    expect(JSON.parse(changed.files.get(path.join(ROOT, ROUTING_RECEIPT)) ?? '{}')).toMatchObject({
      decision: 'rebaseline',
      reason: 'new model',
    });
  });

  test('missing inputs stop the record before measuring', async () => {
    const harness = makeDeps({ catalogBundle: { code: 1, stderr: 'boom', stdout: '' } });

    expect(await record([ROUTING_TOKEN], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain('descriptions: Could not read the skill catalog');
    expect(harness.executor).toHaveBeenCalledTimes(1);
  });

  test('skills are measured in batches', async () => {
    const skills = ['a', 'b', 'c', 'd', 'e'];
    const harness = makeDeps({ skills });

    expect(ROUTING_BATCH).toBe(4);
    expect(await record([ROUTING_TOKEN], {}, harness.deps)).toBe(0);

    const measured = harness.executor.mock.calls
      .map(([spec]) => (spec as CommandSpec).args.join(' '))
      .filter((line) => line.includes('train measure'));
    expect(measured).toHaveLength(5);
    const written = JSON.parse(harness.files.get(path.join(ROOT, ROUTING_RECEIPT)) ?? '{}');
    expect(written.measurement.trainPassed).toHaveLength(10);
  });

  test('a failed measurement is reported for the routing target', async () => {
    const harness = makeDeps();
    const failing: GateDependencies = {
      ...harness.deps,
      executor: mock(async (spec: CommandSpec) =>
        spec.args.includes('measure')
          ? { code: 1, stderr: 'bad', stdout: '' }
          : harness.executor(spec),
      ),
    };

    expect(await record([ROUTING_TOKEN], {}, failing)).toBe(1);
    expect(harness.output.join('')).toContain('FAILED descriptions: train measure failed: bad');
  });
});
