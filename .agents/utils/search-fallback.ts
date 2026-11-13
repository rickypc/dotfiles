import type { CommandResult, CommandSpec } from './contracts.js';
import type { CommandExecutor } from './process.js';

export interface SearchAttempt {
  readonly command: string;
  readonly detail: string;
  readonly status: SearchAttemptStatus;
  readonly strategy: string;
}

export type SearchAttemptStatus = 'error' | 'found' | 'not-found' | 'skipped';

/** Named budget constants for the staged fallback envelope contract. */
export const resultsPerSlot = 8;
export const detailMaxChars = 200;

/** Directories always excluded from the default staged fallback sweep. */
export const fallbackExcludedGlobs = ['!**/build/**', '!**/coverage/**', '!**/dist/**'] as const;

export interface SearchFallbackReceipt {
  readonly attempts: readonly SearchAttempt[];
  readonly found: boolean;
  readonly output: string;
  /** The content slots that answered: the whole query or per-token keyword slots. */
  readonly slots: readonly SearchFallbackSlot[];
  /** True when the budgets cut results or details from the winning slots' raw output. */
  readonly truncated: boolean;
}

/** One answered staged-fallback content slot and its raw rg output. */
export interface SearchFallbackSlot {
  readonly keyword: string;
  readonly output: string;
}

export interface StagedSearchOptions {
  /** Restores the unfiltered sweep: ignore-file transparency plus no extra excludes. */
  readonly raw?: boolean;
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

/**
 * The unique lowercase whitespace tokens of a query, excluding any token that equals the
 * whole query (the whole-query slots already cover it) and empty strings.
 */
export const fallbackQueryTokens = (query: string): readonly string[] => {
  const normalized = query.trim().toLowerCase();
  return [...new Set(normalized.split(/\s+/u).filter((token) => token && token !== normalized))];
};

const foundReceipt = (
  attempts: readonly SearchAttempt[],
  slots: readonly SearchFallbackSlot[],
): SearchFallbackReceipt => ({
  attempts,
  found: true,
  output: slots.map((slot) => slot.output).join('\n'),
  slots,
  truncated: false,
});

const outputFor = (result: CommandResult): string =>
  [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

const attempt = async (
  executor: CommandExecutor,
  strategy: string,
  spec: CommandSpec,
): Promise<{ readonly attempt: SearchAttempt; readonly output: string }> => {
  try {
    const result = await executor(spec);
    const output = result.stdout.trim();
    return {
      attempt: {
        command: commandText(spec),
        detail: outputFor(result) || `Exit code ${result.code}.`,
        status:
          result.code === 0
            ? output
              ? 'found'
              : 'not-found'
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

const rgGlobs = (raw: boolean): readonly string[] =>
  (raw ? ignoredGlobs : [...ignoredGlobs, ...fallbackExcludedGlobs]).flatMap((glob) => [
    '--glob',
    glob,
  ]);

/** `--hidden` stays in both modes; ignore files are respected unless the raw escape is set. */
const rgTransparencyFlags = (raw: boolean): readonly string[] =>
  raw ? ['--hidden', '--no-ignore'] : ['--hidden'];

export const rgFilesCommand = (root: string, raw = false): CommandSpec => ({
  args: ['--files', ...rgTransparencyFlags(raw), ...rgGlobs(raw), root],
  command: 'rg',
});

export const rgLiteralCommand = (
  root: string,
  query: string,
  ignoreCase: boolean,
  raw = false,
): CommandSpec => ({
  args: [
    '--color',
    'never',
    '--context',
    String(rgContextLines),
    '--line-number',
    '--fixed-strings',
    ...(ignoreCase ? ['--ignore-case'] : []),
    ...rgTransparencyFlags(raw),
    ...rgGlobs(raw),
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

/**
 * The two-tier tokenized staged fallback: whole-query literal slots first, then every
 * unique lowercase token of three or more characters, then sub-3-character tokens only
 * when every earlier slot returned zero results, then file-name discovery. Every answered
 * slot of a tier contributes its tagged results; the first tier with any answer wins.
 */
export const stagedRgSearch = async (
  executor: CommandExecutor,
  root: string,
  query: string,
  options: StagedSearchOptions = {},
): Promise<SearchFallbackReceipt> => {
  assertSearchInput(root, query);
  const raw = options.raw === true;
  const attempts: SearchAttempt[] = [];
  const literal = await attempt(executor, 'rg-literal', rgLiteralCommand(root, query, false, raw));
  attempts.push(literal.attempt);
  if (literal.attempt.status === 'found') {
    return foundReceipt(
      [
        ...attempts,
        ...skippedRgAttempts(root, query, 'Skipped because rg-literal found a match.').slice(1),
      ],
      [{ keyword: query, output: literal.output }],
    );
  }
  const insensitive = await attempt(
    executor,
    'rg-literal-ignore-case',
    rgLiteralCommand(root, query, true, raw),
  );
  attempts.push(insensitive.attempt);
  if (insensitive.attempt.status === 'found') {
    return foundReceipt(
      [
        ...attempts,
        ...skippedRgAttempts(
          root,
          query,
          'Skipped because rg-literal-ignore-case found a match.',
        ).slice(2),
      ],
      [{ keyword: query, output: insensitive.output }],
    );
  }
  const tokens = fallbackQueryTokens(query);
  const runTokenSlot = async (token: string): Promise<SearchFallbackSlot | null> => {
    const slot = await attempt(
      executor,
      `rg-token:${token}`,
      rgLiteralCommand(root, token, true, raw),
    );
    attempts.push(slot.attempt);
    return slot.attempt.status === 'found' ? { keyword: token, output: slot.output } : null;
  };
  const runTokenTier = async (tokens: readonly string[]): Promise<SearchFallbackSlot[]> => {
    const found: SearchFallbackSlot[] = [];
    for (const token of tokens) {
      const slot = await runTokenSlot(token);
      if (slot) {
        found.push(slot);
      }
    }
    return found;
  };
  // Tier one: every token of three or more characters runs and may contribute results.
  const tierOneSlots = await runTokenTier(tokens.filter((token) => token.length >= 3));
  if (tierOneSlots.length > 0) {
    return foundReceipt(attempts, tierOneSlots);
  }
  // Tier two: sub-3-character tokens only when every earlier slot returned zero results.
  const tierTwoSlots = await runTokenTier(tokens.filter((token) => token.length < 3));
  if (tierTwoSlots.length > 0) {
    return foundReceipt(attempts, tierTwoSlots);
  }
  const files = await attempt(executor, 'rg-files', rgFilesCommand(root, raw));
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
      files.attempt.status === 'error' ? 'error' : matchingPaths.length ? 'found' : 'not-found',
  };
  attempts.push(fileAttempt);
  return {
    attempts,
    found: fileAttempt.status === 'found',
    output: matchingPaths.join('\n'),
    slots: [],
    truncated: false,
  };
};
