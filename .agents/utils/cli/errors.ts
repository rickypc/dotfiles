import { EXIT_CODES, type ExitCode } from './exit-codes.js';

export class CliError extends Error {
  readonly data: unknown;
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = EXIT_CODES.failure, data: unknown = null) {
    super(message);
    this.name = new.target.name;
    this.data = data;
    this.exitCode = exitCode;
  }
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const exitCodeOf = (error: unknown): ExitCode =>
  error instanceof CliError ? error.exitCode : EXIT_CODES.failure;
