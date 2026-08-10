import type { CommandResult, CommandSpec } from './contracts.js';

export type BunSpawner = (options: {
  readonly cmd: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stderr: 'pipe';
  readonly stdout: 'pipe';
}) => SpawnedProcess;

export type CommandExecutor = (spec: CommandSpec) => Promise<CommandResult>;
type ReaderResult = Awaited<
  ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>
>;

export interface SpawnedProcess {
  readonly exited: Promise<number>;
  readonly kill: (signal?: number) => void;
  readonly stderr: ReadableStream<Uint8Array> | null;
  readonly stdout: ReadableStream<Uint8Array> | null;
}

export const DEFAULT_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
export const POST_EXIT_STREAM_TIMEOUT_MS = 250;

const readAfterExit = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReaderResult | undefined> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(
          () => resolve(undefined),
          POST_EXIT_STREAM_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};

const decodeAfterExit = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> => {
  if (stream === null) {
    return '';
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';
  try {
    while (true) {
      const next = await readAfterExit(reader);
      if (next === undefined) {
        await reader.cancel();
        return output;
      }
      if (next.done) {
        return output + decoder.decode();
      }
      output += decoder.decode(next.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
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
    const result = process.exited.then(async (code) => {
      const [stderr, stdout] = await Promise.all([
        decodeAfterExit(process.stderr),
        decodeAfterExit(process.stdout),
      ]);
      return [code, stderr, stdout] as const;
    });
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
      try {
        process.kill(9);
      } catch {
        // A failed kill does not prove that the child has exited.
      }
      await result.catch(() => undefined);
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
