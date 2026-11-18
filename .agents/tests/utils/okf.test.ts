import { expect, mock, test } from 'bun:test';
import realMatter from 'gray-matter';

// gray-matter is registered as its real implementation so the registration is identical for every
// same-process consumer and cannot leak a divergent double into other test files.
mock.module('gray-matter', () => ({ default: realMatter }));

const { parseOkfConcept, renderOkfConcept, validateOkfMetadata } = await import(
  '../../utils/okf.js'
);

const valid = { description: 'd', tags: ['a'], title: 't', type: 'rule' };
const document = (frontmatter: string): string => `---\n${frontmatter}\n---\nbody\n`;
const fields = 'type: rule\ntitle: t\ndescription: d\ntags:\n  - a';

test.each([
  ['blank type', { ...valid, type: '  ' }, 'type'],
  ['blank title', { ...valid, title: '' }, 'title'],
  ['blank description', { ...valid, description: ' ' }, 'description'],
  ['empty tags', { ...valid, tags: [] }, 'tags'],
])('validateOkfMetadata rejects %s', (_name, metadata, field) => {
  expect(() => validateOkfMetadata(metadata)).toThrow(`OKF metadata field is required: ${field}`);
});

test('validateOkfMetadata accepts complete metadata', () => {
  expect(validateOkfMetadata(valid)).toBeUndefined();
});

test('parseOkfConcept returns metadata including extra keys', () => {
  expect(parseOkfConcept(document(`${fields}\nextra: 1`))).toEqual({ ...valid, extra: 1 });
});

test('parseOkfConcept rejects missing and unclosed frontmatter', () => {
  expect(() => parseOkfConcept('body only')).toThrow('OKF concept frontmatter is required.');
  expect(() => parseOkfConcept('---\ntitle: t')).toThrow('OKF concept frontmatter is required.');
});

test.each([
  ['missing tags', 'type: rule\ntitle: t\ndescription: d'],
  ['string tags', 'type: rule\ntitle: t\ndescription: d\ntags: a'],
  ['non-string tag', 'type: rule\ntitle: t\ndescription: d\ntags:\n  - 1'],
])('parseOkfConcept rejects %s', (_name, frontmatter) => {
  expect(() => parseOkfConcept(document(frontmatter))).toThrow(
    'OKF metadata field is required: tags',
  );
});

test.each([
  ['description', 'type: rule\ntitle: t\ndescription: 5\ntags:\n  - a'],
  ['title', 'type: rule\ntitle: 5\ndescription: d\ntags:\n  - a'],
  ['type', 'type: 5\ntitle: t\ndescription: d\ntags:\n  - a'],
])('parseOkfConcept rejects non-string %s', (field, frontmatter) => {
  expect(() => parseOkfConcept(document(frontmatter))).toThrow(
    `OKF metadata field is required: ${field}`,
  );
});

test('parseOkfConcept validates blank values after parsing', () => {
  expect(() =>
    parseOkfConcept(document('type: rule\ntitle: " "\ndescription: d\ntags:\n  - a')),
  ).toThrow('OKF metadata field is required: title');
});

test('renderOkfConcept round-trips trimmed body and metadata', () => {
  const rendered = renderOkfConcept(valid, '  body\n');
  expect(rendered).toBe(`---\ndescription: d\ntags:\n  - a\ntitle: t\ntype: rule\n---\nbody\n`);
  expect(parseOkfConcept(rendered)).toEqual(valid);
});

test('renderOkfConcept rejects blank body and invalid metadata', () => {
  expect(() => renderOkfConcept(valid, ' \n')).toThrow('OKF concept body is required.');
  expect(() => renderOkfConcept({ ...valid, tags: [] }, 'body')).toThrow(
    'OKF metadata field is required: tags',
  );
});
