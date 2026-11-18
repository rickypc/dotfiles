import type { CliContext } from './context.js';

export interface CommandBody<Data> {
  readonly arity?: readonly [number, number];
  readonly options?: Readonly<Record<string, OptionDeclaration>>;
  readonly positionals?: string;
  readonly renderText?: (data: Data) => string;
  readonly run: (input: ParsedInput, context: CliContext) => Data | Promise<Data>;
  readonly summary: string;
}

export type CommandDeclaration<Data> = GroupCommand<Data> | SingleCommand<Data>;

export interface GroupCommand<Data> {
  readonly commands: Readonly<Record<string, CommandBody<Data>>>;
  readonly defaultCommand?: string;
  readonly script: string;
  readonly summary: string;
}

export interface OptionDeclaration {
  readonly description: string;
  readonly multiple?: boolean;
  readonly short?: string;
  readonly type: 'boolean' | 'string';
  readonly value?: string;
}

export type OptionValue = boolean | readonly (boolean | string)[] | string | undefined;

export type OutputFormat = 'json' | 'text';

export interface ParsedInput {
  readonly agentsRoot: string | undefined;
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly values: Readonly<Record<string, OptionValue>>;
}

export interface SingleCommand<Data> extends CommandBody<Data> {
  readonly commands?: undefined;
  readonly script: string;
}
