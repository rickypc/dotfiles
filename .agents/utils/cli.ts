export type CliRunner<Result> = (values: readonly string[]) => Result | Promise<Result>;

export type CliUsage = () => string;

export const runWhenMain = <Result>(
  isMain: boolean,
  args: readonly string[],
  runner: CliRunner<Result>,
): Result | Promise<Result> | undefined => (isMain ? runner(args) : undefined);

export const runWhenMainWithHelp = <Result>(
  isMain: boolean,
  args: readonly string[],
  usage: CliUsage,
  runner: CliRunner<Result>,
  write: (message: string) => void = console.log,
): Result | Promise<Result> | undefined => {
  if (!isMain) {
    return undefined;
  }
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    write(usage());
    return undefined;
  }
  return runner(args);
};
