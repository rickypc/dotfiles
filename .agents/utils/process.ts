import type { CommandResult, CommandSpec } from './contracts.js';

export type BunSpawner = (options: {
  readonly cmd: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stderr: 'pipe';
  readonly stdout: 'pipe';
}) => SpawnedProcess;

export type CommandExecutor = (spec: CommandSpec) => Promise<CommandResult>;

export interface SpawnedProcess {
  readonly exited: Promise<number>;
  readonly stderr: ReadableStream<Uint8Array> | null;
  readonly stdout: ReadableStream<Uint8Array> | null;
}

const decode = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> => {
  if (stream === null) {
    return '';
  }
  return new Response(stream).text();
};

export const createBunExecutor =
  (spawn: BunSpawner): CommandExecutor =>
  async (spec) => {
    const options = {
      cmd: [spec.command, ...spec.args],
      cwd: spec.cwd,
      stderr: 'pipe',
      stdout: 'pipe',
    } as const;
    const process = spec.environment
      ? spawn({ ...options, env: { ...Bun.env, ...spec.environment } })
      : spawn(options);
    const [code, stderr, stdout] = await Promise.all([
      process.exited,
      decode(process.stderr),
      decode(process.stdout),
    ]);
    return { code, stderr, stdout };
  };

export const bunExecutor = createBunExecutor(
  Bun.spawn as unknown as BunSpawner,
);

export const requireSuccess = (
  spec: CommandSpec,
  result: CommandResult,
): CommandResult => {
  if (result.code !== 0) {
    const rendered = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(
      `${spec.command} exited with code ${result.code}${rendered ? `: ${rendered}` : ''}`,
    );
  }
  return result;
};

export const execute = async (
  executor: CommandExecutor,
  spec: CommandSpec,
): Promise<CommandResult> => requireSuccess(spec, await executor(spec));
