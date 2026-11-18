import { expect, test } from 'bun:test';
import {
  canSupportClaim,
  command,
  renderContentOutline,
  renderQuotation,
  requiresQuotationClarification,
  validateClaimSources,
  validateContentBrief,
  validateContentPackage,
  validateRefreshInventory,
} from '../../scripts/content-writer.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const exec = async (args: readonly string[]) => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  return { code: await runCommand(command, [...args, '--format', 'text'], context), out };
};

const source = JSON.stringify({
  author: 'a',
  date: 'd',
  publisher: 'p',
  sourceClass: 'official',
  url: 'https://example.com',
});

test('accepts an admissible claim source', async () => {
  const { code, out } = await exec(['validate-source', source]);
  expect(code).toBe(0);
  expect(out).toEqual(['claim-source: passed']);
});

test('renders a content outline', async () => {
  const { out } = await exec([
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
  ]);
  expect(out[0]).toContain('Evidence-backed');
});

test('validates a complete content package', async () => {
  const { out } = await exec([
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
  ]);
  expect(out).toEqual(['content-draft: ready']);
});

test('maps inadmissible sources to exit 1 and bad input to usage exit 2', async () => {
  expect((await exec(['validate-source', '{}'])).code).toBe(1);
  expect((await exec(['validate-source', 'not-json'])).code).toBe(2);
  expect((await exec([])).code).toBe(2);
  expect((await exec(['other', '{}'])).code).toBe(2);
});

test('answers --help with every subcommand', async () => {
  const { code, out } = await exec(['--help']);
  expect(code).toBe(0);
  expect(out[0]).toContain('validate-draft');
});

test.each([
  ['authoritative', 'https://example.com', true],
  ['discovery', 'https://example.com', false],
  ['authoritative', 'http://example.com', false],
] as const)('checks source legitimacy', (sourceClass, url, expected) =>
  expect(
    canSupportClaim({
      author: 'author',
      date: '2026-01-01',
      publisher: 'publisher',
      sourceClass,
      url,
    }),
  ).toBe(expected),
);

test.each(['author', 'publisher', 'date'] as const)(
  'requires %s for a material claim source',
  (field) => {
    const source = {
      author: 'author',
      date: '2026-01-01',
      publisher: 'publisher',
      sourceClass: 'official' as const,
      url: 'https://example.com',
    };
    expect(canSupportClaim({ ...source, [field]: '' })).toBeFalse();
  },
);

test('validates briefs, sources, refreshes, and quote preservation', () => {
  const brief = {
    audience: 'a',
    citationStyle: 'links',
    constraints: 'none',
    format: 'article',
    objective: 'explain',
    scope: 'one subject',
    tone: 'clear',
    webOptimization: true,
  };
  expect(() => validateContentBrief(brief)).not.toThrow();
  expect(renderContentOutline(brief)).toContain('SEO and GEO');
  expect(() => validateContentBrief({ ...brief, tone: '' })).toThrow('tone');
  expect(() => validateClaimSources([])).toThrow('material claim');
  expect(() =>
    validateClaimSources([
      {
        author: 'a',
        date: 'd',
        publisher: 'p',
        sourceClass: 'official',
        url: 'https://x',
      },
    ]),
  ).not.toThrow();
  expect(
    renderQuotation({
      original: '原文',
      translation: 'Original',
      transliteration: 'Yuánwén',
    }),
  ).toContain('原文');
  expect(() => renderQuotation({ original: '' })).toThrow('original');
  expect(
    requiresQuotationClarification({ original: '原文', translation: 'Original' }, undefined),
  ).toBeTrue();
  expect(requiresQuotationClarification({ original: 'quote' }, true)).toBeFalse();
  expect(() =>
    validateRefreshInventory({
      citations: true,
      currentness: true,
      purpose: true,
      quotations: false,
      structure: true,
    }),
  ).toThrow('complete');
  expect(() =>
    validateRefreshInventory({
      citations: true,
      currentness: true,
      purpose: true,
      quotations: true,
      structure: true,
    }),
  ).not.toThrow();
});

test('gates complete drafts against claims, sources, and quotations', () => {
  const content = {
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
        quotation: { original: 'Exact quotation.' },
        sourceUrl: 'https://example.com/source',
        statement: 'The supported statement.',
      },
    ],
    draft: 'The supported statement. Exact quotation.',
    result: 'ready' as const,
    sources: [
      {
        author: 'Author',
        date: '2026-01-01',
        publisher: 'Publisher',
        sourceClass: 'primary' as const,
        url: 'https://example.com/source',
      },
      {
        author: 'Lead',
        date: '2026-01-01',
        publisher: 'Discovery',
        sourceClass: 'discovery' as const,
        url: 'https://example.com/lead',
      },
    ],
  };
  expect(() => validateContentPackage(content)).not.toThrow();
  expect(() =>
    validateContentPackage({
      ...content,
      refreshInventory: {
        citations: true,
        currentness: true,
        purpose: true,
        quotations: true,
        structure: true,
      },
    }),
  ).not.toThrow();
  expect(() => validateContentPackage({ ...content, draft: 'The supported statement.' })).toThrow(
    'quotation',
  );
  expect(() => validateContentPackage({ ...content, draft: 'Exact quotation.' })).toThrow(
    'claim must appear',
  );
  expect(() =>
    validateContentPackage({
      ...content,
      claims: [{ ...content.claims[0], sourceUrl: 'https://example.com/lead' }],
    }),
  ).toThrow('admissible');
  expect(() => validateContentPackage({ ...content, claims: [], draft: '' })).toThrow('draft');
});
