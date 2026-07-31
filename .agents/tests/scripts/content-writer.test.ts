import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/content-writer.js';

const source = JSON.stringify({
  author: 'a',
  date: 'd',
  publisher: 'p',
  sourceClass: 'official',
  url: 'https://example.com',
});

test('accepts an admissible claim source', () => {
  const write = mock();
  run(['validate-source', source], write);
  expect(write).toHaveBeenCalledWith('claim-source: passed');
});

test('renders a content outline', () => {
  const write = mock();
  run(
    [
      'outline',
      JSON.stringify({
        audience: 'reader',
        citationStyle: 'links',
        constraints: 'none',
        format: 'article',
        objective: 'Explain',
        scope: 'scope',
        tone: 'clear',
        webOptimization: false,
      }),
    ],
    write,
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('Evidence-backed'),
  );
});

test('validates a complete content package', () => {
  const write = mock();
  run(
    [
      'validate-draft',
      JSON.stringify({
        brief: {
          audience: 'reader',
          citationStyle: 'links',
          constraints: 'none',
          format: 'article',
          objective: 'Explain',
          scope: 'scope',
          tone: 'clear',
          webOptimization: false,
        },
        claims: [
          {
            sourceUrl: 'https://example.com/source',
            statement: 'Supported statement.',
          },
        ],
        draft: 'Supported statement.',
        result: 'ready',
        sources: [
          {
            author: 'Author',
            date: '2026-01-01',
            publisher: 'Publisher',
            sourceClass: 'official',
            url: 'https://example.com/source',
          },
        ],
      }),
    ],
    write,
  );
  expect(write).toHaveBeenCalledWith('content-draft: ready');
});

test('rejects invalid sources and protects the main boundary', () => {
  expect(() => run(['validate-source', '{}'])).toThrow('admissible');
  expect(() => run(['validate-source', 'not-json'])).toThrow('JSON');
  expect(() => run([])).toThrow(usage());
  const runner = mock();
  runWhenMain(true, ['validate-source', source], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
