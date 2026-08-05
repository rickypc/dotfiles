import type { CommandResult, CommandSpec } from './contracts.js';
import type { CommandExecutor } from './process.js';

export interface SearchAttempt {
  readonly command: string;
  readonly detail: string;
  readonly status: SearchAttemptStatus;
  readonly strategy: string;
}

export type SearchAttemptStatus = 'error' | 'found' | 'not-found' | 'skipped';

export interface SearchFallbackReceipt {
  readonly attempts: readonly SearchAttempt[];
  readonly found: boolean;
  readonly output: string;
}

const ignoredGlobs = ['!**/.git/**', '!**/node_modules/**'] as const;
const rgContextLines = 2;

const assertSearchInput = (root: string, query: string): void => {
  if (!root.startsWith('/')) {
    throw new Error('Search root must be an absolute path.');
  }
  if (!query.trim()) {
    throw new Error('Search query is required.');
  }
};

export const commandText = (spec: CommandSpec): string =>
  [
    ...Object.entries(spec.environment ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}=${value}`),
    spec.command,
    ...spec.args,
  ].join(' ');

const outputFor = (result: CommandResult): string =>
  [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

const attempt = async (
  executor: CommandExecutor,
  strategy: string,
  spec: CommandSpec,
): Promise<{ readonly attempt: SearchAttempt; readonly output: string }> => {
  try {
    const result = await executor(spec);
    const output = outputFor(result);
    return {
      attempt: {
        command: commandText(spec),
        detail: output || `Exit code ${result.code}.`,
        status:
          result.code === 0 && output
            ? 'found'
            : result.code === 1
              ? 'not-found'
              : 'error',
        strategy,
      },
      output,
    };
  } catch (error) {
    return {
      attempt: {
        command: commandText(spec),
        detail: error instanceof Error ? error.message : String(error),
        status: 'error',
        strategy,
      },
      output: '',
    };
  }
};

const rgGlobs = (): readonly string[] =>
  ignoredGlobs.flatMap((glob) => ['--glob', glob]);

export const rgFilesCommand = (root: string): CommandSpec => ({
  args: ['--files', ...rgGlobs(), root],
  command: 'rg',
});

export const rgLiteralCommand = (
  root: string,
  query: string,
  ignoreCase: boolean,
): CommandSpec => ({
  args: [
    '--color',
    'never',
    '--context',
    String(rgContextLines),
    '--line-number',
    '--fixed-strings',
    ...(ignoreCase ? ['--ignore-case'] : []),
    ...rgGlobs(),
    query,
    root,
  ],
  command: 'rg',
});

export const skippedRgAttempts = (
  root: string,
  query: string,
  detail: string,
): readonly SearchAttempt[] =>
  (
    [
      ['rg-literal', rgLiteralCommand(root, query, false)],
      ['rg-literal-ignore-case', rgLiteralCommand(root, query, true)],
      ['rg-files', rgFilesCommand(root)],
    ] as const satisfies readonly (readonly [string, CommandSpec])[]
  ).map(([strategy, spec]) => ({
    command: commandText(spec),
    detail,
    status: 'skipped',
    strategy,
  }));

export const stagedRgSearch = async (
  executor: CommandExecutor,
  root: string,
  query: string,
): Promise<SearchFallbackReceipt> => {
  assertSearchInput(root, query);
  const attempts: SearchAttempt[] = [];
  const literal = await attempt(
    executor,
    'rg-literal',
    rgLiteralCommand(root, query, false),
  );
  attempts.push(literal.attempt);
  if (literal.attempt.status === 'found') {
    return {
      attempts: [
        ...attempts,
        ...skippedRgAttempts(
          root,
          query,
          'Skipped because rg-literal found a match.',
        ).slice(1),
      ],
      found: true,
      output: literal.output,
    };
  }
  const insensitive = await attempt(
    executor,
    'rg-literal-ignore-case',
    rgLiteralCommand(root, query, true),
  );
  attempts.push(insensitive.attempt);
  if (insensitive.attempt.status === 'found') {
    return {
      attempts: [
        ...attempts,
        ...skippedRgAttempts(
          root,
          query,
          'Skipped because rg-literal-ignore-case found a match.',
        ).slice(2),
      ],
      found: true,
      output: insensitive.output,
    };
  }
  const files = await attempt(executor, 'rg-files', rgFilesCommand(root));
  const matchingPaths = files.output
    .split('\n')
    .filter(Boolean)
    .filter((path) => path.toLowerCase().includes(query.trim().toLowerCase()));
  const fileAttempt: SearchAttempt = {
    ...files.attempt,
    detail: matchingPaths.length
      ? matchingPaths.join('\n')
      : files.attempt.status === 'error'
        ? files.attempt.detail
        : 'No matching file paths.',
    status:
      files.attempt.status === 'error'
        ? 'error'
        : matchingPaths.length
          ? 'found'
          : 'not-found',
  };
  attempts.push(fileAttempt);
  return {
    attempts,
    found: fileAttempt.status === 'found',
    output: matchingPaths.join('\n'),
  };
};
