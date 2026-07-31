import { expect, test } from 'bun:test';
import {
  canSupportClaim,
  renderContentOutline,
  renderQuotation,
  requiresQuotationClarification,
  validateClaimSources,
  validateContentBrief,
  validateContentPackage,
  validateRefreshInventory,
} from '../../utils/content.js';

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
    requiresQuotationClarification(
      { original: '原文', translation: 'Original' },
      undefined,
    ),
  ).toBeTrue();
  expect(
    requiresQuotationClarification({ original: 'quote' }, true),
  ).toBeFalse();
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
    validateContentPackage({ ...content, draft: 'The supported statement.' }),
  ).toThrow('quotation');
  expect(() =>
    validateContentPackage({ ...content, draft: 'Exact quotation.' }),
  ).toThrow('claim must appear');
  expect(() =>
    validateContentPackage({
      ...content,
      claims: [{ ...content.claims[0], sourceUrl: 'https://example.com/lead' }],
    }),
  ).toThrow('admissible');
  expect(() =>
    validateContentPackage({ ...content, claims: [], draft: '' }),
  ).toThrow('draft');
});
