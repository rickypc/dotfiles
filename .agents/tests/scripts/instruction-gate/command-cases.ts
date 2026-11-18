import { describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { GateDependencies } from '../../../scripts/instruction-gate/index.js';
import { defaultContext } from '../../../utils/cli/context.js';
import { runCommand } from '../../../utils/cli/index.js';
import type { CommandResult, CommandSpec } from '../../../utils/contracts.js';

interface GateCommandContext {
  readonly CENTRAL_SET: string;
  readonly createCommand: typeof import('../../../scripts/instruction-gate/index.js').createCommand;
  readonly DOCUMENT: string;
  readonly GLOBAL_ROOT: string;
  readonly makeHarness: (options?: {
    readonly agentsRoot?: string;
    readonly overrides?: (spec: CommandSpec) => CommandResult | undefined;
    readonly tree?: Record<string, readonly { isDirectory: boolean; name: string }[]>;
  }) => GateCommandHarness;
  readonly parseRecordArguments: typeof import('../../../scripts/instruction-gate/index.js').parseRecordArguments;
  readonly RECEIPT: string;
  readonly ROOT: string;
  readonly record: typeof import('../../../scripts/instruction-gate/index.js').record;
  readonly run: typeof import('../../../scripts/instruction-gate/index.js').run;
  readonly SET: string;
  readonly usage: typeof import('../../../scripts/instruction-gate/index.js').usage;
}

interface GateCommandHarness {
  readonly deps: GateDependencies;
  readonly executor: ReturnType<typeof mock>;
  readonly executorCalls: () => number;
  readonly files: Map<string, string>;
  readonly output: string[];
}

const execCommand = async (
  createCommand: GateCommandContext['createCommand'],
  args: readonly string[],
  deps: GateDependencies,
) => {
  const out: string[] = [];
  const sink = (message: string) => out.push(message);
  const code = await runCommand(
    createCommand(() => deps),
    args,
    defaultContext({ stderr: sink, stdin: '', stdout: sink, target: {} }),
  );
  return { code, out };
};

const registerGateArgumentCases = (context: GateCommandContext): void => {
  const { DOCUMENT, createCommand, makeHarness, parseRecordArguments, run, usage } = context;
  describe('arguments, run, and the command line', () => {
    test('parses paths and reasons', () => {
      expect(parseRecordArguments(['a.md', '--allow-equal', 'typo fix', 'b.md'])).toEqual({
        documents: ['a.md', 'b.md'],
        options: { allowEqualReason: 'typo fix', rebaselineReason: undefined },
      });
      expect(parseRecordArguments(['--rebaseline', 'new model']).options.rebaselineReason).toBe(
        'new model',
      );
      expect(parseRecordArguments([]).documents).toEqual([]);
    });

    test.each<[readonly string[]]>([
      [['--allow-equal']],
      [['--rebaseline', ' ']],
      [['--allow-equal', '--rebaseline', 'x']],
    ])('a flag without a written reason is refused: %p', (args) => {
      expect(() => parseRecordArguments(args)).toThrow('needs a written reason');
    });

    test('run routes verify and record and rejects everything else', async () => {
      const harness = makeHarness();

      expect(await run(['verify'], harness.deps)).toBe(1);
      expect(await run(['record', DOCUMENT], harness.deps)).toBe(0);
      for (const bad of [[], ['verify', 'extra'], ['unknown']]) {
        await expect(run(bad, harness.deps)).rejects.toThrow('Usage:');
      }
      expect(usage()).toContain('instruction-gate/index.ts verify');
    });

    test('the command maps gate outcomes onto the envelope and exit table', async () => {
      const harness = makeHarness();
      const exec = (args: readonly string[], deps: GateDependencies = harness.deps) =>
        execCommand(createCommand, args, deps);
      const verify = await exec(['verify']);
      expect(verify.code).toBe(1);
      expect(JSON.parse(verify.out[0] ?? '').data.output).toContain('instruction-gate:');
      const recorded = await exec(['record', DOCUMENT]);
      expect(recorded.code).toBe(0);
      expect(JSON.parse(recorded.out[0] ?? '').data.output).toContain('record complete');
      const text = await exec(['verify', '--format', 'text']);
      expect(text.out[0]).toContain('instruction-gate:');
      expect((await exec(['record', '--allow-equal', ' ', DOCUMENT])).code).toBe(1);
      for (const bad of [[], ['verify', 'extra'], ['unknown'], ['calibrate']]) {
        expect((await exec(bad)).code).toBe(2);
      }
      const broken = {
        ...harness.deps,
        listDirectory: mock(async () => {
          throw 'not an error';
        }),
      };
      const failed = await exec(['verify'], broken);
      expect(failed.code).toBe(1);
      expect(JSON.parse(failed.out[0] ?? '').diagnostics[0]).toContain('not an error');
      const help = await exec(['--help']);
      expect(help.code).toBe(0);
      expect(help.out[0]).toContain('evaluate-batch');
    });
  });
};

const registerGateRecordFailureCases = (context: GateCommandContext): void => {
  const { DOCUMENT, RECEIPT, ROOT, makeHarness, record } = context;

  describe('record failures', () => {
    test.each([
      [
        'train bundle',
        (spec: CommandSpec) =>
          spec.args.includes('bundle') ? { code: 1, stderr: 'no set', stdout: '' } : undefined,
        'train bundle failed: no set',
      ],
      [
        'the reader without a GPU',
        (spec: CommandSpec) =>
          spec.args.some((a) => a.endsWith('weak-reader/index.ts'))
            ? { code: 1, stderr: 'no adapter', stdout: '{"data":{"reason":"no-adapter"}}' }
            : undefined,
        'outside the sandbox',
      ],
      [
        'the reader failing otherwise',
        (spec: CommandSpec) =>
          spec.args.some((a) => a.endsWith('weak-reader/index.ts'))
            ? { code: 3, stderr: 'bad blob', stdout: '' }
            : undefined,
        'weak reader exited 3: bad blob',
      ],
      [
        'train measure',
        (spec: CommandSpec) =>
          spec.args.includes('measure')
            ? { code: 1, stderr: 'bad answers', stdout: '' }
            : undefined,
        'train measure failed: bad answers',
      ],
      [
        'unusable measure output',
        (spec: CommandSpec) =>
          spec.args.includes('measure')
            ? { code: 0, stderr: '', stdout: '{"measurement":{}}' }
            : undefined,
        'returned no trainQueries',
      ],
      [
        'unusable measure output shape',
        (spec: CommandSpec) =>
          spec.args.includes('measure') ? { code: 0, stderr: '', stdout: '[]' } : undefined,
        'returned no trainQueries',
      ],
    ])(
      '%s fails the document with its reason and writes no receipt',
      async (_label, overrides, message) => {
        const harness = makeHarness({ overrides });

        expect(await record([DOCUMENT], {}, harness.deps)).toBe(1);
        expect(harness.output.join('')).toContain(`FAILED ${DOCUMENT}`);
        expect(harness.output.join('')).toContain(message);
        expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(false);
      },
    );

    test('a thrown non-error value is still reported', async () => {
      const harness = makeHarness();
      const failing = {
        ...harness.deps,
        executor: mock(async () => {
          throw 'plain text';
        }),
      };

      expect(await record([DOCUMENT], {}, failing)).toBe(1);
      expect(harness.output.join('')).toContain('FAILED skills/aidp/SKILL.md: plain text');
    });
  });
};

const PROJECT = '/project/.agents';
const projectTree = {
  [PROJECT]: [{ isDirectory: true, name: 'skills' }],
  [path.join(PROJECT, 'skills')]: [{ isDirectory: true, name: 'aidp' }],
  [path.join(PROJECT, 'skills', 'aidp')]: [{ isDirectory: false, name: 'SKILL.md' }],
};
const commandsOf = (harness: GateCommandHarness): string[] =>
  harness.executor.mock.calls.map(([spec]) => (spec as CommandSpec).args.join(' '));
const projectHarness = (context: GateCommandContext): GateCommandHarness => {
  const { DOCUMENT, ROOT, SET, makeHarness } = context;
  const harness = makeHarness({ tree: projectTree });
  for (const relative of [DOCUMENT, SET]) {
    harness.files.set(
      path.join(PROJECT, relative),
      harness.files.get(path.join(ROOT, relative)) ?? '',
    );
    harness.files.delete(path.join(ROOT, relative));
  }
  return harness;
};

const registerAgentRootRecordCases = (context: GateCommandContext): void => {
  const { DOCUMENT, RECEIPT, ROOT, SET, makeHarness, run } = context;
  describe('--agents-root record', () => {
    test('without the flag the content root stays the package root', async () => {
      const harness = makeHarness();

      expect(await run(['record', DOCUMENT], harness.deps)).toBe(0);
      expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(true);
      expect(commandsOf(harness)[0]).toContain(`train bundle ${path.join(ROOT, SET)}`);
    });

    test('record resolves the document, set, and receipt under the flag root', async () => {
      const harness = projectHarness(context);

      expect(await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps)).toBe(0);

      expect(harness.files.has(path.join(ROOT, RECEIPT))).toBe(false);
      expect(JSON.parse(harness.files.get(path.join(PROJECT, RECEIPT)) ?? '{}')).toMatchObject({
        document: DOCUMENT,
        setPath: SET,
      });
      expect(commandsOf(harness)[0]).toContain(`train bundle ${path.join(PROJECT, SET)}`);
    });

    test('tools still resolve from the package root', async () => {
      const harness = projectHarness(context);

      await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps);

      const commands = commandsOf(harness);
      expect(commands[0]).toContain(path.join(ROOT, 'scripts', 'skill-manager', 'index.ts'));
      expect(commands[1]).toContain(path.join(ROOT, 'scripts', 'weak-reader', 'index.ts'));
      expect(commands.some((command) => command.includes(path.join(PROJECT, 'scripts')))).toBe(
        false,
      );
    });
  });
};

const registerAgentRootValidationCases = (context: GateCommandContext): void => {
  const { DOCUMENT, makeHarness, run, usage } = context;
  describe('--agents-root validation', () => {
    test('verify checks the documents under the flag root and skips the routing receipt', async () => {
      const harness = projectHarness(context);
      await run(['record', '--agents-root', PROJECT, DOCUMENT], harness.deps);
      harness.output.length = 0;

      expect(await run(['verify', '--agents-root', PROJECT], harness.deps)).toBe(0);
      expect(harness.output.join('')).toContain('passed - 1 instruction documents have');
    });

    test.each<[string[], string]>([
      [['relative/path'], 'an absolute path'],
      [['/project/../etc'], 'without ".." segments'],
      [['/missing'], 'an existing directory'],
      [['/empty'], 'contains a skills or evals directory'],
      [[], 'an absolute path'],
    ])('the root %p is rejected before measurement begins', async (value, message) => {
      const harness = makeHarness();
      const deps: GateDependencies = {
        ...harness.deps,
        listDirectory: mock(async (directory: string) => {
          if (directory === '/missing') {
            throw new Error('ENOENT');
          }
          return directory === '/empty' ? [{ isDirectory: false, name: 'notes.md' }] : [];
        }),
      };

      await expect(run(['record', '--agents-root', ...value], deps)).rejects.toThrow(message);
      expect(harness.executor).not.toHaveBeenCalled();
    });

    test('descriptions are rejected for a non-default root and documented in the usage', async () => {
      const harness = projectHarness(context);

      await expect(
        run(['record', '--agents-root', PROJECT, 'descriptions'], harness.deps),
      ).rejects.toThrow('gated only for the default root');
      expect(harness.executor).not.toHaveBeenCalled();
      expect(usage()).toContain('--agents-root <absolute-path>');
    });
  });
};

const COMPREHENSION_SET = JSON.stringify({
  kind: 'comprehension',
  queries: [
    { evidence: 'r', expected: 'A', id: 'train-01', query: 'Q?\nA) a\nB) b', split: 'train' },
    { evidence: 'r', expected: 'B', id: 'train-02', query: 'Q?\nA) a\nB) b', split: 'train' },
    {
      evidence: 'r',
      expected: 'A',
      id: 'validation-01',
      query: 'Q?\nA) a\nB) b',
      split: 'validation',
    },
  ],
  runs_per_query: 3,
  skill_name: 'demo--doc',
  splits: { train: 't', validation: 'v' },
  target: '../doc.md',
});

const registerCalibrateCases = (context: GateCommandContext): void => {
  const { ROOT, createCommand, makeHarness, run, usage } = context;
  const sentence = 'The agent must always check the gate.';
  const atom = {
    behavioral: false,
    harmful: 0,
    helpful: 0,
    id: 'a1',
    placements: [{ headingPath: ['Rules'] }],
    precedence: 0,
    probeIds: ['train-01'],
    status: 'active',
    tags: [],
    textSha256: createHash('sha256').update(sentence).digest('hex'),
  };
  const mapText = [
    '---',
    'type: atom-map',
    'title: t',
    'description: d',
    'tags: [atoms]',
    'schemaVersion: 1',
    'source: skills/demo/SKILL.md',
    `atoms: ${JSON.stringify([atom])}`,
    '---',
    'body',
  ].join('\n');
  const owner = {
    artifacts: { atoms: [], comprehension: ['evals/skills/demo/comprehension/SKILL.json'] },
    directory: 'evals/skills/demo/',
    id: 'skill:demo',
    requiredLanes: ['atoms'],
  };
  const calibrateHarness = () => {
    const holder: { files?: Map<string, string> } = {};
    const harness = makeHarness({
      overrides: (spec) => {
        const files = holder.files as Map<string, string>;
        const batch = JSON.parse(files.get(spec.args.at(-1) ?? '') ?? '{}') as {
          items: { answersPath: string; bundlePath: string }[];
        };
        for (const item of batch.items) {
          const bundle = JSON.parse(files.get(item.bundlePath) ?? '{}') as {
            prompts: { query_id: string; run: number }[];
          };
          const lines = bundle.prompts.map((prompt) =>
            JSON.stringify({ answer: 'A', query_id: prompt.query_id, run: prompt.run }),
          );
          files.set(item.answersPath, lines.join('\n'));
        }
        return { code: 0, stderr: '', stdout: '' };
      },
    });
    holder.files = harness.files;
    const set = JSON.parse(COMPREHENSION_SET) as Record<string, unknown>;
    harness.files.set(path.join(ROOT, 'evals/manifest.json'), JSON.stringify({ owners: [owner] }));
    harness.files.set(
      path.join(ROOT, 'evals/skills/demo/comprehension/SKILL.json'),
      JSON.stringify({ ...set, target: '../../../../skills/demo/SKILL.md' }),
    );
    harness.files.set(path.join(ROOT, 'evals/skills/demo/atoms/SKILL.md'), mapText);
    harness.files.set(path.join(ROOT, 'skills/demo/SKILL.md'), `# Rules\n\n${sentence}\n`);
    return harness;
  };

  describe('calibrate', () => {
    test('prints the calibration report and stores sensitivity only with --write', async () => {
      const preview = calibrateHarness();
      expect(await run(['calibrate', 'skill:demo'], preview.deps)).toBe(0);
      const report = JSON.parse(preview.output.join('')) as { owners: { ownerId: string }[] };
      expect(report.owners.map((o) => o.ownerId)).toEqual(['skill:demo']);
      expect(preview.files.get(path.join(ROOT, 'evals/skills/demo/atoms/SKILL.md'))).toBe(mapText);
      const written = calibrateHarness();
      await run(['calibrate', '--write', 'skill:demo'], written.deps);
      expect(written.files.get(path.join(ROOT, 'evals/skills/demo/atoms/SKILL.md'))).toContain(
        'sensitivity',
      );
    });

    test('the command prints the calibration report as envelope data', async () => {
      const harness = calibrateHarness();
      const { code, out } = await execCommand(
        createCommand,
        ['calibrate', '--write', 'skill:demo'],
        harness.deps,
      );
      expect(code).toBe(0);
      expect(JSON.parse(out[0] ?? '').data.owners[0].ownerId).toBe('skill:demo');
      expect(harness.files.get(path.join(ROOT, 'evals/skills/demo/atoms/SKILL.md'))).toContain(
        'sensitivity',
      );
    });

    test.each<[readonly string[]]>([
      [['calibrate']],
      [['calibrate', '--write']],
      [['calibrate', 'skill:demo', '--write', '--write']],
    ])('refuses the arguments %p with the usage text', async (args) => {
      await expect(run(args, calibrateHarness().deps)).rejects.toThrow(usage());
    });
  });
};

const registerEvaluateBatchCases = (context: GateCommandContext): void => {
  const { DOCUMENT, ROOT, SET, createCommand, makeHarness, run, usage } = context;
  const request = JSON.stringify({
    schemaVersion: 1,
    targets: [{ candidates: [{ id: 'current' }], document: DOCUMENT }],
  });
  const batchHarness = () => {
    const holder: { files?: Map<string, string> } = {};
    const harness = makeHarness({
      overrides: (spec) => {
        const files = holder.files as Map<string, string>;
        const manifest = JSON.parse(files.get(spec.args.at(-1) ?? '') ?? '{}') as {
          items: { answersPath: string; bundlePath: string; expected: Record<string, string> }[];
        };
        for (const item of manifest.items) {
          const bundle = JSON.parse(files.get(item.bundlePath) ?? '{}') as {
            prompts: { query_id: string; run: number }[];
          };
          const lines = bundle.prompts.map((prompt) =>
            JSON.stringify({
              answer: item.expected[prompt.query_id] ?? 'A',
              query_id: prompt.query_id,
              run: prompt.run,
            }),
          );
          files.set(item.answersPath, lines.join('\n'));
        }
        return { code: 0, stderr: 'GPU ready', stdout: '' };
      },
    });
    holder.files = harness.files;
    harness.files.set(path.join(ROOT, SET), COMPREHENSION_SET);
    harness.files.set('/req.json', request);
    return harness;
  };

  describe('evaluate-batch', () => {
    test('prints the result, writes the optional output file, and records no receipt', async () => {
      const harness = batchHarness();
      expect(await run(['evaluate-batch', '/req.json', '/out.json'], harness.deps)).toBe(0);
      const printed = JSON.parse(harness.output.join('')) as {
        targets: { candidates: { measurement: { trainPassed: string[] } }[] }[];
      };
      expect(printed.targets[0]?.candidates[0]?.measurement.trainPassed).toEqual([
        'train-01',
        'train-02',
      ]);
      expect(harness.files.get('/out.json')).toBe(harness.output.join(''));
      expect([...harness.files.keys()].filter((file) => file.includes('receipts'))).toEqual([]);
      const printedOnly = batchHarness();
      expect(await run(['evaluate-batch', '/req.json'], printedOnly.deps)).toBe(0);
      expect(printedOnly.files.has('/out.json')).toBe(false);
    });

    test('the command prints the batch result as envelope data', async () => {
      const harness = batchHarness();
      const { code, out } = await execCommand(
        createCommand,
        ['evaluate-batch', '/req.json', '--format', 'text'],
        harness.deps,
      );
      expect(code).toBe(0);
      expect(JSON.parse(out[0] ?? '').targets).toHaveLength(1);
    });

    test.each<[readonly string[]]>([
      [['evaluate-batch']],
      [['evaluate-batch', 'req.json']],
      [['evaluate-batch', '/req.json', 'out.json']],
      [['evaluate-batch', '/req.json', '/out.json', 'extra']],
    ])('refuses the arguments %p with the usage text', async (args) => {
      await expect(run(args, batchHarness().deps)).rejects.toThrow(usage());
    });

    test('reports a missing request file', async () => {
      await expect(run(['evaluate-batch', '/absent.json'], batchHarness().deps)).rejects.toThrow(
        'Missing evaluate-batch request: /absent.json',
      );
    });
  });
};

const registerPolicyRecordCases = (context: GateCommandContext): void => {
  const { CENTRAL_SET, DOCUMENT, GLOBAL_ROOT, makeHarness, parseRecordArguments, record } = context;
  const looksFile = path.join(GLOBAL_ROOT, 'evals/skills/aidp/held-out-looks.jsonl');
  const poolFile = path.join(GLOBAL_ROOT, 'evals/skills/aidp/pool.md');
  const look = (digit: string): string =>
    `${JSON.stringify({ at: 'x', document: DOCUMENT, documentSha256: digit.repeat(64), kind: 'look' })}\n`;
  const harnessFor = (files: Record<string, string> = {}) => {
    const harness = makeHarness({ agentsRoot: GLOBAL_ROOT });
    harness.files.set(path.join(GLOBAL_ROOT, DOCUMENT), 'document text');
    harness.files.set(
      path.join(GLOBAL_ROOT, 'evals/skills/aidp/atoms/SKILL.md'),
      '---\ntype: atom-map\ntitle: t\ndescription: d\ntags: [atoms]\nschemaVersion: 1\nsource: skills/aidp/SKILL.md\natoms: []\n---\nbody',
    );
    harness.files.set(
      path.join(GLOBAL_ROOT, CENTRAL_SET),
      harness.files.get(path.join(GLOBAL_ROOT, context.SET)) ?? '',
    );
    for (const [file, text] of Object.entries(files)) {
      harness.files.set(file, text);
    }
    const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
    return { ...harness, deps: { ...harness.deps, sha256 } };
  };

  describe('held-out look budget in record', () => {
    test('parses the swap and rotation flags and refuses them without a value', () => {
      const parsed = parseRecordArguments([
        '--allow-swap',
        'reorder',
        '--rotate-pool',
        'p.md',
        'a.md',
      ]);
      expect(parsed).toEqual({
        documents: ['a.md'],
        options: {
          allowEqualReason: undefined,
          rebaselineReason: undefined,
          rotatePoolPath: 'p.md',
          swapReason: 'reorder',
        },
      });
      expect(() => parseRecordArguments(['--allow-swap'])).toThrow(
        '--allow-swap needs a written reason',
      );
      expect(() => parseRecordArguments(['--rotate-pool'])).toThrow(
        '--rotate-pool needs a sealed pool file path',
      );
    });

    test('blocks a third distinct text before any reader run', async () => {
      const harness = harnessFor({ [looksFile]: look('a') + look('b') });
      expect(await record([DOCUMENT], {}, harness.deps)).toBe(1);
      expect(harness.output.join('')).toContain('BLOCKED skills/aidp/SKILL.md: 2 held-out looks');
      expect(harness.executorCalls()).toBe(0);
    });

    test('counts a new text once and not again when the same text is recorded again', async () => {
      const harness = harnessFor();
      expect(await record([DOCUMENT], {}, harness.deps)).toBe(0);
      expect(harness.files.get(looksFile)?.trim().split('\n')).toHaveLength(1);
      expect(await record([DOCUMENT], {}, harness.deps)).toBe(0);
      expect(harness.files.get(looksFile)?.trim().split('\n')).toHaveLength(1);
    });

    test('a sealed pool rotates the epoch and the record then proceeds', async () => {
      const harness = harnessFor({ [looksFile]: look('a') + look('b'), [poolFile]: 'new probes' });
      const options = { rotatePoolPath: 'evals/skills/aidp/pool.md' };
      expect(await record([DOCUMENT], options, harness.deps)).toBe(0);
      const kinds = (harness.files.get(looksFile) ?? '')
        .trim()
        .split('\n')
        .map((line) => (JSON.parse(line) as { kind: string }).kind);
      expect(kinds).toEqual(['look', 'look', 'rotation', 'look']);
    });
  });
};

export const registerGateCommandCases = (context: GateCommandContext): void => {
  registerPolicyRecordCases(context);
  registerCalibrateCases(context);
  registerEvaluateBatchCases(context);
  registerAgentRootRecordCases(context);
  registerAgentRootValidationCases(context);
  registerGateArgumentCases(context);
  registerGateRecordFailureCases(context);
};
