import { expect, test } from 'bun:test';
import {
  parseBundle,
  parseSkillName,
  UNPARSEABLE_ROUTE,
} from '../../../scripts/weak-reader/index.js';

test('parses valid document and router bundles and rejects invalid shapes', () => {
  const document = JSON.stringify({
    document: 'Rule one.',
    instructions: 'Return one uppercase answer label only.',
    prompts: [{ query: 'Q', query_id: 'q1', run: 1 }],
  });
  expect(parseBundle(document, 'b.json').prompts).toHaveLength(1);

  const router = JSON.stringify({
    catalog: [
      { description: 'Plans work.', name: 'aidp' },
      { description: 'Runs plans.', name: 'aidx' },
    ],
    instructions: 'Route it.',
    prompts: [{ query: 'Q', query_id: 'a', run: 1 }],
  });
  const bundle = parseBundle(router, 'r.json');
  expect(bundle.names).toEqual(['aidp', 'aidx']);
  expect(bundle.document).toBe('Skill catalog:\n- aidp: Plans work.\n- aidx: Runs plans.');
  expect(bundle.instructions).toBe('Route it.');

  for (const [content, message] of [
    ['{not json', 'is not valid JSON'],
    ['null', 'with instructions and prompts'],
    ['{"document":1,"instructions":"x","prompts":[]}', 'with a document or a catalog'],
    ['{"document":"d","instructions":"x"}', 'with instructions and prompts'],
    ['{"catalog":[],"instructions":"x","prompts":[]}', 'with a document or a catalog'],
    ['{"catalog":[{"name":"a"}],"instructions":"x","prompts":[]}', 'with a document or a catalog'],
    ['{"catalog":[null],"instructions":"x","prompts":[]}', 'with a document or a catalog'],
  ]) {
    expect(() => parseBundle(content, 'b.json')).toThrow(message);
  }
});

test('accepts only one complete catalog name or the no-skill sentinel', () => {
  const names = ['aidp', 'aidx', 'knowledge-base', 'md-compress', 'review-changes'];
  const cases = [
    ['aidp', 'aidp'],
    ['`knowledge-base`.', UNPARSEABLE_ROUTE],
    ['The answer is NO_SKILL', UNPARSEABLE_ROUTE],
    ['md-compress or aidx', UNPARSEABLE_ROUTE],
    ['aidx, then aidp', UNPARSEABLE_ROUTE],
    ['review_changes', 'review-changes'],
    ['Knowledge Base', 'knowledge-base'],
    ['no skill', 'NO_SKILL'],
    ['MD-COMPRESS', 'md-compress'],
    ['The difference is explained by repo-search.', UNPARSEABLE_ROUTE],
    ['repo-search\nAnswer: repo-search', UNPARSEABLE_ROUTE],
    ['banana', UNPARSEABLE_ROUTE],
    ['aidpx', UNPARSEABLE_ROUTE],
    ['', UNPARSEABLE_ROUTE],
  ];
  for (const [reply, expected] of cases) {
    expect(parseSkillName(reply, names)).toBe(expected);
  }
  expect(parseSkillName('repo-search\n', ['repo-search'])).toBe('repo-search');
  expect(parseSkillName('react-native', ['react', 'react-native'])).toBe('react-native');
});
