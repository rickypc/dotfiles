import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { CliContext } from '../../../utils/cli/context.js';
import * as realCli from '../../../utils/cli/index.js';
import { runCommand } from '../../../utils/cli/index.js';

// Every module the SUT imports is registered before the dynamic import: the CLI helper is the real
// pure module, and the filesystem module is replaced by a Map-backed fake so no real file is read
// or written. The same fake is injected through the `fileSystem` parameter of the SUT. The SUT
// reads Bun.argv and prints through console only when it is the main module, so every run() call
// here injects a mock() writer and neither global is touched.
const files = new Map<string, string>();
const writes: string[] = [];

const children = (path: string): Map<string, boolean> => {
  const prefix = `${path.replace(/\/$/u, '')}/`;
  const found = new Map<string, boolean>();
  for (const key of files.keys()) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      found.set(slash < 0 ? rest : rest.slice(0, slash), slash >= 0);
    }
  }
  return found;
};

const enoent = (path: string): Error =>
  Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

const fakeFileSystem = {
  exists: async (path: string) => files.has(path),
  mkdir: async () => undefined,
  readdir: async (path: string) => {
    const found = children(path);
    if (found.size === 0) {
      throw enoent(path);
    }
    return [...found].map(([name, directory]) => ({ isDirectory: () => directory, name }));
  },
  readFile: async (path: string) => {
    const content = files.get(path);
    if (content === undefined) {
      throw enoent(path);
    }
    return content;
  },
  rm: async () => undefined,
  writeFile: async (path: string, content: string) => {
    writes.push(path);
    files.set(path, content);
  },
};

mock.module('../utils/cli.js', () => realCli);
mock.module('../utils/filesystem.js', () => ({
  nodeFileSystem: fakeFileSystem,
  readText: (fileSystem: typeof fakeFileSystem, path: string) => fileSystem.readFile(path),
  writeText: (fileSystem: typeof fakeFileSystem, path: string, content: string) =>
    fileSystem.writeFile(path, content),
}));

const {
  DEVIATION_CLASSES,
  buildDeltaRecord,
  deltaPathFor,
  parseDeltaRecord,
  recordDelta,
  createCommand,
  renderDelta,
} = await import('../../../scripts/plans/aidx-delta.js');

const exec = async (
  args: readonly string[],
  fileSystem: typeof fakeFileSystem = fakeFileSystem,
) => {
  const out: string[] = [];
  const err: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => err.push(message),
  };
  const code = await runCommand(createCommand(fileSystem), [...args, '--format', 'text'], context);
  return { code, err, out };
};

const planPath = '/work/.agents/plans/Users-demo/sample-plan.md';
const deltaPath = '/work/.agents/plans/Users-demo/sample-plan.delta.json';
const observationsPath = '/tmp/observations.json';

const plan = [
  '---',
  'title: "Sample"',
  '---',
  '# Sample',
  '',
  '## 1. TARGET DIRECTIVES',
  '| Id | Trigger | Response | Budget |',
  '| --- | --- | --- | --- |',
  '| PD-1 | noise | record it | 1 |',
  '| PD-2 | stale | rebuild | 1 |',
  '',
  '## 2. VARIABLE DEFINITION MATRIX',
  '',
  '## 3. CHRONOLOGICAL WORKFLOW',
  '',
  '### Phase 1 - Preflight',
  '',
  '- [x] one',
  '- [x] two',
  '- [-] three reason',
  '- [x] four',
  '',
  '## 4. TOOL STRATEGY & FALLBACKS',
  '- [ ] not a workflow step',
].join('\n');

const observations = {
  caps: [{ id: 'gemma', planned: 6, used: 4 }],
  deviations: [
    { class: 'noise-retry', note: 'flip', registerId: 'PD-1' },
    { class: 'contradiction', note: 'label words' },
  ],
};

const seed = (content: string = plan, observed: unknown = observations): void => {
  files.set(planPath, content);
  files.set(observationsPath, JSON.stringify(observed));
};

const record = {
  caps: [{ id: 'gemma', planned: 6, used: 4 }],
  deviations: [
    { class: 'noise-retry', note: 'flip', registerId: 'PD-1' },
    { class: 'contradiction', note: 'label words' },
  ],
  plan: 'sample-plan.md',
  schemaVersion: 1,
  score: 0.25,
  steps: { completed: 3, planned: 4, skipped: 1 },
  unforeseen: 1,
};

beforeEach(() => {
  files.clear();
  writes.length = 0;
});

describe('record', () => {
  test('writes the sibling delta record with counts, score, and sorted keys', async () => {
    seed();
    await exec(['record', planPath, observationsPath]);
    expect(JSON.parse(files.get(deltaPath) ?? '')).toEqual(record);
    expect(files.get(deltaPath)?.startsWith('{\n  "caps"')).toBe(true);
    expect(writes).toEqual([deltaPath]);
    expect(files.get(planPath)).toBe(plan);
  });

  test('is byte-stable across a second run and prints the record', async () => {
    seed();
    const printed: string[] = [];
    printed.push(...(await exec(['record', planPath, observationsPath])).out);
    const first = files.get(deltaPath);
    await exec(['record', planPath, observationsPath]);
    expect(files.get(deltaPath)).toBe(first);
    expect(printed).toEqual([first ?? '']);
  });

  test.each([
    [
      'an unknown class',
      { ...observations, deviations: [{ class: 'mystery', note: 'x' }] },
      /class must be one of/u,
    ],
    [
      'a registerId absent from the plan',
      { ...observations, deviations: [{ class: 'env-fact', note: 'x', registerId: 'PD-9' }] },
      /PD-9 is not a Predicted deviations id/u,
    ],
    [
      'a cap without a used value',
      { ...observations, caps: [{ id: 'gemma', planned: 6 }] },
      /used must be a non-negative integer/u,
    ],
    [
      'a cap with an empty id',
      { ...observations, caps: [{ id: ' ', planned: 6, used: 1 }] },
      /caps\[0\]\.id must be a non-empty string/u,
    ],
    [
      'a negative planned cap',
      { ...observations, caps: [{ id: 'g', planned: -1, used: 1 }] },
      /planned must be a non-negative integer/u,
    ],
    ['a non-object cap', { ...observations, caps: ['gemma'] }, /caps\[0\] must be an object/u],
    [
      'a non-object deviation',
      { ...observations, deviations: [1] },
      /deviations\[0\] must be an object/u,
    ],
    [
      'an empty note',
      { ...observations, deviations: [{ class: 'env-fact', note: '' }] },
      /note must be a non-empty string/u,
    ],
    ['a non-array caps value', { ...observations, caps: {} }, /caps must be an array/u],
    [
      'a non-array deviations value',
      { caps: [], deviations: 'none' },
      /deviations must be an array/u,
    ],
    ['a non-object observations value', ['x'], /Observations must be a JSON object/u],
  ])('rejects %s and writes nothing', async (_name, observed, message) => {
    seed(plan, observed);
    await expect(recordDelta(fakeFileSystem, planPath, observationsPath)).rejects.toThrow(message);
    expect(writes).toEqual([]);
  });

  test('rejects a plan with no workflow steps and writes nothing', async () => {
    seed('# Empty\n\n## 1. TARGET DIRECTIVES\n');
    await expect(recordDelta(fakeFileSystem, planPath, observationsPath)).rejects.toThrow(
      /no workflow steps/u,
    );
    expect(writes).toEqual([]);
  });

  test('measures steps through the end of a plan that has no section 4 heading', () => {
    const built = buildDeltaRecord('## 3. CHRONOLOGICAL WORKFLOW\n- [x] a\n- [ ] b', 'p.md', {
      caps: [],
      deviations: [],
    });
    expect(built.steps).toEqual({ completed: 1, planned: 2, skipped: 0 });
    expect(built.score).toBe(0);
  });

  test('rejects observations that are not valid JSON', async () => {
    files.set(planPath, plan);
    files.set(observationsPath, '{not json');
    await expect(recordDelta(fakeFileSystem, planPath, observationsPath)).rejects.toThrow(
      /Observations file must be valid JSON/u,
    );
  });

  test.each([
    ['relative plan path', 'plans/x.md', observationsPath],
    ['non-Markdown plan path', '/work/.agents/plans/Users-demo/x.json', observationsPath],
    ['plan outside .agents/plans', '/work/other/x.md', observationsPath],
    ['relative observations path', planPath, 'obs.json'],
  ])('rejects a %s', async (_name, candidatePlan, candidateObservations) => {
    await expect(recordDelta(fakeFileSystem, candidatePlan, candidateObservations)).rejects.toThrow(
      /absolute Markdown file under \.agents\/plans/u,
    );
    expect(writes).toEqual([]);
  });
});

describe('history', () => {
  const deltaFile = (index: string, name: string, value: object): void => {
    files.set(`/work/.agents/plans/${index}/${name}.delta.json`, renderDelta(value as never));
  };

  test.each([['/missing'], ['/work/.agents']])('prints no history for %s', async (root) => {
    const printed: string[] = [];
    printed.push(...(await exec(['history', root])).out);
    expect(printed).toEqual(['no history']);
  });

  test('summarizes cap maxima, scores, and run count across indexes', async () => {
    deltaFile('Idx-a', 'one', record);
    deltaFile('Idx-b', 'two', {
      ...record,
      caps: [
        { id: 'gemma', planned: 6, used: 9 },
        { id: 'repairs', planned: 2, used: 0 },
      ],
      deviations: [],
      plan: 'two.md',
      score: 0,
      unforeseen: 0,
    });
    files.set('/work/.agents/plans/stray.md', 'ignored');
    files.set('/work/.agents/plans/Idx-a/notes.md', 'ignored');
    const printed: string[] = [];
    printed.push(...(await exec(['history', '/work/.agents'])).out);
    expect(printed).toEqual([
      [
        'runs: 2',
        'cap gemma: max used/planned 1.5',
        'cap repairs: max used/planned 0',
        'run sample-plan.md: unforeseen 1 score 0.25',
        'run two.md: unforeseen 0 score 0',
      ].join('\n'),
    ]);
  });

  test('limits the summary to one index and treats a zero cap as one', async () => {
    deltaFile('Idx-a', 'one', { ...record, caps: [{ id: 'free', planned: 0, used: 2 }] });
    deltaFile('Idx-b', 'two', record);
    const printed: string[] = [];
    printed.push(...(await exec(['history', '/work/.agents', 'Idx-a'])).out);
    expect(printed[0]).toContain('cap free: max used/planned 2');
    expect(printed[0]).not.toContain('gemma');
  });

  test('reports a malformed file with its path without hiding the valid ones', async () => {
    deltaFile('Idx-a', 'good', record);
    files.set('/work/.agents/plans/Idx-a/bad.delta.json', '{oops');
    const printed: string[] = [];
    printed.push(...(await exec(['history', '/work/.agents'])).out);
    expect(printed[0]).toContain('runs: 1');
    expect(printed[0]).toContain(
      'malformed /work/.agents/plans/Idx-a/bad.delta.json: Delta record must be valid JSON.',
    );
  });

  test('reports zero runs when every file is malformed', async () => {
    files.set('/work/.agents/plans/Idx-a/bad.delta.json', '[]');
    const printed: string[] = [];
    printed.push(...(await exec(['history', '/work/.agents'])).out);
    expect(printed[0]).toBe(
      'runs: 0\nmalformed /work/.agents/plans/Idx-a/bad.delta.json: Delta record must be an object with schemaVersion 1.',
    );
  });

  test('rethrows a directory error that is not a missing path', async () => {
    const broken = {
      ...fakeFileSystem,
      readdir: async () => {
        throw new Error('EACCES');
      },
    };
    const { code, err } = await exec(['history', '/work/.agents'], broken);
    expect(code).toBe(1);
    expect(err[0]).toMatch(/EACCES/u);
  });
});

describe('parseDeltaRecord', () => {
  test('round-trips a rendered record', () => {
    expect(parseDeltaRecord(renderDelta(record as never))).toEqual(record as never);
  });

  test.each([
    ['invalid JSON', '{', /valid JSON/u],
    ['a non-object', '[]', /schemaVersion 1/u],
    ['another schema version', JSON.stringify({ ...record, schemaVersion: 2 }), /schemaVersion 1/u],
    ['missing steps', JSON.stringify({ ...record, steps: undefined }), /steps\.completed/u],
    [
      'a bad deviation class',
      JSON.stringify({ ...record, deviations: [{ class: 'x', note: 'n' }] }),
      /class must be one of/u,
    ],
    [
      'a wrong unforeseen count',
      JSON.stringify({ ...record, unforeseen: 2 }),
      /does not match the 1 deviations/u,
    ],
    ['a wrong score', JSON.stringify({ ...record, score: 0.5 }), /score does not match/u],
    [
      'a missing plan name',
      JSON.stringify({ ...record, plan: '' }),
      /plan must be a non-empty string/u,
    ],
  ])('rejects %s', (_name, content, message) => {
    expect(() => parseDeltaRecord(content)).toThrow(message);
  });
});

describe('contracts', () => {
  test('derives the sibling path and lists the closed class set', () => {
    expect(deltaPathFor(planPath)).toBe(deltaPath);
    expect(DEVIATION_CLASSES).toEqual([
      'contradiction',
      'env-fact',
      'scope-change',
      'cap-exceeded',
      'unplanned-step',
      'noise-retry',
      'stale-evidence',
    ]);
  });

  test.each([
    [[]],
    [['record', planPath]],
    [['history']],
    [['other', 'x']],
    [['record', 'a', 'b', 'c']],
  ])('exits with usage code 2 for %j', async (args) => {
    expect((await exec(args)).code).toBe(2);
  });

  test('help names both verbs', async () => {
    const out: string[] = [];
    const context: CliContext = {
      listDirectory: async () => [],
      readStdin: async () => '',
      setExitCode: () => undefined,
      write: (message) => out.push(message),
      writeError: (message) => out.push(message),
    };
    expect(await runCommand(createCommand(fakeFileSystem), ['--help'], context)).toBe(0);
    expect(out[0]).toContain('aidx-delta.ts record');
    expect(out[0]).toContain('aidx-delta.ts history');
  });
});
