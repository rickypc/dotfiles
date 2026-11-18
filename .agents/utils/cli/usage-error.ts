import { CliError } from './errors.js';
import { EXIT_CODES } from './exit-codes.js';

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CODES.usage);
  }
}
