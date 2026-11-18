import { expect, test } from 'bun:test';
import { run, usage } from '../../scripts/skill-manager.js';

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const world = () => {
  const files = new Map<string, string>([
    [
      '/agents/evals/manifest.json',
      json({
        owners: [
          {
            artifacts: {
              atoms: [],
              comprehension: ['evals/skills/demo/comprehension/SKILL.json'],
            },
            directory: 'evals/skills/demo/',
            id: 'skill:demo',
            requiredLanes: ['atoms'],
          },
        ],
      }),
    ],
    ['/agents/evals/skills/demo/manifest.json', json({ artifacts: { atoms: [] } })],
    [
      '/agents/evals/skills/demo/comprehension/SKILL.json',
      json({
        queries: [{ evidence: 'final gate', id: 'p1' }],
        target: '../../../../skills/demo/SKILL.md',
      }),
    ],
    ['/agents/skills/demo/SKILL.md', '# Rules\n\nNever skip the final gate before closing.\n'],
  ]);
  const fileSystem = {
    exists: async (path: string) => files.has(path),
    mkdir: async () => undefined,
    readFile: async (path: string) => {
      const text = files.get(path);
      if (text === undefined) {
        throw new Error(`ENOENT ${path}`);
      }
      return text;
    },
    rm: async () => undefined,
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
    },
  };
  return { fileSystem, files };
};

test('atoms previews by default and writes maps and manifest lists with --write', async () => {
  const { files, fileSystem } = world();
  const output: string[] = [];
  const emit = (message: string): void => {
    output.push(message);
  };
  await run(['atoms', '/agents', 'skill:demo'], undefined, emit, fileSystem);
  const preview = JSON.parse(output[0] ?? '') as { maps: { status: string }[]; written: boolean };
  expect([preview.written, preview.maps.map((m) => m.status)]).toEqual([false, ['created']]);
  expect(files.has('/agents/evals/skills/demo/atoms/SKILL.md')).toBe(false);
  await run(['atoms', '/agents', '--write'], undefined, emit, fileSystem);
  expect(JSON.parse(output[1] ?? '')).toMatchObject({ written: true });
  expect(files.get('/agents/evals/skills/demo/atoms/SKILL.md')).toContain('type: atom-map');
  expect(files.get('/agents/evals/skills/demo/manifest.json')).toContain('atoms/SKILL.md');
});

test.each([
  [['atoms']],
  [['atoms', 'relative']],
  [['atoms', '/agents', 'a', 'b']],
  [['atoms', '/agents', '--write', '--write']],
])('atoms rejects the arguments %j with the usage text', async (args) => {
  await expect(run(args)).rejects.toThrow(usage());
});

test('audit --check passes for a custom root, which has no central atom lane', async () => {
  const { files, fileSystem } = world();
  const manifest = JSON.parse(files.get('/agents/evals/manifest.json') ?? '{}');
  files.set(
    '/agents/evals/manifest.json',
    JSON.stringify({
      ...manifest,
      policy: {
        atomChecks: {
          duplicateReportOnly: true,
          duplicateSimilarity: 0.5,
          maxDocumentChars: 100000,
        },
      },
    }),
  );
  const output: string[] = [];
  await run(['audit', '/agents', '--check'], undefined, (m) => output.push(m), fileSystem);
  expect(output).toEqual([
    'atom-maps: passed - every instruction document has an atom map that audits clean.',
  ]);
});

test('audit --check fails the run when the global runtime cannot be audited', async () => {
  const { fileSystem } = world();
  const empty = { ...fileSystem, readdir: async () => [] };
  const home = `${process.env.HOME ?? ''}/.agents`;
  await expect(run(['audit', home, '--check'], undefined, () => undefined, empty)).rejects.toThrow(
    'Atom gate failed',
  );
});

test('audit --check takes no owner id', async () => {
  await expect(run(['audit', '/agents', 'skill:demo', '--check'])).rejects.toThrow(usage());
});

test('the librarian and seal routes reach their owning commands', async () => {
  await expect(run(['propose'])).rejects.toThrow('Usage');
  await expect(run(['check'])).rejects.toThrow('Usage');
  await expect(run(['commit'])).rejects.toThrow('Usage');
  await expect(run(['seal'])).rejects.toThrow('Usage');
});
