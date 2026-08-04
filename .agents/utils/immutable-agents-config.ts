import type { CommandResult, CommandSpec } from './contracts.js';
import type { CommandExecutor } from './process.js';

export interface ImmutableAgentsConfigReceipt {
  readonly detail: string;
  readonly paths: readonly string[];
  readonly status: 'failed' | 'passed';
}

export const protectedAgentsConfigPaths = [
  '.gitignore',
  'biome.jsonc',
  'bunfig.toml',
  'LICENSE',
  'NOTICE',
  'package.json',
  'tsconfig.json',
] as const;

const failedReceipt = (
  detail: string,
  paths: readonly string[] = [],
): ImmutableAgentsConfigReceipt => ({
  detail,
  paths,
  status: 'failed',
});

const gitStatusSpecFor = (agentsRoot: string): CommandSpec => ({
  args: [
    '-C',
    agentsRoot,
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...protectedAgentsConfigPaths.map((path) => `.agents/${path}`),
  ],
  command: 'git',
  cwd: agentsRoot,
});

const hasWorktreeMutation = (line: string): boolean =>
  line.length >= 2 && line[1] !== ' ';

const passedReceipt = (): ImmutableAgentsConfigReceipt => ({
  detail:
    'immutable-agents-config: passed — protected files match the Git index.',
  paths: [],
  status: 'passed',
});

const resultFailure = (
  result: CommandResult,
): ImmutableAgentsConfigReceipt | undefined => {
  if (result.code === 0) {
    return undefined;
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  return failedReceipt(
    `Unable to verify protected .agents files: git exited with code ${result.code}${output ? `: ${output}` : '.'}`,
  );
};

export const checkImmutableAgentsConfig = async (
  executor: CommandExecutor,
  agentsRoot: string,
): Promise<ImmutableAgentsConfigReceipt> => {
  const spec = gitStatusSpecFor(agentsRoot);
  const result = await executor(spec);
  const failure = resultFailure(result);
  if (failure) {
    return failure;
  }
  const lines = result.stdout.split('\n').filter(Boolean);
  const changedPaths = lines
    .filter(hasWorktreeMutation)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  if (changedPaths.length > 0) {
    return failedReceipt(
      `Protected .agents configuration has worktree changes: ${changedPaths.join(', ')}. Restore those files to the Git index, or stop and ask the user to make the configuration change.`,
      changedPaths,
    );
  }
  return passedReceipt();
};
