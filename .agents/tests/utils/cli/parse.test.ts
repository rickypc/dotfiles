import { expect, test } from 'bun:test';

import type { CommandDeclaration } from '../../../utils/cli/declaration.js';
import { parseCommandLine } from '../../../utils/cli/parse.js';
import { UsageError } from '../../../utils/cli/usage-error.js';

const single: CommandDeclaration<string> = {
  arity: [1, 2],
  options: {
    dry: { description: 'preview only', type: 'boolean' },
    tag: { description: 'a tag', multiple: true, short: 't', type: 'string' },
  },
  positionals: '<input> [output]',
  run: () => 'ok',
  script: 'scripts/example.ts',
  summary: 'Example.',
};

const group: CommandDeclaration<string> = {
  commands: {
    check: {
      options: { dry: { description: 'preview', type: 'boolean' } },
      run: () => 'c',
      summary: 'Check.',
    },
    record: { arity: [1, 1], positionals: '<path>', run: () => 'r', summary: 'Record.' },
  },
  script: 'scripts/group.ts',
  summary: 'Group.',
};

const parsed = (declaration: CommandDeclaration<string>, args: readonly string[]) => {
  const result = parseCommandLine(declaration, args);
  if (result.kind !== 'run') {
    throw new Error('expected a run result');
  }
  return result;
};

test('parses positionals, booleans, repeated and short string options', () => {
  const { input, format } = parsed(single, [
    'a.json',
    '--dry',
    '-t',
    'x',
    '--tag',
    'y',
    'out.json',
  ]);
  expect(input.positionals).toEqual(['a.json', 'out.json']);
  expect(input.values.dry).toBe(true);
  expect(input.values.tag).toEqual(['x', 'y']);
  expect(input.command).toBeUndefined();
  expect(input.agentsRoot).toBeUndefined();
  expect(format).toBe('json');
});

test('treats --help, -h, and --usage as one help switch', () => {
  for (const flag of ['--help', '-h', '--usage']) {
    expect(parseCommandLine(single, [flag])).toMatchObject({
      kind: 'help',
      text: expect.stringContaining('Usage: bun <agents-root>/scripts/example.ts'),
    });
  }
});

test('answers help even when other required input is missing or invalid', () => {
  expect(parseCommandLine(single, ['--help', '--format', 'nope']).kind).toBe('help');
});

test('reads the shared --format and --agents-root switches', () => {
  const result = parsed(single, ['a', '--format', 'text', '--agents-root', '/root']);
  expect(result.format).toBe('text');
  expect(result.input.agentsRoot).toBe('/root');
});

test('rejects an unknown format, unknown flag, and missing flag value as usage errors', () => {
  for (const args of [
    ['a', '--format', 'xml'],
    ['a', '--nope'],
    ['a', '--tag'],
  ]) {
    expect(() => parseCommandLine(single, args)).toThrow(UsageError);
  }
});

test('rejects a wrong positional count with the declared grammar', () => {
  expect(() => parseCommandLine(single, [])).toThrow('<input> [output]');
  expect(() => parseCommandLine(single, ['a', 'b', 'c'])).toThrow(UsageError);
});

test('selects a subcommand and checks its own arity', () => {
  const result = parsed(group, ['record', 'p.json']);
  expect(result.input.command).toBe('record');
  expect(result.input.positionals).toEqual(['p.json']);
  expect(result.body.summary).toBe('Record.');
  expect(() => parseCommandLine(group, ['record'])).toThrow(UsageError);
});

test('falls back to the default subcommand when the first positional names none', () => {
  const withDefault: CommandDeclaration<string> = { ...group, defaultCommand: 'record' };
  const implicit = parsed(withDefault, ['p.json']);
  expect(implicit.input.command).toBe('record');
  expect(implicit.input.positionals).toEqual(['p.json']);
  expect(parsed(withDefault, ['record', 'p.json']).input.positionals).toEqual(['p.json']);
  expect(parsed(withDefault, ['check']).input.command).toBe('check');
  expect(() => parseCommandLine(withDefault, [])).toThrow(UsageError);
});

test('rejects a missing or unknown subcommand', () => {
  expect(() => parseCommandLine(group, [])).toThrow('Expected one of: check, record');
  expect(() => parseCommandLine(group, ['bogus'])).toThrow('Unknown command "bogus"');
});

test('rejects an option that belongs to a different subcommand', () => {
  expect(parsed(group, ['check', '--dry']).input.values.dry).toBe(true);
  expect(() => parseCommandLine(group, ['record', 'p', '--dry'])).toThrow('--dry');
});

test('refuses declarations that redefine a shared switch', () => {
  const clash: CommandDeclaration<string> = {
    ...single,
    options: { format: { description: 'x', type: 'string' } },
  };
  expect(() => parseCommandLine(clash, ['a'])).toThrow('reserved');
});
