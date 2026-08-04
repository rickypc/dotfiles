import type { CliRunner } from '../cli.js';

const messageFor = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const formatAidlcCliError = (error: unknown): string => {
  const message = messageFor(error);
  if (/^AIDLC intent .*(?:invalid|missing)/u.test(message)) {
    return [
      `AIDLC intent file is invalid: ${message}`,
      'Repair its YAML frontmatter with gray-matter, then rerun the same AIDLC command.',
      'Do not replace the file manually or create a second intent.',
    ].join('\n');
  }
  return `AIDLC command failed: ${message}`;
};

export const runAidlcCliWhenMain = <Result>(
  isMain: boolean,
  args: readonly string[],
  runner: CliRunner<Result>,
): void => {
  if (!isMain) {
    return;
  }
  void Promise.resolve(runner(args)).catch((error: unknown) => {
    console.error(formatAidlcCliError(error));
    process.exitCode = 1;
  });
};
