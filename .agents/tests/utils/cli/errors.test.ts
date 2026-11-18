import { expect, test } from 'bun:test';

import { CliError, errorMessage, exitCodeOf } from '../../../utils/cli/errors.js';
import { UsageError } from '../../../utils/cli/usage-error.js';

test('reads the message of an Error and stringifies other values', () => {
  expect(errorMessage(new Error('boom'))).toBe('boom');
  expect(errorMessage('plain')).toBe('plain');
  expect(errorMessage(42)).toBe('42');
});

test('maps errors onto the exit table', () => {
  expect(exitCodeOf(new UsageError('bad flag'))).toBe(2);
  expect(exitCodeOf(new CliError('custom', 1))).toBe(1);
  expect(exitCodeOf(new CliError('default'))).toBe(1);
  expect(exitCodeOf(new Error('unknown'))).toBe(1);
  expect(exitCodeOf('not an error')).toBe(1);
});

test('carries optional structured data, null by default', () => {
  expect(new CliError('x').data).toBeNull();
  expect(new CliError('x', 1, { packet: 1 }).data).toEqual({ packet: 1 });
});

test('keeps the message and class of a usage error', () => {
  const error = new UsageError('bad flag');
  expect(error).toBeInstanceOf(CliError);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe('bad flag');
  expect(error.name).toBe('UsageError');
});
