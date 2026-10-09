/**
 * reflow file engine - line classification, block resolution, and the
 * over-limit reflow transform for Markdown/MDX. The tokenizer and wrap DP
 * live in utils/reflow.ts; this module owns the file-level structure scan.
 * Consumed by scripts/reflow.ts and its Bun suite.
 */

import {
  BAND_FLOOR,
  closeDepth,
  cpLen,
  joinContent,
  type ReflowOptions,
  tagEnd,
  tokenize,
  tryConstruct,
  WIDTH,
  wrapAtoms,
} from './reflow.js';
import { fmEntries, normalizeFrontmatter, splitFrontmatter } from './reflow-frontmatter.js';

export interface BodyScan {
  comment: boolean;
  fence: { ch: string; len: number } | null;
  footnoteIndent: number;
}

export interface ConstructState {
  depth: number;
  inQuote: string;
  inTag: boolean;
}

export type Kind =
  | 'admonition'
  | 'blank'
  | 'citation-source'
  | 'code'
  | 'comment'
  | 'footnote-cont'
  | 'footnote-def'
  | 'fm'
  | 'fm-array'
  | 'fm-scalar'
  | 'hard-break'
  | 'heading'
  | 'import-line'
  | 'jsx-multi'
  | 'jsx-only'
  | 'prose'
  | 'quote-lazy'
  | 'quote-list'
  | 'reference-def'
  | 'table'
  | 'thematic'
  | 'verse';

export interface LineRec {
  readonly indent: number;
  kind: Kind | null;
  readonly n: number;
  readonly raw: string;
}

export interface MarkerMatch {
  readonly contentCol: number;
  readonly lead: string;
}

export interface ReflowBlock {
  readonly contPrefix: string;
  readonly end: number;
  readonly firstPrefix: string;
  readonly kind: string;
  readonly lines: readonly string[];
  readonly start: number;
  violations: { len: number; line: number }[];
}

export interface ReflowResult {
  readonly changed: boolean;
  readonly output: string;
  readonly residuals: readonly Residual[];
}

export interface Residual {
  readonly blockKind: string;
  readonly len: number;
  readonly line: number;
  readonly reason: string;
}

// AGENTS.md section 7 exempts these line classes from wrapping: thematic
// breaks, headings, imports, tables, admonitions, citation lines, "a trailing
// two-space break, trailing backslash", footnotes, and reference definitions.
const KIND_RULES: readonly (readonly [Kind, (raw: string) => boolean])[] = [
  ['admonition', (raw) => raw.trim().startsWith(':::')],
  ['thematic', (raw) => /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)],
  ['heading', (raw) => /^\s{0,3}#{1,6}(\s|$)/.test(raw)],
  ['import-line', (raw) => /^\s*(import|export)\s/.test(raw)],
  ['table', (raw) => raw.trim().startsWith('|')],
  ['citation-source', (raw) => raw.trim().startsWith('<em>Source:')],
  ['footnote-def', (raw) => /^\[\^[^\]]+\]:/.test(raw.trim())],
  ['reference-def', (raw) => /^\[(?!\^)[^\]]*\]:\s*\S/.test(raw.trim())],
  ['hard-break', (raw) => /\S {2,}$/.test(raw) || /\\$/.test(raw.trim())],
];

const applyInTag = (ch: string, prev: string, state: ConstructState): void => {
  if (state.inQuote !== '') {
    if (ch === state.inQuote) {
      state.inQuote = '';
    }
    return;
  }
  if (ch === '"' || ch === "'") {
    state.inQuote = ch;
    return;
  }
  if (ch === '>') {
    state.inTag = false;
    if (prev === '/') {
      state.depth--;
    }
  }
};

export const DEFAULT_OPTIONS: ReflowOptions = { band: false, bandFloor: BAND_FLOOR, width: WIDTH };

// Band mode selection: every reflowable block is re-wrapped with the greedy
// max-fill objective, so an already canonical block re-emits its own lines and
// stays byte-identical. Frontmatter scalars keep their authored wrap because
// AGENTS.md section 7 exempts YAML frontmatter.
const bandSelected = (b: ReflowBlock, options: ReflowOptions): boolean =>
  options.band === true && b.kind !== 'fm-scalar';

const bestWrap = (
  b: ReflowBlock,
  options: ReflowOptions,
): { cost: number; feasible: boolean; lines: string[] } | null => {
  const content = joinContent(b.lines);
  if (content.length === 0) {
    return null;
  }
  const stream = tokenize(content);
  return wrapAtoms(stream.atoms, stream.seps, b.firstPrefix, b.contPrefix, options);
};

const blankStep = (recs: readonly LineRec[], i: number, scan: BodyScan): number => {
  const r = recs[i];
  r.kind = 'blank';
  const after = recs[i + 1];
  if (!(scan.footnoteIndent >= 0 && after && after.indent > scan.footnoteIndent)) {
    scan.footnoteIndent = -1;
  }
  return i + 1;
};

// Default mode applies only a zero-cost wrap: every non-final line lands in
// 81..100, so it always removes the over line. Every remaining over-limit line
// must belong to a named protected class or a block whose wrap is infeasible.
// Band mode applies every feasible wrap: lineCost charges zero for any legal
// in-width line, so the longest-line tie-break alone picks the greedy max-fill
// wrap, and an unbreakable atom may force a short line or close a line past
// the width.
const blockResiduals = (b: ReflowBlock, wrap: { feasible: boolean } | null): Residual[] =>
  b.violations.map((v) => ({
    blockKind: b.kind,
    len: v.len,
    line: v.line,
    reason:
      wrap === null || !wrap.feasible ? 'unbreakable-atom-in-context' : 'band-refill-not-possible',
  }));

const bracketDepth = (s: string): number =>
  [...s].reduce((d, ch) => d + (ch === '[' ? 1 : ch === ']' ? -1 : 0), 0);

const arrayRegion = (recs: readonly LineRec[], i: number, value: string): number => {
  const r = recs[i];
  r.kind = 'fm';
  let depth = bracketDepth(value);
  if (depth <= 0) {
    return i;
  }
  let j = i + 1;
  while (depth > 0 && j < recs.length) {
    const c = recs[j];
    depth += bracketDepth(c.raw);
    c.kind = 'fm-array';
    j++;
  }
  return j;
};

const commentOpen = (r: LineRec, t: string, scan: BodyScan): void => {
  r.kind = 'comment';
  if (!(t.includes('*/}') || t.includes('-->'))) {
    scan.comment = true;
  }
};

const commentStep = (recs: readonly LineRec[], i: number, scan: BodyScan): number => {
  const r = recs[i];
  r.kind = 'comment';
  if (r.raw.includes('*/}') || r.raw.includes('-->')) {
    scan.comment = false;
  }
  return i + 1;
};

const constructClosed = (state: ConstructState): boolean =>
  state.depth <= 0 && !state.inTag && state.inQuote === '';

const constructCloseTag = (s: string, i: number, state: ConstructState): number => {
  state.depth--;
  const close = tagEnd(s, i + 1);
  if (close === -1) {
    state.inTag = true;
    return i + 1;
  }
  return close + 1;
};

const constructOpenTag = (s: string, i: number, state: ConstructState): number => {
  const close = tagEnd(s, i + 1);
  if (close === -1) {
    state.depth++;
    state.inTag = true;
    return i + 1;
  }
  if (s[close - 1] !== '/') {
    state.depth++;
  }
  return close + 1;
};

const constructChar = (c: string, s: string, i: number, state: ConstructState): number => {
  if (c !== '<') {
    if (c === '{') {
      state.depth++;
    } else if (c === '}') {
      state.depth--;
    }
    return i + 1;
  }
  const next = s[i + 1] ?? '';
  if (/[A-Za-z]/.test(next)) {
    return constructOpenTag(s, i, state);
  }
  if (next === '/') {
    return constructCloseTag(s, i, state);
  }
  return i + 1;
};

const constructStart = (c: string): boolean => c === '`' || c === '[' || c === '{';

const constructDelta = (s: string, state: ConstructState): void => {
  let i = 0;
  while (i < s.length) {
    if (state.inTag) {
      applyInTag(s[i] ?? '', s[i - 1] ?? '', state);
      i++;
      continue;
    }
    const c = s[i] ?? '';
    const consumed = constructStart(c) ? tryConstruct(s, i, false) : i;
    if (consumed > i) {
      i = consumed;
      continue;
    }
    i = constructChar(c, s, i, state);
  }
};

const constructOpen = (raw: string): ConstructState => {
  const state: ConstructState = { depth: 0, inQuote: '', inTag: false };
  constructDelta(raw, state);
  return state;
};

const consumeConstruct = (recs: readonly LineRec[], i: number, state: ConstructState): number => {
  const opener = recs[i];
  if (opener) {
    opener.kind = 'jsx-multi';
  }
  let j = i + 1;
  while (j < recs.length) {
    const c = recs[j];
    c.kind = 'jsx-multi';
    constructDelta(c.raw, state);
    j++;
    if (constructClosed(state)) {
      break;
    }
  }
  return j;
};

const enumeratedMatch = (s: string): boolean => /^\s*\d{1,9}[.)](\s|$)/.test(s);

const extractLinkTargets = (text: string): string[] => {
  const targets: string[] = [];
  const re = /\]\(([^)\s]+)\)/g;
  let m = re.exec(text);
  while (m) {
    targets.push(m[1] ?? '');
    m = re.exec(text);
  }
  return targets.sort();
};

const fenceStep = (recs: readonly LineRec[], i: number, scan: BodyScan): number => {
  const r = recs[i];
  r.kind = 'code';
  const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(r.raw);
  if (
    scan.fence
    && close
    && (close[1] ?? '')[0] === scan.fence.ch
    && (close[1] ?? '').length >= scan.fence.len
  ) {
    scan.fence = null;
  }
  return i + 1;
};

const footnoteIndentFor = (simple: Kind, r: LineRec, current: number): number => {
  if (simple === 'footnote-def') {
    return r.indent;
  }
  return simple === 'hard-break' || simple === 'reference-def' ? current : -1;
};

const indentOf = (s: string): number => (s.match(/^ */) ?? [''])[0]?.length ?? 0;

const isBlank = (s: string): boolean => s.trim().length === 0;

const isExemptKind = (kind: Kind | null): boolean =>
  kind !== null && kind !== 'prose' && kind !== 'blank';

const joinLines = (lines: readonly string[], crlf: boolean, tail: boolean): string => {
  const eol = crlf ? '\r\n' : '\n';
  return tail ? `${lines.join(eol)}${eol}` : lines.join(eol);
};

const lazyRow = (
  recs: readonly LineRec[],
  r: LineRec,
  strict: readonly (string | null)[],
  j: number,
  lastIndent: number,
): { indent?: number; lazy: boolean; stop: boolean } => {
  if (isBlank(r.raw)) {
    const after = recs[j + 1];
    const cont =
      after !== undefined
      && (strict[j + 1] !== null || (after.kind === 'prose' && after.indent > lastIndent));
    return { lazy: false, stop: !cont };
  }
  if (strict[j] !== null) {
    return { indent: r.indent, lazy: false, stop: false };
  }
  if (r.kind === 'prose' && r.indent > lastIndent) {
    return { lazy: true, stop: false };
  }
  return { lazy: false, stop: true };
};

const lazyTail = (
  recs: readonly LineRec[],
  strict: readonly (string | null)[],
  lazy: boolean[],
  start: number,
): number => {
  let j = start + 1;
  let lastIndent = recs[start]?.indent ?? 0;
  while (j < recs.length) {
    const r = recs[j];
    const row = lazyRow(recs, r, strict, j, lastIndent);
    if (row.stop) {
      break;
    }
    if (row.indent !== undefined) {
      lastIndent = row.indent;
    }
    if (row.lazy) {
      lazy[j] = true;
    }
    j++;
  }
  return j;
};

const markerMatch = (s: string): MarkerMatch | null => {
  const m = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)/.exec(s);
  if (!m || ((m[3] ?? '').length === 0 && s.trim() !== m[2])) {
    return null;
  }
  return { contentCol: (m[1] ?? '').length + (m[2] ?? '').length + 1, lead: m[0] ?? s };
};

// AGENTS.md section 7: verse quotes stay untouched; enumerated items wrap. A
// lazy continuation is indented at least one space but less than the marker's
// content column; CommonMark keeps it inside the item's paragraph, so the
// block takes it and the wrap realigns every continuation under the content
// column instead of orphaning the item's first line as a single-line block.
const listContRow = (
  c: LineRec,
  marker: MarkerMatch,
  cont: number | null,
): { cont: number; take: boolean } | null => {
  if (isBlank(c.raw)) {
    return null;
  }
  if (c.kind !== 'prose' || markerMatch(c.raw) !== null) {
    return null;
  }
  const lazy = c.indent >= 1 && c.indent < marker.contentCol;
  if (!lazy && c.indent < marker.contentCol) {
    return null;
  }
  const own = cont ?? (lazy ? marker.contentCol : c.indent);
  return { cont: own, take: lazy || c.indent === own };
};

const mkBlock = (
  recs: readonly LineRec[],
  start: number,
  end: number,
  kind: string,
  lines: readonly string[],
  firstPrefix: string,
  contPrefix: string,
  options: ReflowOptions,
): ReflowBlock => {
  const violations: ReflowBlock['violations'] = [];
  for (let k = start; k <= end; k++) {
    const rec = recs[k];
    if (!rec) {
      continue;
    }
    const len = cpLen(rec.raw);
    if (len > options.width) {
      violations.push({ len, line: rec.n });
    }
  }
  return { contPrefix, end, firstPrefix, kind, lines, start, violations };
};

// Band mode reflows a footnote definition to the greedy max-fill wrap while
// each definition keeps its own line: the label leads and every continuation
// aligns under the label text. Default mode keeps footnotes verbatim because
// AGENTS.md section 7 exempts their authored alignment.
const footnoteBlock = (
  recs: readonly LineRec[],
  i: number,
  blocks: ReflowBlock[],
  options: ReflowOptions,
): number => {
  const r = recs[i];
  const m = /^(\s*)(\[\^[^\]]+\]:)( )/.exec(r.raw);
  if (!m) {
    return i + 1;
  }
  const lead = m[0] ?? r.raw;
  const lines = [r.raw.slice(lead.length)];
  let j = i + 1;
  while (j < recs.length) {
    const c = recs[j];
    if (c?.kind !== 'footnote-cont') {
      break;
    }
    lines.push(c.raw.trim());
    j++;
  }
  blocks.push(mkBlock(recs, i, j - 1, 'footnote', lines, lead, ' '.repeat(cpLen(lead)), options));
  return j;
};

const listItemBlock = (
  recs: readonly LineRec[],
  i: number,
  marker: MarkerMatch,
  blocks: ReflowBlock[],
  options: ReflowOptions,
): number => {
  let j = i + 1;
  let cont: number | null = null;
  while (j < recs.length) {
    const c = recs[j];
    const row = listContRow(c, marker, cont);
    if (row?.take !== true) {
      break;
    }
    cont = row.cont;
    j++;
  }
  const lines = [(recs[i]?.raw ?? '').slice(marker.lead.length)];
  // Each continuation strips its own authored indent, which may be lazier than
  // the block's uniform continuation column; the wrap re-emits every line at
  // the normalized column. Slicing at the block column would cut a character
  // out of a line indented narrower than that column.
  for (let m = i + 1; m < j; m++) {
    lines.push((recs[m]?.raw ?? '').slice(recs[m]?.indent ?? 0));
  }
  const prefix = ' '.repeat(cont ?? marker.contentCol);
  blocks.push(mkBlock(recs, i, j - 1, 'list-item', lines, marker.lead, prefix, options));
  return j;
};

const multiLineConstruct = (recs: readonly LineRec[], i: number): number => {
  const opener = recs[i];
  const state = constructOpen(opener.raw);
  if (constructClosed(state)) {
    opener.kind = 'prose';
    return i + 1;
  }
  return consumeConstruct(recs, i, state);
};

const nonWhitespace = (text: string): string => text.replace(/\s+/g, '');

const normalizeText = (text: string): string => text.replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ');

const proseBlock = (
  recs: readonly LineRec[],
  i: number,
  blocks: ReflowBlock[],
  options: ReflowOptions,
): number => {
  const r = recs[i];
  const marker = markerMatch(r.raw);
  if (marker) {
    return listItemBlock(recs, i, marker, blocks, options);
  }
  const indent = r.indent;
  let j = i;
  while (j < recs.length) {
    const c = recs[j];
    if (c?.kind !== 'prose' || c?.indent !== indent || markerMatch(c.raw) !== null) {
      break;
    }
    j++;
  }
  const prefix = ' '.repeat(indent);
  const lines = recs.slice(i, j).map((x) => x.raw.slice(indent));
  blocks.push(mkBlock(recs, i, j - 1, 'paragraph', lines, prefix, prefix, options));
  return j;
};

const quoteMatch = (s: string): { content: string; prefix: string } | null => {
  const m = /^(\s*)(>{1,})(\s|$)/.exec(s);
  if (!m) {
    return null;
  }
  const space = m[3] === ' ' ? ' ' : '';
  return { content: s.slice((m[0] ?? '').length), prefix: `${m[1] ?? ''}${m[2] ?? ''}${space}` };
};

const quoteItemWalk = (recs: readonly LineRec[], i: number): number => {
  let j = i + 1;
  while (j < recs.length) {
    const c = recs[j];
    const cq = quoteMatch(c.raw);
    if (c.kind !== 'quote-list' || cq === null || markerMatch(cq.content) !== null) {
      break;
    }
    j++;
  }
  return j;
};

const quoteItemBlock = (
  recs: readonly LineRec[],
  i: number,
  blocks: ReflowBlock[],
  options: ReflowOptions,
): number => {
  const r = recs[i];
  const q = quoteMatch(r.raw);
  const marker = q === null ? null : markerMatch(q.content);
  if (q === null || marker === null) {
    return i + 1;
  }
  const j = quoteItemWalk(recs, i);
  const lines = [q.content.slice(marker.lead.length)];
  for (let m = i + 1; m < j; m++) {
    lines.push(quoteMatch(recs[m]?.raw ?? '')?.content ?? '');
  }
  const contPrefix = `${q.prefix}${' '.repeat(marker.contentCol - 1)}`;
  blocks.push(
    mkBlock(recs, i, j - 1, 'quote-item', lines, q.prefix + marker.lead, contPrefix, options),
  );
  return j;
};

const quoteNotes = (
  row: 'lazy' | 'strict',
  r: LineRec,
): { enumerated: boolean; hasLazy: boolean } => {
  if (row === 'lazy') {
    return { enumerated: enumeratedMatch(r.raw.trim()), hasLazy: true };
  }
  const q = quoteMatch(r.raw);
  return { enumerated: q !== null && enumeratedMatch(q.content), hasLazy: false };
};

// Band mode reflows quoted prose with its quote format kept: every emitted
// line carries the region's quote prefix, counted toward the 100 columns, and
// a blank quoted line still separates quoted paragraphs. Default mode keeps
// verse and plain quote regions verbatim.
const quoteParagraphBlock = (
  recs: readonly LineRec[],
  i: number,
  blocks: ReflowBlock[],
  options: ReflowOptions,
): number => {
  const q = quoteMatch(recs[i]?.raw ?? '') ?? { content: '', prefix: '' };
  let j = i + 1;
  const lines = [q.content];
  while (j < recs.length) {
    const c = recs[j];
    const cq = c === undefined ? null : quoteMatch(c.raw);
    if (c?.kind !== 'verse' || cq === null || cq.prefix !== q.prefix || isBlank(cq.content)) {
      break;
    }
    lines.push(cq.content);
    j++;
  }
  blocks.push(mkBlock(recs, i, j - 1, 'quote-paragraph', lines, q.prefix, q.prefix, options));
  return j;
};

const quoteRow = (
  recs: readonly LineRec[],
  r: LineRec,
  strict: readonly (string | null)[],
  lazy: readonly boolean[],
  j: number,
): 'blank' | 'end' | 'lazy' | 'strict' => {
  if (strict[j] !== null) {
    return 'strict';
  }
  if (lazy[j]) {
    return 'lazy';
  }
  if (isBlank(r.raw)) {
    const after = recs[j + 1];
    return after !== undefined && (strict[j + 1] !== null || lazy[j + 1]) ? 'blank' : 'end';
  }
  return 'end';
};

const quoteScan = (
  recs: readonly LineRec[],
  strict: readonly (string | null)[],
  lazy: readonly boolean[],
  start: number,
): { end: number; enumerated: boolean; hasLazy: boolean } => {
  let j = start;
  let hasLazy = false;
  let enumerated = false;
  while (j < recs.length) {
    const r = recs[j];
    const row = quoteRow(recs, r, strict, lazy, j);
    if (row === 'end') {
      break;
    }
    if (row === 'blank') {
      j++;
      continue;
    }
    const notes = quoteNotes(row, r);
    hasLazy ||= notes.hasLazy;
    enumerated ||= notes.enumerated;
    j++;
  }
  return { end: j, enumerated, hasLazy };
};

const quoteRegion = (
  recs: readonly LineRec[],
  strict: readonly (string | null)[],
  lazy: readonly boolean[],
  start: number,
): number => {
  const info = quoteScan(recs, strict, lazy, start);
  const kind: Kind = info.hasLazy ? 'quote-lazy' : info.enumerated ? 'quote-list' : 'verse';
  for (let m = start; m < info.end; m++) {
    const r = recs[m];
    if (r && r.kind === 'prose') {
      r.kind = kind;
    }
  }
  return info.end;
};

const markQuoteRegions = (recs: readonly LineRec[]): void => {
  const strict = recs.map((r) => {
    if (r.kind !== 'prose' && r.kind !== 'blank') {
      return null;
    }
    const q = quoteMatch(r.raw);
    return q ? q.prefix : null;
  });
  const lazy = new Array<boolean>(recs.length).fill(false);
  let k = 0;
  while (k < recs.length) {
    k = strict[k] === null ? k + 1 : lazyTail(recs, strict, lazy, k);
  }
  k = 0;
  while (k < recs.length) {
    k = strict[k] === null ? k + 1 : quoteRegion(recs, strict, lazy, k);
  }
};

const reflowBlocks = (
  recs: readonly LineRec[],
  blocks: readonly ReflowBlock[],
  options: ReflowOptions,
): { lines: string[]; residuals: Residual[] } => {
  const lines = recs.map((r) => r.raw);
  const residuals: Residual[] = [];
  for (const b of [...blocks].sort((a, c) => c.start - a.start)) {
    if (b.violations.length === 0 && !bandSelected(b, options)) {
      continue;
    }
    const wrap = bestWrap(b, options);
    // Band mode applies every feasible wrap: the distance objective has no
    // zero-cost baseline. Default mode keeps the zero-cost gate.
    if (wrap?.feasible === true && (options.band === true || wrap.cost === 0)) {
      lines.splice(b.start, b.end - b.start + 1, ...wrap.lines);
    } else {
      residuals.push(...blockResiduals(b, wrap));
    }
  }
  return { lines, residuals };
};

const scalarBlock = (
  recs: readonly LineRec[],
  i: number,
  blocks: ReflowBlock[],
  options: ReflowOptions,
): number => {
  const indent = recs[i]?.indent ?? 0;
  let j = i;
  while (j < recs.length) {
    const c = recs[j];
    if (c?.kind !== 'fm-scalar' || c?.indent !== indent) {
      break;
    }
    j++;
  }
  const prefix = ' '.repeat(indent);
  const lines = recs.slice(i, j).map((x) => x.raw.slice(indent));
  blocks.push(mkBlock(recs, i, j - 1, 'fm-scalar', lines, prefix, prefix, options));
  return j;
};

const blockStep = (
  recs: readonly LineRec[],
  i: number,
  blocks: ReflowBlock[],
  options: ReflowOptions,
): number => {
  const r = recs[i];
  if (r.kind === 'fm-scalar') {
    return scalarBlock(recs, i, blocks, options);
  }
  if (r.kind === 'quote-list') {
    return quoteItemBlock(recs, i, blocks, options);
  }
  if (options.band === true && r.kind === 'verse') {
    return quoteParagraphBlock(recs, i, blocks, options);
  }
  if (options.band === true && r.kind === 'footnote-def') {
    return footnoteBlock(recs, i, blocks, options);
  }
  if (r.kind === 'prose') {
    return proseBlock(recs, i, blocks, options);
  }
  return i + 1;
};

export const resolveBlocks = (recs: readonly LineRec[], options: ReflowOptions): ReflowBlock[] => {
  markQuoteRegions(recs);
  const blocks: ReflowBlock[] = [];
  let i = 0;
  while (i < recs.length) {
    i = blockStep(recs, i, blocks, options);
  }
  return blocks;
};

const scalarRow = (
  c: LineRec,
  after: LineRec | undefined,
  keyIndent: number,
): 'blank' | 'fm' | 'scalar' | 'stop' => {
  if (isBlank(c.raw)) {
    return after !== undefined && after.indent > keyIndent && !isBlank(after.raw)
      ? 'blank'
      : 'stop';
  }
  return c.indent > keyIndent ? 'scalar' : 'stop';
};

const scalarRegion = (recs: readonly LineRec[], i: number, keyIndent: number): number => {
  const r = recs[i];
  if (r) {
    r.kind = 'fm';
  }
  let j = i + 1;
  while (j < recs.length) {
    const c = recs[j];
    const row = scalarRow(c, recs[j + 1], keyIndent);
    if (row === 'stop') {
      break;
    }
    c.kind = row === 'blank' ? 'fm' : 'fm-scalar';
    j++;
  }
  return j;
};

const frontmatterStep = (recs: readonly LineRec[], i: number): number => {
  const r = recs[i];
  const scalar = /^(\s*)([^:]+):\s*([|>][+-]?)\s*$/.exec(r.raw);
  if (scalar) {
    return scalarRegion(recs, i, (scalar[1] ?? '').length);
  }
  const arr = /^(\s*)([^:]+):\s*(\S.*)$/.exec(r.raw);
  const value = arr?.[3] ?? '';
  if (value.includes('[')) {
    const end = arrayRegion(recs, i, value);
    if (end > i) {
      return end;
    }
  }
  r.kind = 'fm';
  return i + 1;
};

const scanFrontmatter = (recs: readonly LineRec[]): number => {
  const first = recs[0];
  if (first?.raw.trim() !== '---') {
    return 0;
  }
  first.kind = 'fm';
  let i = 1;
  while (i < recs.length) {
    const r = recs[i];
    if (r.raw.trim() === '---') {
      r.kind = 'fm';
      return i + 1;
    }
    i = frontmatterStep(recs, i);
  }
  for (const r of recs) {
    r.kind = null;
  }
  return 0;
};

const simpleKind = (raw: string): Kind | null => {
  const hit = KIND_RULES.find(([, test]) => test(raw));
  return hit ? hit[0] : null;
};

const specialStep = (recs: readonly LineRec[], i: number, scan: BodyScan): number | null => {
  const r = recs[i];
  if (isBlank(r.raw)) {
    return blankStep(recs, i, scan);
  }
  const t = r.raw.trim();
  if (t.startsWith('{/*') || t.startsWith('{/*!') || t.startsWith('<!--')) {
    commentOpen(r, t, scan);
    return i + 1;
  }
  const fenceOpen = /^\s{0,3}(`{3,}|~{3,})/.exec(r.raw);
  if (fenceOpen && r.indent <= 3) {
    r.kind = 'code';
    scan.fence = { ch: (fenceOpen[1] ?? '`')[0] ?? '`', len: (fenceOpen[1] ?? '```').length };
    return i + 1;
  }
  return null;
};

const splitLines = (text: string): { crlf: boolean; lines: string[]; tail: boolean } => {
  const crlf = text.includes('\r\n');
  const lines = (crlf ? text.replaceAll('\r\n', '\n') : text).split('\n');
  const tail = lines.length > 0 && lines[lines.length - 1] === '';
  if (tail) {
    lines.pop();
  }
  return { crlf, lines, tail };
};

const stripEntities = (s: string): string => {
  let t = s;
  while (t.startsWith('&nbsp;')) {
    t = t.slice(6);
  }
  return t;
};

const isJsxSingle = (s: string): boolean => {
  const t = stripEntities(s.trim());
  if (/^<\/?[A-Za-z][^<>]*\/?>$/.test(t) || /^<[^<>]+><\/[^<>]+>$/.test(t)) {
    return true;
  }
  return /^\{.*\}$/.test(t) && closeDepth(t, 0, '{', '}') === t.length;
};

const bodyKind = (recs: readonly LineRec[], i: number, scan: BodyScan): number => {
  const r = recs[i];
  const simple = simpleKind(r.raw);
  if (simple) {
    r.kind = simple;
    scan.footnoteIndent = footnoteIndentFor(simple, r, scan.footnoteIndent);
    return i + 1;
  }
  if (scan.footnoteIndent >= 0 && r.indent > scan.footnoteIndent) {
    r.kind = 'footnote-cont';
    return i + 1;
  }
  if (isJsxSingle(r.raw)) {
    r.kind = 'jsx-only';
    return i + 1;
  }
  r.kind = 'prose';
  return multiLineConstruct(recs, i);
};

const bodyStep = (recs: readonly LineRec[], i: number, scan: BodyScan): number => {
  if (scan.fence) {
    return fenceStep(recs, i, scan);
  }
  if (scan.comment) {
    return commentStep(recs, i, scan);
  }
  return specialStep(recs, i, scan) ?? bodyKind(recs, i, scan);
};

const scanBody = (recs: readonly LineRec[], from: number): void => {
  const scan: BodyScan = { comment: false, fence: null, footnoteIndent: -1 };
  let i = from;
  while (i < recs.length) {
    i = bodyStep(recs, i, scan);
  }
};

export const classifyFile = (text: string): LineRec[] => {
  const { lines } = splitLines(text);
  const recs: LineRec[] = lines.map((raw, n) => ({
    indent: indentOf(raw),
    kind: null,
    n: n + 1,
    raw,
  }));
  scanBody(recs, scanFrontmatter(recs));
  return recs;
};

export const reflowText = (text: string, partial: Partial<ReflowOptions> = {}): ReflowResult => {
  const options: ReflowOptions = { ...DEFAULT_OPTIONS, ...partial };
  const { crlf, tail } = splitLines(text);
  const recs = classifyFile(text);
  const { lines, residuals } = reflowBlocks(recs, resolveBlocks(recs, options), options);
  const fm =
    options.band === true ? normalizeFrontmatter(lines, options) : { lines, residuals: [] };
  const output = joinLines(fm.lines, crlf, tail);
  return { changed: output !== text, output, residuals: [...residuals, ...fm.residuals] };
};

// Band mode also normalizes top-level frontmatter scalars; the representation
// rule, the normalizer, and the canonical frontmatter comparison live in
// utils/reflow-frontmatter.ts. Default mode never touches frontmatter, so the
// frozen repository corpus stays byte-identical.

// A wrapped quote item re-emits the quote marker on every continuation line
// at the same depth, so the count of leading `>` markers changes with the
// line count while the content does not. The transform never moves text in
// or out of a quote, so the comparison strips leading markers entirely.
const stripQuoteMarkers = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/^ {0,3}(?:>[ \t]?)+/, ''))
    .join('\n');

// The best wrap available for one block, or null for empty content. Only a
// feasible zero-cost wrap is an improvement the transform may apply.
const stuckExempt = (recs: readonly LineRec[], options: ReflowOptions): Set<number> => {
  const exempt = new Set<number>();
  for (const b of resolveBlocks(recs, options)) {
    if (b.violations.length === 0) {
      continue;
    }
    const wrap = bestWrap(b, options);
    if (!(wrap?.feasible === true && wrap.cost === 0)) {
      for (const v of b.violations) {
        exempt.add(v.line);
      }
    }
  }
  return exempt;
};

export const residualOverLimitLines = (after: string, options: ReflowOptions): number[] => {
  const recs = classifyFile(after);
  const exempt = stuckExempt(recs, options);
  const stuck: number[] = [];
  for (const r of recs) {
    if (r && cpLen(r.raw) > options.width && !isExemptKind(r.kind) && !exempt.has(r.n)) {
      stuck.push(r.n);
    }
  }
  return stuck;
};

// AGENTS.md section 7 formatting-only proof step 1: "Normalize whitespace and
// compare the text: the sequence of non-whitespace characters must be
// identical per file." `&nbsp;` normalizes to a space because the wrap keeps
// it as the rendered form of the preceding space. Frontmatter is compared
// semantically instead: band mode may re-represent a scalar (quoted to plain,
// plain or quoted to a folded block) without changing any resolved value.
const verifyBodyInvariants = (before: string, after: string): string[] => {
  const failures: string[] = [];
  const lhs = stripQuoteMarkers(before);
  const rhs = stripQuoteMarkers(after);
  if (nonWhitespace(normalizeText(lhs)) !== nonWhitespace(normalizeText(rhs))) {
    failures.push('whitespace-normalized text changed');
  }
  if (
    JSON.stringify(tokenize(normalizeText(lhs)).atoms)
    !== JSON.stringify(tokenize(normalizeText(rhs)).atoms)
  ) {
    failures.push('ordered atom list changed');
  }
  if (JSON.stringify(extractLinkTargets(before)) !== JSON.stringify(extractLinkTargets(after))) {
    failures.push('link-target multiset changed');
  }
  return failures;
};

export const verifyInvariants = (before: string, after: string): string[] => {
  const lhs = splitFrontmatter(before);
  const rhs = splitFrontmatter(after);
  if (lhs === null || rhs === null) {
    return verifyBodyInvariants(before, after);
  }
  const failures: string[] = [];
  if (JSON.stringify(fmEntries(lhs.fm)) !== JSON.stringify(fmEntries(rhs.fm))) {
    failures.push('frontmatter resolved scalars changed');
  }
  failures.push(...verifyBodyInvariants(lhs.rest, rhs.rest));
  return failures;
};
