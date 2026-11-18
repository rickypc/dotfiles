import { type ParseArgsConfig, parseArgs } from 'node:util';
import type {
  CommandBody,
  CommandDeclaration,
  OptionDeclaration,
  OutputFormat,
  ParsedInput,
} from './declaration.js';
import { usageText } from './usage.js';
import { UsageError } from './usage-error.js';

type ParseOptions = NonNullable<ParseArgsConfig['options']>;

export type ParseResult<Data> =
  | { readonly kind: 'help'; readonly text: string }
  | {
      readonly body: CommandBody<Data>;
      readonly format: OutputFormat;
      readonly input: ParsedInput;
      readonly kind: 'run';
    };

const HELP_FLAGS = new Set(['--help', '-h', '--usage']);

const SHARED_OPTIONS: ParseOptions = {
  'agents-root': { type: 'string' },
  format: { type: 'string' },
  help: { short: 'h', type: 'boolean' },
  usage: { type: 'boolean' },
};

const bodiesOf = <Data>(declaration: CommandDeclaration<Data>): CommandBody<Data>[] =>
  declaration.commands === undefined ? [declaration] : Object.values(declaration.commands);

const checkArity = <Data>(body: CommandBody<Data>, count: number): void => {
  const [min, max] = body.arity ?? [0, Number.POSITIVE_INFINITY];
  if (count < min || count > max) {
    throw new UsageError(`Expected positional arguments: ${body.positionals ?? 'none'}.`);
  }
};

const checkOptions = <Data>(
  body: CommandBody<Data>,
  command: string | undefined,
  provided: readonly string[],
): void => {
  const allowed = new Set([...Object.keys(SHARED_OPTIONS), ...Object.keys(body.options ?? {})]);
  const stray = provided.find((name) => !allowed.has(name));
  if (stray !== undefined) {
    throw new UsageError(`Option --${stray} does not apply to "${command}".`);
  }
};

const formatOf = (value: unknown): OutputFormat => {
  if (value === undefined || value === 'json') {
    return 'json';
  }
  if (value === 'text') {
    return 'text';
  }
  throw new UsageError('--format must be json or text.');
};

const selectBody = <Data>(
  declaration: CommandDeclaration<Data>,
  positionals: readonly string[],
): { body: CommandBody<Data>; command: string | undefined; rest: readonly string[] } => {
  if (declaration.commands === undefined) {
    return { body: declaration, command: undefined, rest: positionals };
  }
  const names = Object.keys(declaration.commands).join(', ');
  const [first, ...others] = positionals;
  const fallback = declaration.defaultCommand;
  if (
    fallback !== undefined
    && (first === undefined || declaration.commands[first] === undefined)
  ) {
    const defaultBody = declaration.commands[fallback];
    if (defaultBody !== undefined) {
      return { body: defaultBody, command: fallback, rest: positionals };
    }
  }
  const [command, rest] = [first, others];
  if (command === undefined) {
    throw new UsageError(`Expected one of: ${names}.`);
  }
  const body = declaration.commands[command];
  if (body === undefined) {
    throw new UsageError(`Unknown command "${command}". Expected one of: ${names}.`);
  }
  return { body, command, rest };
};

const tokensOf = (args: readonly string[], options: ParseOptions) => {
  try {
    return parseArgs({ allowPositionals: true, args: [...args], options, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
};

const toParseOption = (option: OptionDeclaration): ParseOptions[string] => ({
  ...(option.multiple ? { multiple: true } : {}),
  ...(option.short ? { short: option.short } : {}),
  type: option.type,
});

const declaredOptions = <Data>(bodies: readonly CommandBody<Data>[]): ParseOptions => {
  const merged: ParseOptions = {};
  for (const body of bodies) {
    for (const [name, option] of Object.entries(body.options ?? {})) {
      if (name in SHARED_OPTIONS || option.short === 'h') {
        throw new Error(`Option --${name} is reserved for the shared command-line switches.`);
      }
      merged[name] = toParseOption(option);
    }
  }
  return merged;
};

export const parseCommandLine = <Data>(
  declaration: CommandDeclaration<Data>,
  args: readonly string[],
): ParseResult<Data> => {
  const options = { ...SHARED_OPTIONS, ...declaredOptions(bodiesOf(declaration)) };
  if (args.some((arg) => HELP_FLAGS.has(arg))) {
    return { kind: 'help', text: usageText(declaration) };
  }
  const { positionals, values } = tokensOf(args, options);
  const { body, command, rest } = selectBody(declaration, positionals);
  const provided = Object.keys(values);
  if (command !== undefined) {
    checkOptions(body, command, provided);
  }
  checkArity(body, rest.length);
  const { 'agents-root': agentsRoot, format, help: _help, usage: _usage, ...declared } = values;
  return {
    body,
    format: formatOf(format),
    input: {
      agentsRoot: typeof agentsRoot === 'string' ? agentsRoot : undefined,
      command,
      positionals: rest,
      values: declared,
    },
    kind: 'run',
  };
};
