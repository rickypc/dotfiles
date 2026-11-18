import type { CommandBody, CommandDeclaration, ParsedInput } from '../../utils/cli/declaration.js';
import type { FileSystem } from '../../utils/filesystem.js';

type FlagKind = 'boolean' | 'string';

export interface SkillManagerOverrides {
  readonly fileSystem?: FileSystem;
  readonly read?: (path: string) => Promise<string | Buffer>;
}

type SkillManagerRunner = (
  args: readonly string[],
  read: SkillManagerOverrides['read'],
  write: (message: string) => void,
  fileSystem: SkillManagerOverrides['fileSystem'],
) => Promise<void>;

type Spec = readonly [
  verb: string,
  summary: string,
  positionals: string,
  min: number,
  max: number,
  flags?: Readonly<Record<string, FlagKind>>,
];

const MANY = Number.POSITIVE_INFINITY;

const TRAIN_FLAGS: Readonly<Record<string, FlagKind>> = {
  attempt: 'string',
  'ledger-root': 'string',
  'max-body-lines': 'string',
  'max-description-change': 'string',
  'measure-only': 'boolean',
  runs: 'string',
  'skills-root': 'string',
  status: 'string',
  track: 'string',
};

const SPECS: readonly Spec[] = [
  [
    'atoms',
    'Preview or write the atom maps.',
    '<absolute-agents-root> [owner-id]',
    1,
    2,
    { write: 'boolean' },
  ],
  [
    'audit',
    'Audit atom maps and comprehension sets.',
    '<absolute-agents-root> [owner-id]',
    1,
    2,
    { check: 'boolean' },
  ],
  [
    'batch',
    'Run baseline or candidate evaluations for several skills.',
    '<review-id> <baseline|candidate> <absolute-matrix-jsonl-path> <absolute-skill-file-path>...',
    4,
    MANY,
  ],
  [
    'check',
    'Score one proposed batch.',
    '<absolute-agents-root> <batch-id>',
    2,
    2,
    { 'allow-swap': 'string' },
  ],
  ['commit', 'Commit one checked batch.', '<absolute-agents-root> <batch-id>', 2, 2],
  [
    'evaluate',
    'Evaluate one skill file against a matrix.',
    '<baseline|candidate|challenge> <absolute-matrix-jsonl-path> <absolute-skill-file-path>',
    3,
    3,
  ],
  ['init', 'Create a new skill.', '<absolute-skill-path> <description>', 2, 2],
  [
    'packet',
    'Render an action packet.',
    '<review-id> <state> <absolute-skill-path> [failed-assertion-ids]',
    3,
    4,
  ],
  [
    'propose',
    'Propose instruction edits from a JSON file.',
    '<absolute-agents-root> <absolute-proposal-json>',
    2,
    2,
  ],
  [
    'ratchet',
    'Ratchet a matrix or query set.',
    '<absolute-previous-path> <absolute-next-path> [absolute-retirements.json]',
    2,
    3,
  ],
  [
    'review',
    'Review a skill or static root.',
    '<absolute-skill-or-static-root-path> [absolute-additional-static-root-path]',
    1,
    2,
  ],
  [
    'seal',
    'Seal a behavior capture.',
    '<absolute-agents-root> <owner-id> <case-id> <absolute-capture-json> <document-sha256>',
    5,
    5,
  ],
  [
    'train',
    'Bundle, measure, or select a train run.',
    '<bundle|measure|select> <absolute-skill-path-or-comprehension-set-json> [absolute-responses-jsonl-path]',
    2,
    3,
    TRAIN_FLAGS,
  ],
  ['validate', 'Validate one skill.', '<absolute-skill-path>', 1, 1],
];

const flagArguments = (input: ParsedInput, flags: Readonly<Record<string, FlagKind>>): string[] =>
  Object.entries(flags).flatMap(([name, kind]) => {
    const value = input.values[name];
    if (kind === 'boolean') {
      return value === true ? [`--${name}`] : [];
    }
    return typeof value === 'string' ? [`--${name}`, value] : [];
  });

const skillManagerText = (data: unknown): string =>
  typeof data === 'object' && data !== null && 'output' in data
    ? String(data.output)
    : JSON.stringify(data, null, 2);

const bodyFor = (
  [verb, summary, positionals, min, max, flags = {}]: Spec,
  runCore: SkillManagerRunner,
  overrides: SkillManagerOverrides,
): CommandBody<unknown> => ({
  arity: [min, max],
  options: Object.fromEntries(
    Object.entries(flags).map(([name, type]) => [name, { description: `The ${name} flag.`, type }]),
  ),
  positionals,
  renderText: skillManagerText,
  run: async (input) => {
    const lines: string[] = [];
    const args = [verb, ...input.positionals, ...flagArguments(input, flags)];
    await runCore(args, overrides.read, (message) => lines.push(message), overrides.fileSystem);
    const output = lines.join('\n');
    return /^[[{]/u.test(output) ? (JSON.parse(output) as unknown) : { output };
  },
  summary,
});

export const buildCommand = (
  runCore: SkillManagerRunner,
  overrides: SkillManagerOverrides,
): CommandDeclaration<unknown> => ({
  commands: Object.fromEntries(SPECS.map((spec) => [spec[0], bodyFor(spec, runCore, overrides)])),
  script: 'scripts/skill-manager/index.ts',
  summary:
    'Skill and instruction lifecycle: audit, atoms, propose, check, commit, train, and more.',
});
