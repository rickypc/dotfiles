import { expect, test } from 'bun:test';

import { command } from '../../scripts/content-writer.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const exec = async (args: readonly string[]) => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  return { code: await runCommand(command, [...args, '--format', 'text'], context), out };
};

const source = JSON.stringify({
  author: 'a',
  date: 'd',
  publisher: 'p',
  sourceClass: 'official',
  url: 'https://example.com',
});

test('accepts an admissible claim source', async () => {
  const { code, out } = await exec(['validate-source', source]);
  expect(code).toBe(0);
  expect(out).toEqual(['claim-source: passed']);
});

test('renders a content outline', async () => {
  const { out } = await exec([
    'outline',
    JSON.stringify({
      audience: 'reader',
      citationStyle: 'links',
      constraints: 'none',
      format: 'article',
      objective: 'Explain',
      scope: 'scope',
      tone: 'clear',
      webOptimization: false,
    }),
  ]);
  expect(out[0]).toContain('Evidence-backed');
});

test('validates a complete content package', async () => {
  const { out } = await exec([
    'validate-draft',
    JSON.stringify({
      brief: {
        audience: 'reader',
        citationStyle: 'links',
        constraints: 'none',
        format: 'article',
        objective: 'Explain',
        scope: 'scope',
        tone: 'clear',
        webOptimization: false,
      },
      claims: [
        {
          sourceUrl: 'https://example.com/source',
          statement: 'Supported statement.',
        },
      ],
      draft: 'Supported statement.',
      result: 'ready',
      sources: [
        {
          author: 'Author',
          date: '2026-01-01',
          publisher: 'Publisher',
          sourceClass: 'official',
          url: 'https://example.com/source',
        },
      ],
    }),
  ]);
  expect(out).toEqual(['content-draft: ready']);
});

test('maps inadmissible sources to exit 1 and bad input to usage exit 2', async () => {
  expect((await exec(['validate-source', '{}'])).code).toBe(1);
  expect((await exec(['validate-source', 'not-json'])).code).toBe(2);
  expect((await exec([])).code).toBe(2);
  expect((await exec(['other', '{}'])).code).toBe(2);
});

test('answers --help with every subcommand', async () => {
  const { code, out } = await exec(['--help']);
  expect(code).toBe(0);
  expect(out[0]).toContain('validate-draft');
});
