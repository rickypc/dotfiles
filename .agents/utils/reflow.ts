/**
 * reflow text engine - shared tokenizer and 100-column wrap objective for the
 * deterministic Markdown/MDX reflow transform. Consumed by
 * scripts/reflow.ts and its Bun suite.
 */

// AGENTS.md section 7: "Wrap Markdown and MDX prose at 100 characters or fewer."
export const WIDTH = 100;

// Wrap-preference floor for the default mode's zero-cost gate: an applied wrap
// lands every non-final line past 80 characters. Band mode ignores the floor
// and takes the greedy max-fill wrap, where an unbreakable atom may force a
// short line or stand on a line past the width.
export const BAND_FLOOR = 80;

export interface ReflowOptions {
  band?: boolean;
  bandFloor: number;
  width: number;
}

export interface TokenStream {
  readonly atoms: readonly string[];
  readonly seps: readonly ('space' | 'nbsp')[];
}

export interface WrapPlan {
  atoms: readonly string[];
  bal: readonly number[];
  lens: readonly number[];
  options: ReflowOptions;
  prefixes: readonly string[];
  seps: readonly ('space' | 'nbsp')[];
}

const MAX_COST = Number.MAX_SAFE_INTEGER;

export const atomBalance = (atom: string): number => {
  const opens = atom.match(/<[A-Za-z][^>]*[^/]>|<[A-Za-z]>/g) ?? [];
  const closes = atom.match(/<\/[A-Za-z][^>]*>/g) ?? [];
  const selfClosing = atom.match(/<[A-Za-z][^>]*\/>/g) ?? [];
  return opens.length - selfClosing.length - closes.length;
};

export const closeDepth = (s: string, i: number, open: string, close: string): number => {
  let depth = 0;
  let j = i;
  while (j < s.length) {
    const ch = s[j] ?? '';
    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return j + 1;
      }
    }
    j++;
  }
  return -1;
};

// AGENTS.md section 7 atom list: "an inline code span, a link's text or its
// target, an MDX {...} expression, and a JSX tag with its attributes", plus
// "a quoted string" and "a whitespace-delimited word".
const codeSpanEnd = (s: string, i: number): number => {
  let len = 0;
  while (s[i + len] === '`') {
    len++;
  }
  const idx = s.indexOf('`'.repeat(len), i + len);
  return idx === -1 ? i : idx + len;
};

const completeLinkStart = (atom: string): boolean => {
  if (atom[0] !== '[') {
    return false;
  }
  const label = closeDepth(atom, 0, '[', ']');
  const after = label === -1 ? '' : (atom[label] ?? '');
  return after === '(' || after === '[';
};

export const cpLen = (s: string): number => [...s].length;

const atomsFit = (plan: WrapPlan): boolean => {
  const firstAvail = plan.options.width - cpLen(plan.prefixes[0] ?? '');
  const contAvail = plan.options.width - cpLen(plan.prefixes[1] ?? '');
  return plan.lens.every((l) => l <= firstAvail || l <= contAvail);
};

// AGENTS.md section 7: "Never let a wrapped continuation line begin with
// structure: an ordered-list marker (`N.` or `N)`), `>`, `#`, `[`, `{`, or a
// JSX tag." A bare bullet atom begins a list the same way, so it is included:
// a continuation line starting with `-` re-parses the paragraph as a list.
// A complete inline link is exempt from the bare `[` hazard: its closing
// label is followed by `(target)` or `[ref]`, never `:`, so it cannot parse
// as a reference or footnote definition and may lead a continuation line.
const forbiddenStart = (atom: string): boolean =>
  ['#', '>', '[', '{'].includes(atom[0] ?? '')
  || ['-', '*', '+'].includes(atom)
  || /^\d{1,9}[.)]$/.test(atom)
  || /^<\/[A-Za-z]/.test(atom);

const isSpace = (c: string): boolean => c === ' ' || c === '\t';

const consumeSeparator = (content: string, i: number): number => {
  if (!isSpace(content[i] ?? '')) {
    return content.startsWith('&nbsp;', i) ? i + 6 : i;
  }
  let j = i;
  while (isSpace(content[j] ?? '')) {
    j++;
  }
  return j;
};

const junctionSep = (prev: string, next: string): 'space' | 'nbsp' =>
  prev.endsWith('&nbsp;') || next.startsWith('&nbsp;') ? 'nbsp' : 'space';

export const joinContent = (lines: readonly string[]): string => {
  let out = lines[0] ?? '';
  for (let k = 1; k < lines.length; k++) {
    const next = lines[k] ?? '';
    if (junctionSep(out, next) === 'space') {
      out += ' ';
    }
    out += next.startsWith('&nbsp;') ? next.slice(6) : next;
  }
  return out.trim();
};

const lineAvail = (plan: WrapPlan, first: boolean): number =>
  plan.options.width - cpLen(plan.prefixes[first ? 0 : 1] ?? '');

// AGENTS.md section 7 exempts single unbreakable tokens: "a long URL or code
// span". In band mode such an atom may end a line past the width; every other
// atom on that line precedes it, so the line always closes at the token.
const endsAtUnbreakable = (plan: WrapPlan, j: number, first: boolean): boolean =>
  (plan.lens[j - 1] ?? 0) > lineAvail(plan, first);

const nextPending = (
  content: string,
  i: number,
  pending: 'space' | 'nbsp' | null,
): 'space' | 'nbsp' =>
  content.startsWith('&nbsp;', i) ? 'nbsp' : pending === 'nbsp' ? 'nbsp' : 'space';

const renderSep = (sep: 'space' | 'nbsp'): string => (sep === 'nbsp' ? '&nbsp;' : ' ');

const sepCost = (sep: 'space' | 'nbsp'): number => (sep === 'nbsp' ? 6 : 1);

const startsWithOpenTag = (atom: string): boolean => /^<[A-Za-z]/.test(atom);

const joinAtoms = (plan: WrapPlan, first: boolean, idx: number, nxt: number): string => {
  const insert = !first && startsWithOpenTag(plan.atoms[idx] ?? '') ? '&nbsp;' : '';
  let line = (plan.prefixes[first ? 0 : 1] ?? '') + insert + (plan.atoms[idx] ?? '');
  for (let k = idx; k < nxt - 1; k++) {
    line += renderSep(plan.seps[k] ?? 'space') + (plan.atoms[k + 1] ?? '');
  }
  return line;
};

const planWidth = (plan: WrapPlan, i: number, j: number, first: boolean): number => {
  let w = cpLen(plan.prefixes[first ? 0 : 1] ?? '');
  if (!first && startsWithOpenTag(plan.atoms[i] ?? '')) {
    w += 6;
  }
  for (let k = i; k < j; k++) {
    w += plan.lens[k] ?? 0;
    if (k < j - 1) {
      w += sepCost(plan.seps[k] ?? 'space');
    }
  }
  return w;
};

// Band mode scores every line by its distance from the width, so the wrap
// prefers the line closest to 100 on either side of it: an in-width line
// costs 100 minus its width, and a line past the width is legal only through
// the single-unbreakable-token exemption and costs its overflow. A short run
// therefore joins an unbreakable token only when the merged line lands closer
// to 100 than the run alone. Among equal totals the considerBreak tie-break
// still prefers the longest line, which keeps the greedy max-fill shape for
// blocks with no unbreakable token. Default mode keeps the zero-cost gate: a
// wrap counts a non-final line at or below the band floor as a cost, and an
// over-width line is never legal.
const lineCost = (
  plan: WrapPlan,
  i: number,
  j: number,
  first: boolean,
  final: boolean,
): number | null => {
  const w = planWidth(plan, i, j, first);
  if (w > plan.options.width) {
    return plan.options.band && endsAtUnbreakable(plan, j, first) ? w - plan.options.width : null;
  }
  if (final) {
    return 0;
  }
  if (plan.options.band) {
    return plan.options.width - w;
  }
  return w > plan.options.bandFloor ? 0 : 1;
};

const reconstruct = (plan: WrapPlan, choice: readonly number[]): string[] => {
  const lines: string[] = [];
  let idx = 0;
  while (idx < plan.atoms.length) {
    const nxt = choice[idx] ?? plan.atoms.length;
    lines.push(joinAtoms(plan, lines.length === 0, idx, nxt));
    idx = nxt;
  }
  return lines;
};

const suffixBalanced = (plan: WrapPlan, j: number): boolean => {
  let run = 0;
  for (let k = j; k < plan.atoms.length; k++) {
    run += plan.bal[k] ?? 0;
    if (run < 0) {
      return false;
    }
  }
  return true;
};

// AGENTS.md section 7: "never let a wrapped continuation line begin with
// structure" and a break is allowed "only with balanced tags after it"; an
// inline JSX element beginning a continuation keeps its preceding space as
// `&nbsp;`, and a complete inline link may lead the continuation line.
const breakLegal = (plan: WrapPlan, j: number): boolean => {
  const atom = plan.atoms[j] ?? '';
  const openSep = (plan.seps[j - 1] ?? 'space') === 'space';
  const startOk = !forbiddenStart(atom) || startsWithOpenTag(atom) || completeLinkStart(atom);
  return openSep && startOk && suffixBalanced(plan, j);
};

const considerBreak = (
  plan: WrapPlan,
  best: number[],
  choice: number[],
  j: number,
  k: number,
): void => {
  const final = k + 1 === plan.atoms.length;
  if (!final && !breakLegal(plan, k + 1)) {
    return;
  }
  const c = lineCost(plan, j, k + 1, j === 0, final);
  if (c === null) {
    return;
  }
  const total = c + (best[k + 1] ?? MAX_COST);
  if (total < best[j]) {
    best[j] = total;
    choice[j] = k + 1;
  } else if (total === best[j] && choice[j] !== -1 && k + 1 > choice[j]) {
    choice[j] = k + 1;
  }
};

const tagCharStep = (ch: string, quote: string): { end: boolean; quote: string } => {
  if (quote !== '') {
    return { end: false, quote: ch === quote ? '' : quote };
  }
  if (ch === '"' || ch === "'") {
    return { end: false, quote: ch };
  }
  return { end: ch === '>', quote };
};

export const tagEnd = (s: string, from: number): number => {
  let quote = '';
  for (let j = from; j < s.length; j++) {
    const step = tagCharStep(s[j] ?? '', quote);
    if (step.end) {
      return j;
    }
    quote = step.quote;
  }
  return -1;
};

const tryLink = (s: string, i: number): number => {
  const label = closeDepth(s, i, '[', ']');
  if (label === -1) {
    return i;
  }
  if (s[label] === '(') {
    return Math.max(closeDepth(s, label, '(', ')'), label);
  }
  if (s[label] === '[') {
    return Math.max(closeDepth(s, label, '[', ']'), label);
  }
  return label;
};

const tryTag = (s: string, i: number): number => {
  const next = s[i + 1] ?? '';
  if ((s[i] ?? '') !== '<' || !/[A-Za-z/]/.test(next)) {
    return i;
  }
  let j = i + 1;
  while (s[j] === '/') {
    j++;
  }
  if (!/[A-Za-z]/.test(s[j] ?? '')) {
    return i;
  }
  const close = tagEnd(s, j);
  return close === -1 ? i : close + 1;
};

export const tryConstruct = (s: string, i: number, allowQuote: boolean): number => {
  const c = s[i] ?? '';
  if (c === '`') {
    return codeSpanEnd(s, i);
  }
  if (c === '"' && allowQuote) {
    const j = s.indexOf('"', i + 1);
    return j === -1 ? i : j + 1;
  }
  if (c === '[') {
    return tryLink(s, i);
  }
  if (c === '{') {
    return closeDepth(s, i, '{', '}');
  }
  return tryTag(s, i);
};

const consumeAtom = (content: string, i: number): number => {
  let end = i;
  let guard = content.length * 3 + 8;
  while (end < content.length && !isSpace(content[end] ?? '') && guard-- > 0) {
    const next = tryConstruct(content, end, end === i);
    end = next > end ? next : end + 1;
  }
  return end === i ? i + 1 : end;
};

export const tokenize = (content: string): TokenStream => {
  const atoms: string[] = [];
  const seps: ('space' | 'nbsp')[] = [];
  let i = 0;
  let pending: 'space' | 'nbsp' | null = null;
  while (i < content.length) {
    const consumed = consumeSeparator(content, i);
    if (consumed > i) {
      pending = nextPending(content, i, pending);
      i = consumed;
      continue;
    }
    const end = consumeAtom(content, i);
    if (atoms.length > 0) {
      seps.push(pending ?? 'space');
    }
    atoms.push(content.slice(i, end));
    pending = null;
    i = end;
  }
  return { atoms, seps };
};

// Band mode: uniform-cost greedy max-fill (longest legal line, then the next).
// Default mode: minimize below-floor non-final lines, then prefer the longest
// first line, then the longest second line, and so on.
export const wrapAtoms = (
  atoms: readonly string[],
  seps: readonly ('space' | 'nbsp')[],
  firstPrefix: string,
  contPrefix: string,
  options: ReflowOptions,
): { cost: number; feasible: boolean; lines: string[] } => {
  const n = atoms.length;
  if (n === 0) {
    return { cost: 0, feasible: true, lines: [] };
  }
  const plan: WrapPlan = {
    atoms,
    bal: atoms.map(atomBalance),
    lens: atoms.map(cpLen),
    options,
    prefixes: [firstPrefix, contPrefix],
    seps,
  };
  // Default mode never wraps a block holding an atom wider than the line, so
  // the frozen repository corpus keeps its authored bytes; band mode routes
  // every atom through lineCost, whose unbreakable-token exemption may place
  // it on a line of its own.
  if (!plan.options.band && !atomsFit(plan)) {
    return { cost: MAX_COST, feasible: false, lines: [] };
  }
  const best = new Array<number>(n + 1).fill(MAX_COST);
  const choice = new Array<number>(n + 1).fill(-1);
  best[n] = 0;
  for (let j = n - 1; j >= 0; j--) {
    for (let k = j; k < n; k++) {
      considerBreak(plan, best, choice, j, k);
    }
  }
  if (best[0] === MAX_COST) {
    return { cost: MAX_COST, feasible: false, lines: [] };
  }
  return { cost: best[0], feasible: true, lines: reconstruct(plan, choice) };
};
