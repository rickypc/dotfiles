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
  readonly kill: (signal?: number) => void;
  readonly stderr: ReadableStream<Uint8Array> | null;
  readonly stdout: ReadableStream<Uint8Array> | null;
}

export const DEFAULT_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

const cancel = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<void> => {
  await stream?.cancel();
};

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
    const result = Promise.all([
      process.exited,
      decode(process.stderr),
      decode(process.stdout),
    ]);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const [code, stderr, stdout] = await Promise.race([
        result,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            reject(
              new Error(
                `${spec.command} timed out after ${spec.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS}ms`,
              ),
            );
          }, spec.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS);
        }),
      ]);
      return { code, stderr, stdout };
    } catch (error: unknown) {
      process.kill(9);
      await Promise.race([
        Promise.allSettled([
          process.exited,
          cancel(process.stderr),
          cancel(process.stdout),
        ]),
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);
      throw error;
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
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
