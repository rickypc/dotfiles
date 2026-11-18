import { locateUnits } from './delta.js';
import type { Atom } from './index.js';

export interface BehaviorTagging {
  readonly atoms: readonly Atom[];
  readonly mapped: readonly string[];
}

// A case cites a rule by atom id, which survives edits, or by source lines, which drift.
export type RuleRange =
  | { readonly atomId: string; readonly caseId: string; readonly path: string }
  | {
      readonly caseId: string;
      readonly end: number;
      readonly path: string;
      readonly start: number;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const PATH_PATTERN = /([\w./-]+\.md)/u;
const ATOM_PATTERN = /\batom:(r-[0-9a-f]{10})/gu;

const casesOf = (coverage: Record<string, unknown>): readonly unknown[] => {
  const groups = [coverage.root, ...(Array.isArray(coverage.skills) ? coverage.skills : [])];
  return groups.flatMap((group) => {
    const behavior = isRecord(group) ? group.behaviorCases : undefined;
    const cases = isRecord(behavior) ? behavior.cases : isRecord(group) ? group.cases : undefined;
    return Array.isArray(cases) ? cases : [];
  });
};

const lineAt = (source: string, offset: number): number =>
  source.slice(0, offset).split('\n').length;

const hitsOf = (
  source: string,
  sourcePath: string,
  ranges: readonly RuleRange[],
): readonly { readonly caseId: string; readonly id: string }[] => {
  const own = ranges.filter((range) => range.path === sourcePath);
  return locateUnits(source).flatMap((span) => {
    const start = lineAt(source, span.start);
    const end = lineAt(source, span.end);
    return own
      .filter((range) =>
        'atomId' in range ? range.atomId === span.id : range.start <= end && range.end >= start,
      )
      .map((range) => ({ caseId: range.caseId, id: span.id }));
  });
};

// The behavior cases that cite the lines of these atoms.
export const casesForAtoms = (
  source: string,
  sourcePath: string,
  atomIds: readonly string[],
  ranges: readonly RuleRange[],
): readonly string[] => [
  ...new Set(
    hitsOf(source, sourcePath, ranges)
      .filter(({ id }) => atomIds.includes(id))
      .map(({ caseId }) => caseId),
  ),
];

const rangesOfRule = (caseId: string, rule: string): readonly RuleRange[] => {
  const path = PATH_PATTERN.exec(rule)?.[1]?.replace(/^\/+/u, '');
  if (path === undefined) {
    return [];
  }
  const tail = rule.slice(rule.indexOf(path) + path.length);
  const atoms = [...tail.matchAll(ATOM_PATTERN)].map((found) => ({
    atomId: String(found[1]),
    caseId,
    path,
  }));
  const text = tail.replace(ATOM_PATTERN, ' ').replace(/§[\d-]+/gu, ' ');
  const lines = [...text.matchAll(/(\d+)-(\d+)/gu)].map((found) => ({
    caseId,
    end: Number(found[2]),
    path,
    start: Number(found[1]),
  }));
  return [...atoms, ...lines];
};

// Every behavior case names the source lines of the rule it exercises. This reads those ranges.
export const ruleRangesOf = (coverage: unknown): readonly RuleRange[] =>
  isRecord(coverage)
    ? casesOf(coverage).flatMap((item) =>
        isRecord(item) && typeof item.id === 'string' && typeof item.sourceRule === 'string'
          ? rangesOfRule(item.id, item.sourceRule)
          : [],
      )
    : [];

// An atom is behavioral when one of its units overlaps a line range a behavior case cites. A case
// whose ranges overlap no atom is returned unmapped by omission from `mapped`.
export const tagBehavioral = (
  source: string,
  sourcePath: string,
  atoms: readonly Atom[],
  ranges: readonly RuleRange[],
): BehaviorTagging => {
  const hits = hitsOf(source, sourcePath, ranges);
  const tagged = new Set(hits.map(({ id }) => id));
  return {
    atoms: atoms.map((atom) => ({ ...atom, behavioral: tagged.has(atom.id) })),
    mapped: [
      ...new Set(hits.filter(({ id }) => atoms.some((a) => a.id === id)).map((h) => h.caseId)),
    ],
  };
};
