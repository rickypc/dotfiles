import type { OutputFormat } from './declaration.js';
import { CliError, errorMessage, exitCodeOf } from './errors.js';
import { EXIT_CODES } from './exit-codes.js';

export interface Envelope<Data> {
  readonly command: string;
  readonly data: Data | null;
  readonly diagnostics: readonly string[];
  readonly exitCode: number;
  readonly ok: boolean;
}

export const failureEnvelope = (command: string, error: unknown): Envelope<unknown> => ({
  command,
  data: error instanceof CliError ? error.data : null,
  diagnostics: [errorMessage(error)],
  exitCode: exitCodeOf(error),
  ok: false,
});

export const successEnvelope = <Data>(
  command: string,
  data: Data,
  diagnostics: readonly string[] = [],
): Envelope<Data> => ({ command, data, diagnostics, exitCode: EXIT_CODES.success, ok: true });

const textBody = <Data>(data: Data | null, renderText?: (data: Data) => string): string => {
  if (data === null) {
    return '';
  }
  if (renderText) {
    return renderText(data);
  }
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
};

export const renderEnvelope = <Data>(
  envelope: Envelope<Data>,
  format: OutputFormat,
  renderText?: (data: Data) => string,
): string => {
  if (format === 'json') {
    return JSON.stringify(envelope, null, 2);
  }
  return [textBody(envelope.data, renderText), ...envelope.diagnostics]
    .filter((part) => part !== '')
    .join('\n');
};
