import { type Atom, sha256Hex } from './index.js';

export const CALIBRATION_ATOM_LIMIT = 8;

export interface Mutant {
  readonly kind: MutatorKind;
  readonly text: string;
}

export type MutatorKind = 'delete' | 'negate' | 'swap';

// Opposites that keep the sentence grammatical; the first rule that matches is used.
const NEGATIONS: readonly (readonly [RegExp, string])[] = [
  [/\bmust not\b/u, 'must'],
  [/\bmust\b/u, 'must not'],
  [/\bshould not\b/u, 'should'],
  [/\bshould\b/u, 'should not'],
  [/\bdo not\b/iu, 'do'],
  [/\bNever\b/u, 'Always'],
  [/\bnever\b/u, 'always'],
  [/\bAlways\b/u, 'Never'],
  [/\balways\b/u, 'never'],
];

const orderedItem = /^(\s*)(\d+[.)])(\s+)(.*)$/u;

const escapeRegex = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const itemEnd = (lines: readonly string[], start: number): number => {
  let end = start + 1;
  while (end < lines.length && lines[end]?.trim() !== '' && !orderedItem.test(lines[end] ?? '')) {
    end += 1;
  }
  return end;
};

export const negateSentence = (sentence: string): string | undefined => {
  const rule = NEGATIONS.find(([pattern]) => pattern.test(sentence));
  return rule === undefined ? undefined : sentence.replace(rule[0], rule[1]);
};

const patternOf = (sentence: string): RegExp =>
  new RegExp(sentence.split(' ').map(escapeRegex).join('\\s+'), 'gu');

// Selects the atoms to calibrate: only atoms with an active probe, in hash order of their id so the
// choice is deterministic and independent of document position.
export const selectAtoms = (atoms: readonly Atom[], limit: number): readonly Atom[] =>
  atoms
    .filter((atom) => atom.status === 'active' && atom.probeIds.length > 0)
    .map((atom) => ({ atom, key: sha256Hex(atom.id) }))
    .sort((left, right) => (left.key < right.key ? -1 : 1))
    .slice(0, limit)
    .map(({ atom }) => atom);

// Swaps the body of the ordered-list item that holds the sentence with the next item's body and
// keeps both numbers, so only the order of the two steps changes.
const swapWithNext = (source: string, sentence: string): string | undefined => {
  const lines = source.split('\n');
  const match = patternOf(sentence).exec(source);
  if (match === null || !orderedItem.test(sentence)) {
    return undefined;
  }
  const first = source.slice(0, match.index).split('\n').length - 1;
  const second = itemEnd(lines, first);
  const secondEnd = itemEnd(lines, second);
  const head = orderedItem.exec(lines[first] ?? '');
  const tail = orderedItem.exec(lines[second] ?? '');
  if (head === null || tail === null) {
    return undefined;
  }
  const bodyOf = (from: number, to: number, firstBody: string): string[] => [
    firstBody,
    ...lines.slice(from + 1, to),
  ];
  const swapped = [
    `${head[1]}${head[2]}${head[3]}${bodyOf(second, secondEnd, tail[4] ?? '').join('\n')}`,
    `${tail[1]}${tail[2]}${tail[3]}${bodyOf(first, second, head[4] ?? '').join('\n')}`,
  ];
  return [...lines.slice(0, first), ...swapped, ...lines.slice(secondEnd)].join('\n');
};

export const mutantsFor = (source: string, sentence: string): readonly Mutant[] => {
  if (!patternOf(sentence).test(source)) {
    return [];
  }
  const negated = negateSentence(sentence);
  const candidates: readonly (Mutant | undefined)[] = [
    { kind: 'delete', text: source.replace(patternOf(sentence), '') },
    negated === undefined
      ? undefined
      : { kind: 'negate', text: source.replace(patternOf(sentence), () => negated) },
    ((text) => (text === undefined ? undefined : { kind: 'swap' as const, text }))(
      swapWithNext(source, sentence),
    ),
  ];
  return candidates.filter(
    (mutant): mutant is Mutant => mutant !== undefined && mutant.text !== source,
  );
};
