import { describe, expect, test } from 'bun:test';
import { createCommand } from '../../../scripts/skill-manager/index.js';
import { runCommand } from '../../../utils/cli/index.js';
import type { FileSystem } from '../../../utils/filesystem.js';

const failingFileSystem: FileSystem = {
  exists: async () => false,
  mkdir: async () => undefined,
  readFile: async () => {
    throw new Error('no such file');
  },
  rm: async () => undefined,
  writeFile: async () => undefined,
};

const exec = async (args: readonly string[]) => {
  const out: string[] = [];
  const sink = (message: string) => out.push(message);
  const code = await runCommand(
    createCommand({
      fileSystem: failingFileSystem,
      read: async () => {
        throw new Error('no such file');
      },
    }),
    args,
    {
      listDirectory: async () => [{ isDirectory: true, name: 'skills' }],
      readStdin: async () => '',
      setExitCode: () => undefined,
      write: sink,
      writeError: sink,
    },
  );
  return { code, out };
};

describe('skill-manager command', () => {
  test('prints structured output as envelope data and plain output as text', async () => {
    const packet = await exec(['packet', 'improve-skill', 'draft', '/skill.md']);
    expect(packet.code).toBe(0);
    expect(JSON.parse(packet.out[0] ?? '').data).toBeDefined();
    const text = await exec(['packet', 'improve-skill', 'draft', '/skill.md', '--format', 'text']);
    expect(text.out[0]).toContain('improve-skill');
  });

  test.each([
    [['validate', 'relative-root']],
    [['atoms', '/agents', '--write']],
    [['check', '/agents', 'batch-1', '--allow-swap', 'reason']],
    [['train', 'measure', '/skill', '/responses.jsonl', '--attempt', '1', '--measure-only']],
  ])('maps a core failure of %j to exit 1', async (args) => {
    expect((await exec(args)).code).toBe(1);
  });

  test('passes the --check flag through to the audit', async () => {
    const audited = await exec(['audit', '/agents', '--check', '--format', 'text']);
    expect(audited.code).toBe(0);
    expect(audited.out[0]).toContain('atom-maps');
  });

  test.each([[[]], [['unknown']], [['validate']], [['seal', '/agents', 'owner']]])(
    'maps the argument shape %j to usage exit 2',
    async (args) => {
      expect((await exec(args)).code).toBe(2);
    },
  );

  test('answers --help with every verb', async () => {
    const help = await exec(['--help']);
    expect(help.code).toBe(0);
    for (const verb of ['atoms', 'propose', 'train', 'validate']) {
      expect(help.out[0]).toContain(verb);
    }
  });
});
