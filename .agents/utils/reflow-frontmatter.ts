/**
 * reflow frontmatter engine - band-mode normalization of top-level YAML
 * frontmatter scalars plus the canonical frontmatter comparison used by the
 * formatting-only invariants. Consumed by utils/reflow-file.ts.
 */

import { cpLen, type ReflowOptions, tokenize, wrapAtoms } from './reflow.js';

export interface FmResidual {
  readonly blockKind: string;
  readonly len: number;
  readonly line: number;
  readonly reason: string;
}

// Band mode normalizes top-level frontmatter scalars to the owner's
// representation rule: a value whose own key line fits the width is a plain
// scalar, a longer value becomes a folded `>-` block whose content lines run
// greedily to the width at a two-space indent, and quoted style survives only
// where dropping it would change the scalar's type or escape meaning. Default
// mode never touches frontmatter, so the frozen repository corpus stays
// byte-identical.
const FM_TYPELIKE =
  /^(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|true|false|null|yes|no|on|off)$/i;

// The canonical entry for one block-scalar key: folded blocks resolve to the
// joined string, literal blocks keep their raw chunk.
const fmBlockEntry = (
  fm: readonly string[],
  i: number,
  key: string,
  value: string,
): { entry: string[]; next: number } => {
  const body: string[] = [];
  let j = i + 1;
  while (j < fm.length && (fm[j] === '' || /^[\s]/.test(fm[j] ?? ''))) {
    body.push(fm[j] ?? '');
    j += 1;
  }
  const entry = value.startsWith('>')
    ? [key, body.map((l) => l.trim()).join(' ')]
    : [key, value, ...body];
  return { entry, next: j };
};

const hasFmControlChar = (v: string): boolean => {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) {
      return true;
    }
  }
  return false;
};

// A plain scalar is unsafe when YAML could misread it as an indicator, a
// comment, a nested mapping, or a flow collection.
const plainFmSafe = (v: string): boolean =>
  v.length > 0
  && !/^[\s]/.test(v)
  && !/[\s]$/.test(v)
  && !v.includes('\t')
  && !/^[-?:,[\]{}#&*!|>'"%@`]/.test(v)
  && !/[ \t]#/.test(v)
  && !v.includes(': ')
  && !v.endsWith(':')
  && !hasFmControlChar(v);

// The frontmatter region of a document, or null when the text does not open
// with a closed `---` block. `rest` keeps the closing delimiter.
export const splitFrontmatter = (text: string): { fm: string[]; rest: string } | null => {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    return null;
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  return end < 0 ? null : { fm: lines.slice(1, end), rest: lines.slice(end).join('\n') };
};

// Returns the string content of a quoted scalar, or null when quoting is
// load-bearing: an empty scalar, escaped characters, or malformed nesting.
const unquoteFmValue = (v: string): string | null => {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    const inner = v.slice(1, -1);
    return inner.length === 0 || inner.includes('\\') || inner.includes('"') ? null : inner;
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
    const inner = v.slice(1, -1);
    return inner.length === 0 || inner.includes("'") ? null : inner;
  }
  return null;
};

// Canonical frontmatter entries: each scalar resolves to [key, string] across
// plain, quoted, and folded representations, and everything else (arrays,
// literal blocks, nested lines) keeps its raw chunk so an untouched line is
// always equal to itself.
export const fmEntries = (fm: readonly string[]): string[][] => {
  const entries: string[][] = [];
  let i = 0;
  while (i < fm.length) {
    const raw = fm[i] ?? '';
    const hit = /^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/.exec(raw);
    if (hit === null || /^[\s]/.test(raw)) {
      entries.push([raw]);
      i += 1;
      continue;
    }
    const key = hit[1] ?? '';
    const value = hit[2] ?? '';
    if (/^[|>][+-]?$/.test(value)) {
      const { entry, next } = fmBlockEntry(fm, i, key, value);
      entries.push(entry);
      i = next;
      continue;
    }
    entries.push([key, unquoteFmValue(value) ?? value]);
    i += 1;
  }
  return entries;
};

const fmScalarPlan = (
  key: string,
  value: string,
  options: ReflowOptions,
): readonly string[] | null => {
  const unquoted = unquoteFmValue(value);
  if (unquoted === null && /^["']/.test(value)) {
    return null; // quoting is load-bearing: escapes, empty scalar, or bad nesting
  }
  const content = unquoted ?? value;
  if (content.length === 0 || FM_TYPELIKE.test(content)) {
    return null;
  }
  if (plainFmSafe(content) && cpLen(`${key}: ${content}`) <= options.width) {
    return [`${key}: ${content}`];
  }
  const stream = tokenize(content);
  const wrap = wrapAtoms(stream.atoms, stream.seps, '  ', '  ', options);
  // The fold exists to represent the value within the width: an unbreakable
  // atom that keeps a folded line past the width adds no representation, so
  // the scalar stays authored and reports a residual instead.
  const foldable =
    wrap?.feasible === true && wrap.lines.every((line) => cpLen(line) <= options.width);
  return foldable ? [`${key}: >-`, ...wrap.lines] : null;
};

// The verdict for one candidate key line: `lines` holds the replacement when
// the plan changes the line, and `residual` reports an over-width line whose
// value cannot be represented within the width at all.
const fmNormalizeLine = (
  raw: string,
  options: ReflowOptions,
): { lines: readonly string[] | null; residual: Omit<FmResidual, 'line'> | null } => {
  const hit = /^([A-Za-z0-9_-]+):\s*(\S.*)$/.exec(raw);
  if (hit === null || /^[|>[\]{}&*#]/.test(hit[2] ?? '')) {
    return { lines: null, residual: null };
  }
  const plan = fmScalarPlan(hit[1] ?? '', hit[2] ?? '', options);
  if (plan !== null) {
    return { lines: plan.join('\n') === raw ? null : plan, residual: null };
  }
  const len = cpLen(raw);
  return {
    lines: null,
    residual:
      len > options.width
        ? { blockKind: 'fm-scalar', len, reason: 'fm-scalar-unrepresentable' }
        : null,
  };
};

const fmWalkRegion = (out: string[], options: ReflowOptions): FmResidual[] => {
  const residuals: FmResidual[] = [];
  // The end bound is re-tested every iteration, not captured before the walk:
  // a fold splice grows the region, and a stale bound would hide every later
  // key from the normalizer.
  let i = 1;
  let shift = 0;
  while (i < out.length && out[i]?.trim() !== '---') {
    const { lines, residual } = fmNormalizeLine(out[i] ?? '', options);
    if (lines !== null) {
      out.splice(i, 1, ...lines);
      i += lines.length;
      shift += lines.length - 1;
      continue;
    }
    if (residual !== null) {
      residuals.push({ ...residual, line: i + 1 + shift });
    }
    i += 1;
  }
  return residuals;
};

export const normalizeFrontmatter = (
  lines: readonly string[],
  options: ReflowOptions,
): { lines: string[]; residuals: FmResidual[] } => {
  const out = [...lines];
  if (out[0]?.trim() !== '---') {
    return { lines: out, residuals: [] };
  }
  const closing = out.findIndex((line, idx) => idx > 0 && line.trim() === '---');
  if (closing < 0) {
    return { lines: out, residuals: [] };
  }
  return { lines: out, residuals: fmWalkRegion(out, options) };
};
