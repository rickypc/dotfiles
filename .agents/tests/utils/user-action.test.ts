import { expect, test } from 'bun:test';

import {
  renderBrowserVerificationAction,
  renderUserAction,
} from '../../utils/user-action.js';

test('renders the standard user-action protocol', () => {
  expect(
    renderUserAction({
      continueWith: 'configured',
      do: 'File: /tmp/example\nChange: add value',
      doLanguage: 'text',
      expected: 'value exists',
      title: 'configure example',
      verify: 'test -f /tmp/example',
      why: 'An external configuration is required.',
    }),
  ).toContain('## User action required — configure example');
});

test('renders an exact file URL for browser verification', () => {
  expect(
    renderBrowserVerificationAction(
      '/tmp/browser fixture/index.html',
      'Enter a value and submit.',
      'The total is shown.',
    ),
  ).toContain('file:///tmp/browser%20fixture/index.html');
  expect(() =>
    renderBrowserVerificationAction('relative/index.html', 'open', 'shown'),
  ).toThrow('absolute');
  expect(() =>
    renderBrowserVerificationAction('/tmp/page.txt', 'open', 'shown'),
  ).toThrow('HTML');
});
