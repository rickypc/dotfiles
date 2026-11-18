import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import realMatter from 'gray-matter';
import * as realOkf from '../../../utils/okf.js';
import * as realDelta from '../../../utils/quality-engine/atom-delta.js';
import * as realAtoms from '../../../utils/quality-engine/atoms.js';

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:crypto', () => realCrypto);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../okf.js', () => realOkf);
mock.module('./atoms.js', () => realAtoms);
mock.module('./atom-delta.js', () => realDelta);

const { casesForAtoms, ruleRangesOf, tagBehavioral } = await import(
  '../../../utils/quality-engine/atom-behavior.js'
);

const SOURCE = [
  '# Doc',
  '',
  'First rule here.',
  '',
  'Second rule here.',
  '',
  'Third rule here.',
  '',
].join('\n');

const atom = (text: string) => ({
  behavioral: false,
  harmful: 0,
  helpful: 0,
  id: realDelta.atomIdOf(text),
  placements: [{ headingPath: ['Doc'] }],
  precedence: 0,
  probeIds: ['p1'],
  status: 'active' as const,
  tags: [],
  textSha256: realAtoms.sha256Hex(text),
});

test('reads line ranges from rule text and ignores section marks', () => {
  const ranges = ruleRangesOf({
    root: { cases: [{ id: 'r1', sourceRule: 'skills/a/SKILL.md:48-55, 75-79 - rule' }] },
    skills: [
      {
        behaviorCases: {
          cases: [
            {
              id: 's1',
              sourceRule:
                'Stop. Source: <agents-root>/skills/b/SKILL.md §1-2, lines 14-36 and 40-41.',
            },
            { id: 'no-path', sourceRule: 'no source named 3-4' },
            { sourceRule: 'skills/c/SKILL.md:1-2' },
          ],
        },
      },
      null,
      { cases: [{ id: 'flat', sourceRule: 'evals/rubric.md:5-6' }] },
    ],
  });
  expect(ranges).toEqual([
    { caseId: 'r1', end: 55, path: 'skills/a/SKILL.md', start: 48 },
    { caseId: 'r1', end: 79, path: 'skills/a/SKILL.md', start: 75 },
    { caseId: 's1', end: 36, path: 'skills/b/SKILL.md', start: 14 },
    { caseId: 's1', end: 41, path: 'skills/b/SKILL.md', start: 40 },
    { caseId: 'flat', end: 6, path: 'evals/rubric.md', start: 5 },
  ]);
  expect(ruleRangesOf('nope')).toEqual([]);
  expect(ruleRangesOf({ skills: 'x' })).toEqual([]);
});

test('tags atoms whose units overlap a cited range and reports the mapped cases', () => {
  const atoms = [atom('First rule here.'), atom('Second rule here.'), atom('Third rule here.')];
  const ranges = [
    { caseId: 'c1', end: 5, path: 'doc.md', start: 5 },
    { caseId: 'c2', end: 99, path: 'doc.md', start: 90 },
    { caseId: 'c3', end: 3, path: 'other.md', start: 3 },
  ];
  const tagging = tagBehavioral(SOURCE, 'doc.md', atoms, ranges);
  expect(tagging.atoms.map((entry) => entry.behavioral)).toEqual([false, true, false]);
  expect(tagging.mapped).toEqual(['c1']);
});

test('a unit with no atom tags nothing and maps no case', () => {
  const tagging = tagBehavioral(
    SOURCE,
    'doc.md',
    [atom('Third rule here.')],
    [{ caseId: 'c1', end: 3, path: 'doc.md', start: 3 }],
  );
  expect(tagging.atoms.map((entry) => entry.behavioral)).toEqual([false]);
  expect(tagging.mapped).toEqual([]);
});

test('casesForAtoms lists the cases that cite the lines of the named atoms', () => {
  const ranges = [
    { caseId: 'c1', end: 5, path: 'doc.md', start: 5 },
    { caseId: 'c2', end: 3, path: 'doc.md', start: 3 },
    { caseId: 'c3', end: 5, path: 'doc.md', start: 4 },
  ];
  const second = realDelta.atomIdOf('Second rule here.');
  expect(casesForAtoms(SOURCE, 'doc.md', [second], ranges)).toEqual(['c1', 'c3']);
  expect(casesForAtoms(SOURCE, 'doc.md', [], ranges)).toEqual([]);
});

test('a case cites a rule by atom id and the id survives line drift', () => {
  const second = realDelta.atomIdOf('Second rule here.');
  const ranges = ruleRangesOf({
    root: {
      cases: [{ id: 'by-id', sourceRule: `doc.md atom:${second} atom:r-0123456789 - rule 7-8` }],
    },
  });
  expect(ranges).toEqual([
    { atomId: second, caseId: 'by-id', path: 'doc.md' },
    { atomId: 'r-0123456789', caseId: 'by-id', path: 'doc.md' },
    { caseId: 'by-id', end: 8, path: 'doc.md', start: 7 },
  ]);
  const tagging = tagBehavioral(
    SOURCE,
    'doc.md',
    [atom('First rule here.'), atom('Second rule here.')],
    ranges,
  );
  expect(tagging.atoms.map((entry) => entry.behavioral)).toEqual([false, true]);
  expect(tagging.mapped).toEqual(['by-id']);
});

test('a root document path is read as a source path', () => {
  expect(
    ruleRangesOf({ root: { cases: [{ id: 'r', sourceRule: 'AGENTS.md:3-4 - rule' }] } }),
  ).toEqual([{ caseId: 'r', end: 4, path: 'AGENTS.md', start: 3 }]);
});
