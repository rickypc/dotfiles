import { expect, test } from 'bun:test';
import {
  DEFAULT_LOOKS_PER_EPOCH,
  lookStatus,
  looksPerEpochOf,
  parseHeldOutLines,
  renderHeldOutLine,
} from '../../../utils/quality-engine/heldout.js';

const sha = (digit: string): string => digit.repeat(64);
const look = (document: string, digit: string) => ({
  at: '2026-11-17T00:00:00.000Z',
  document,
  documentSha256: sha(digit),
  kind: 'look' as const,
});
const rotation = (document: string, digit: string) => ({
  at: '2026-11-17T00:00:00.000Z',
  document,
  kind: 'rotation' as const,
  poolSha256: sha(digit),
});

test('counts distinct texts per document and ignores a text seen again', () => {
  const lines = [look('a.md', '1'), look('a.md', '1'), look('a.md', '2'), look('b.md', '3')];
  expect(lookStatus(lines, 'a.md', sha('1'))).toEqual({ epoch: 0, looks: 2, seen: true });
  expect(lookStatus(lines, 'a.md', sha('9'))).toEqual({ epoch: 0, looks: 2, seen: false });
  expect(lookStatus(lines, 'b.md', sha('3'))).toEqual({ epoch: 0, looks: 1, seen: true });
  expect(lookStatus([], 'a.md', sha('1'))).toEqual({ epoch: 0, looks: 0, seen: false });
});

test('a rotation starts a new epoch and earlier looks stop counting', () => {
  const lines = [look('a.md', '1'), look('a.md', '2'), rotation('a.md', '7'), look('a.md', '1')];
  expect(lookStatus(lines, 'a.md', sha('1'))).toEqual({ epoch: 1, looks: 1, seen: true });
  expect(lookStatus(lines, 'a.md', sha('2'))).toEqual({ epoch: 1, looks: 1, seen: false });
  const other = [...lines, rotation('b.md', '8')];
  expect(lookStatus(other, 'a.md', sha('1')).epoch).toBe(1);
  expect(lookStatus(other, 'b.md', sha('1')).epoch).toBe(1);
});

test('renders and parses lines round-trip, skipping blank lines', () => {
  const lines = [look('a.md', '1'), rotation('a.md', '7')];
  const text = `${lines.map(renderHeldOutLine).join('')}\n`;
  expect(parseHeldOutLines(text, 'looks.jsonl')).toEqual(lines);
  expect(parseHeldOutLines('', 'looks.jsonl')).toEqual([]);
});

test.each([
  ['invalid JSON', 'not json', 'line 2 is not valid JSON'],
  ['a non-object line', '3', 'line 2 is not a held-out look or rotation'],
  ['a null line', 'null', 'line 2 is not a held-out look or rotation'],
  ['an unknown kind', JSON.stringify({ at: 'x', document: 'a', kind: 'peek' }), 'not a held-out'],
  ['a blank time', JSON.stringify({ ...look('a.md', '1'), at: ' ' }), 'not a held-out'],
  ['a blank document', JSON.stringify({ ...look('a.md', '1'), document: '' }), 'not a held-out'],
  [
    'a bad text hash',
    JSON.stringify({ ...look('a.md', '1'), documentSha256: 'zz' }),
    'not a held-out',
  ],
  [
    'a look with an extra field',
    JSON.stringify({ ...look('a.md', '1'), extra: 1 }),
    'not a held-out',
  ],
  [
    'a bad pool hash',
    JSON.stringify({ ...rotation('a.md', '7'), poolSha256: 'zz' }),
    'not a held-out',
  ],
  [
    'a rotation with an extra field',
    JSON.stringify({ ...rotation('a.md', '7'), extra: 1 }),
    'not a held-out',
  ],
])('parseHeldOutLines rejects %s', (_name, text, message) => {
  expect(() =>
    parseHeldOutLines(`${renderHeldOutLine(look('a.md', '1'))}${text}`, 'looks.jsonl'),
  ).toThrow(message);
});

test.each([
  ['a configured value', JSON.stringify({ policy: { heldOutLooksPerEpoch: 3 } }), 3],
  ['a missing policy', JSON.stringify({}), DEFAULT_LOOKS_PER_EPOCH],
  ['a missing manifest', undefined, DEFAULT_LOOKS_PER_EPOCH],
  [
    'a zero value',
    JSON.stringify({ policy: { heldOutLooksPerEpoch: 0 } }),
    DEFAULT_LOOKS_PER_EPOCH,
  ],
  [
    'a fractional value',
    JSON.stringify({ policy: { heldOutLooksPerEpoch: 1.5 } }),
    DEFAULT_LOOKS_PER_EPOCH,
  ],
  [
    'a string value',
    JSON.stringify({ policy: { heldOutLooksPerEpoch: '3' } }),
    DEFAULT_LOOKS_PER_EPOCH,
  ],
  ['invalid JSON', 'not json', DEFAULT_LOOKS_PER_EPOCH],
])('the epoch limit reads %s', (_name, text, expected) => {
  expect(looksPerEpochOf(text)).toBe(expected);
});
