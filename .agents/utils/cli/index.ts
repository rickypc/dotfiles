import { splitAgentsRoot } from '../agents-root.js';
import { type CliContext, defaultContext } from './context.js';
import type { CommandDeclaration, OutputFormat } from './declaration.js';
import { type Envelope, failureEnvelope, renderEnvelope, successEnvelope } from './envelope.js';
import { errorMessage } from './errors.js';
import { EXIT_CODES } from './exit-codes.js';
import { parseCommandLine } from './parse.js';
import { UsageError } from './usage-error.js';

const checkedAgentsRoot = async (
  context: CliContext,
  agentsRoot: string | undefined,
): Promise<string | undefined> => {
  if (agentsRoot === undefined) {
    return undefined;
  }
  try {
    return (await splitAgentsRoot(['--agents-root', agentsRoot], context.listDirectory)).root;
  } catch (error) {
    throw new UsageError(errorMessage(error));
  }
};

const emit = <Data>(
  context: CliContext,
  envelope: Envelope<Data>,
  format: OutputFormat,
  renderText?: (data: Data) => string,
): number => {
  const text = renderEnvelope(envelope, format, renderText);
  (format === 'text' && !envelope.ok ? context.writeError : context.write)(text);
  context.setExitCode(envelope.exitCode);
  return envelope.exitCode;
};

export const runCommand = async <Data>(
  declaration: CommandDeclaration<Data>,
  args: readonly string[],
  context: CliContext,
): Promise<number> => {
  let parsed: ReturnType<typeof parseCommandLine<Data>>;
  try {
    parsed = parseCommandLine(declaration, args);
  } catch (error) {
    return emit(context, failureEnvelope(declaration.script, error), 'json');
  }
  if (parsed.kind === 'help') {
    context.write(parsed.text);
    context.setExitCode(EXIT_CODES.success);
    return EXIT_CODES.success;
  }
  const { body, format, input } = parsed;
  const command = input.command ? `${declaration.script} ${input.command}` : declaration.script;
  try {
    const agentsRoot = await checkedAgentsRoot(context, input.agentsRoot);
    const data = await body.run({ ...input, agentsRoot }, context);
    return emit(context, successEnvelope(command, data), format, body.renderText);
  } catch (error) {
    return emit(
      context,
      failureEnvelope(command, error),
      format,
      body.renderText as ((data: unknown) => string) | undefined,
    );
  }
};

export const runMain = <Data>(
  declaration: CommandDeclaration<Data>,
  isMain: boolean,
  args: readonly string[] = Bun.argv.slice(2),
  context: CliContext = defaultContext(),
): Promise<number> | undefined => (isMain ? runCommand(declaration, args, context) : undefined);
