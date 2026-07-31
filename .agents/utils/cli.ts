export type CliRunner<Result> = (
  values: readonly string[],
) => Result | Promise<Result>;

export const runWhenMain = <Result>(
  isMain: boolean,
  args: readonly string[],
  runner: CliRunner<Result>,
): Result | Promise<Result> | undefined => (isMain ? runner(args) : undefined);
