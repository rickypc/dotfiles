import { expect, test } from 'bun:test';
import { failureEnvelope, renderEnvelope, successEnvelope } from '../../../utils/cli/envelope.js';
import { CliError } from '../../../utils/cli/errors.js';
import { UsageError } from '../../../utils/cli/usage-error.js';

test('builds a success envelope with the five contract fields', () => {
  expect(successEnvelope('write-json', { path: '/tmp/a' }, ['note'])).toEqual({
    command: 'write-json',
    data: { path: '/tmp/a' },
    diagnostics: ['note'],
    exitCode: 0,
    ok: true,
  });
  expect(successEnvelope('x', 1).diagnostics).toEqual([]);
});

test('maps an error to a failure envelope through the exit table', () => {
  expect(failureEnvelope('x', new UsageError('bad'))).toEqual({
    command: 'x',
    data: null,
    diagnostics: ['bad'],
    exitCode: 2,
    ok: false,
  });
  expect(failureEnvelope('x', 'plain').exitCode).toBe(1);
  expect(failureEnvelope('x', 'plain').diagnostics).toEqual(['plain']);
});

test('keeps the structured data a failing command attached to its error', () => {
  const envelope = failureEnvelope('x', new CliError('blocked', 1, { packet: 7 }));
  expect(envelope.data).toEqual({ packet: 7 });
  expect(envelope.ok).toBe(false);
  expect(renderEnvelope(envelope, 'text')).toBe('{\n  "packet": 7\n}\nblocked');
});

test('renders JSON by default', () => {
  const envelope = successEnvelope('x', { a: 1 });
  expect(JSON.parse(renderEnvelope(envelope, 'json'))).toEqual(envelope);
});

test('renders the human view as text', () => {
  expect(renderEnvelope(successEnvelope('x', 'hello'), 'text')).toBe('hello');
  expect(renderEnvelope(successEnvelope('x', { a: 1 }), 'text')).toBe('{\n  "a": 1\n}');
  expect(renderEnvelope(successEnvelope('x', null), 'text')).toBe('');
  expect(renderEnvelope(successEnvelope('x', { a: 1 }), 'text', (data) => `a=${data.a}`)).toBe(
    'a=1',
  );
  expect(renderEnvelope(successEnvelope('x', 'hello', ['careful']), 'text')).toBe('hello\ncareful');
  expect(renderEnvelope(failureEnvelope('x', new Error('boom')), 'text')).toBe('boom');
});
