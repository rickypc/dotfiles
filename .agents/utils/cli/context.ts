import { readdir } from 'node:fs/promises';

export interface CliContext {
  readonly listDirectory: (directory: string) => Promise<readonly DirectoryEntry[]>;
  readonly readStdin: () => Promise<string>;
  readonly setExitCode: (code: number) => void;
  readonly write: (message: string) => void;
  readonly writeError: (message: string) => void;
}

export interface ContextDependencies {
  readonly stderr?: (message: string) => void;
  readonly stdin?: BodyInit;
  readonly stdout?: (message: string) => void;
  readonly target?: { exitCode?: number | string | null };
}

export interface DirectoryEntry {
  readonly isDirectory: boolean;
  readonly name: string;
}

export const defaultContext = ({
  stderr = console.error,
  stdin = Bun.stdin,
  stdout = console.log,
  target = process,
}: ContextDependencies = {}): CliContext => ({
  listDirectory: async (directory) =>
    (await readdir(directory, { withFileTypes: true })).map((entry) => ({
      isDirectory: entry.isDirectory(),
      name: entry.name,
    })),
  readStdin: () => new Response(stdin).text(),
  setExitCode: (code) => {
    target.exitCode = code;
  },
  write: stdout,
  writeError: stderr,
});
