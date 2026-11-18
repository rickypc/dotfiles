import { expect, test } from 'bun:test';

import type { CommandDeclaration } from '../../../utils/cli/declaration.js';
import { usageText } from '../../../utils/cli/usage.js';

const single: CommandDeclaration<string> = {
  options: {
    dry: { description: 'preview only', type: 'boolean' },
    tag: { description: 'a tag', multiple: true, short: 't', type: 'string', value: 'name' },
  },
  positionals: '<input>',
  run: () => 'ok',
  script: 'scripts/example.ts',
  summary: 'Example.',
};

test('renders usage line, summary, declared options, and shared switches', () => {
  const text = usageText(single);
  expect(text).toContain('Usage: bun <agents-root>/scripts/example.ts <input> [options]');
  expect(text).toContain('Example.');
  expect(text).toContain('--dry');
  expect(text).toContain('preview only');
  expect(text).toContain('-t, --tag <name>');
  expect(text).toContain('(repeatable)');
  expect(text).toContain('--format <json|text>');
  expect(text).toContain('--agents-root <path>');
  expect(text).toContain('-h, --help, --usage');
});

test('renders a command without declared positionals or options', () => {
  const text = usageText({ run: () => 1, script: 'scripts/bare.ts', summary: 'Bare.' });
  expect(text).toContain('Usage: bun <agents-root>/scripts/bare.ts [options]');
});

test('renders one usage line per subcommand', () => {
  const text = usageText({
    commands: {
      check: {
        options: { dry: { description: 'preview', type: 'boolean' } },
        run: () => 1,
        summary: 'Check it.',
      },
      record: { positionals: '<path>', run: () => 1, summary: 'Record it.' },
    },
    script: 'scripts/group.ts',
    summary: 'Group.',
  });
  expect(text).toContain('bun <agents-root>/scripts/group.ts check [options]');
  expect(text).toContain('bun <agents-root>/scripts/group.ts record <path> [options]');
  expect(text).toContain('Check it.');
  expect(text).toContain('--dry');
  expect(text).toContain('Record it.');
});

test('notes an omittable default subcommand', () => {
  const text = usageText({
    commands: { search: { run: () => 1, summary: 'Search.' } },
    defaultCommand: 'search',
    script: 'scripts/group.ts',
    summary: 'Group.',
  });
  expect(text).toContain('may be omitted');
});
