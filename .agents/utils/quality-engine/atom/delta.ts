import { type AtomMap, normalizeText, sha256Hex, sourceUnits } from './index.js';

export type AddOp = { readonly after: AtomRef; readonly op: 'add'; readonly text: string };

interface Applied {
  readonly added?: string;
  readonly edits: readonly Edit[];
  readonly removed?: Span;
  readonly retired?: { readonly atomId: string; readonly reason: string };
  readonly touched: readonly Span[];
}

export interface AtomRef {
  readonly atomId: string;
  readonly headingPath: readonly string[];
}

export interface Delta {
  readonly document: string;
  readonly ops: readonly DeltaOp[];
}

export type DeltaOp = AddOp | ModifyOp | MoveOp | RetireOp | TagOp;

interface Edit {
  readonly end: number;
  readonly replacement: string;
  readonly start: number;
}

interface Gathered {
  readonly added: string[];
  readonly edits: Edit[];
  readonly removed: Set<Span>;
  readonly retired: { atomId: string; reason: string }[];
  readonly spans: readonly Span[];
  readonly tags: { atomId: string; counter: 'harmful' | 'helpful' }[];
  readonly touched: Span[];
}

export interface MergeResult {
  readonly added: readonly string[];
  readonly retired: readonly { readonly atomId: string; readonly reason: string }[];
  readonly tags: readonly { readonly atomId: string; readonly counter: 'harmful' | 'helpful' }[];
  readonly text: string;
}

export type ModifyOp = {
  readonly atom: AtomRef;
  readonly op: 'modify';
  readonly reason: string;
  readonly text: string;
};

export type MoveOp = { readonly after: AtomRef; readonly atom: AtomRef; readonly op: 'move' };

export type RetireOp = { readonly atom: AtomRef; readonly op: 'retire'; readonly reason: string };

interface Span {
  readonly end: number;
  readonly headingPath: readonly string[];
  readonly id: string;
  readonly start: number;
  readonly text: string;
}

export type TagOp = {
  readonly atomId: string;
  readonly counter: 'harmful' | 'helpful';
  readonly op: 'tag';
};

export const MAX_DELTA_OPS = 40;

const MIN_REASON_CHARS = 20;

const applyEdits = (source: string, edits: readonly Edit[]): string => {
  const ordered = [...edits].sort(
    (left, right) => right.start - left.start || right.end - left.end,
  );
  return ordered.reduce(
    (text, edit) => `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`,
    source,
  );
};

export const atomIdOf = (text: string): string =>
  `r-${sha256Hex(normalizeText(text)).slice(0, 10)}`;

const checkReason = (reason: string): void => {
  if (reason.trim().length < MIN_REASON_CHARS) {
    throw new Error(
      `A modify or retire op needs a reason of at least ${MIN_REASON_CHARS} characters.`,
    );
  }
};

const checkText = (text: string): void => {
  if (text.trim() === '' || text !== text.trim()) {
    throw new Error('Delta text must be nonblank with no leading or trailing whitespace.');
  }
};

const escapePattern = (token: string): string => token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const expectedUnits = (
  spans: readonly Span[],
  removed: ReadonlySet<Span>,
  inserted: readonly string[],
): readonly string[] =>
  [
    ...spans.filter((span) => !removed.has(span)).map((span) => span.text),
    ...inserted.flatMap((text) => sourceUnits(text).map((unit) => normalizeText(unit.text))),
  ].sort();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const lineBreakEnd = (source: string, start: number, newline: number): number => {
  const next = newline + 1;
  const blankBefore = start === 0 || source.slice(start - 2, start) === '\n\n';
  return blankBefore && source[next] === '\n' ? next + 1 : next;
};

// Locates every source unit in the raw text, in order, so an edit can touch its exact characters.
export const locateUnits = (
  source: string,
  unitsOf: (
    text: string,
  ) => readonly { text: string; headingPath: readonly string[] }[] = sourceUnits,
): readonly Span[] => {
  const spans: Span[] = [];
  let cursor = 0;
  for (const unit of unitsOf(source)) {
    const tokens = unit.text.split(/\s+/u).filter((token) => token !== '');
    const pattern = new RegExp(tokens.map(escapePattern).join('\\s+'), 'gu');
    pattern.lastIndex = cursor;
    const found = pattern.exec(source);
    if (found === null) {
      throw new Error(`Unit could not be located in the source: ${unit.text.slice(0, 60)}`);
    }
    const end = found.index + found[0].length;
    spans.push({
      end,
      headingPath: unit.headingPath,
      id: atomIdOf(unit.text),
      start: found.index,
      text: normalizeText(unit.text),
    });
    cursor = end;
  }
  return spans;
};

const pathKey = (path: readonly string[]): string => path.join(' > ');

const refOf = (value: unknown): AtomRef => {
  if (
    !isRecord(value)
    || typeof value.atomId !== 'string'
    || !Array.isArray(value.headingPath)
    || !value.headingPath.every((part) => typeof part === 'string')
  ) {
    throw new Error('An atom reference needs atomId and headingPath.');
  }
  return { atomId: value.atomId, headingPath: value.headingPath as string[] };
};

const rejectSharedSpans = (spans: readonly Span[]): void => {
  if (new Set(spans).size !== spans.length) {
    throw new Error('Two ops name the same atom span.');
  }
};

const resolveRef = (spans: readonly Span[], map: AtomMap, ref: AtomRef): Span => {
  const atom = map.atoms.find((entry) => entry.id === ref.atomId);
  if (atom?.status !== 'active') {
    throw new Error(`Anchor drift: ${ref.atomId} is not an active atom.`);
  }
  const hits = spans.filter(
    (span) => span.id === ref.atomId && pathKey(span.headingPath) === pathKey(ref.headingPath),
  );
  if (hits.length !== 1) {
    throw new Error(`Anchor drift: ${ref.atomId} matches ${hits.length} spans at its placement.`);
  }
  return hits[0] as Span;
};

const modifyOp = (spans: readonly Span[], map: AtomMap, op: ModifyOp): Applied => {
  checkText(op.text);
  checkReason(op.reason);
  const target = resolveRef(spans, map, op.atom);
  return {
    added: op.text,
    edits: [{ end: target.end, replacement: op.text, start: target.start }],
    removed: target,
    retired: { atomId: op.atom.atomId, reason: op.reason },
    touched: [target],
  };
};

const skipBlanks = (source: string, from: number): number => {
  let end = from;
  while (source[end] === ' ' || source[end] === '\t') {
    end += 1;
  }
  return end;
};

const removeSpan = (source: string, span: Span): Edit => {
  const end = skipBlanks(source, span.end);
  const atLineStart = span.start === 0 || source[span.start - 1] === '\n';
  if (atLineStart && source[end] === '\n') {
    return { end: lineBreakEnd(source, span.start, end), replacement: '', start: span.start };
  }
  const trailing = source[end] === '\n' || end >= source.length;
  const start = source[span.start - 1] === ' ' && trailing ? span.start - 1 : span.start;
  return { end, replacement: '', start };
};

const retireOp = (source: string, spans: readonly Span[], map: AtomMap, op: RetireOp): Applied => {
  checkReason(op.reason);
  const target = resolveRef(spans, map, op.atom);
  return {
    edits: [removeSpan(source, target)],
    removed: target,
    retired: { atomId: op.atom.atomId, reason: op.reason },
    touched: [target],
  };
};

const startsLine = (text: string): boolean => /^(?:[-*+]\s|\d+[.)]\s|```|\|)/u.test(text);

const insertAfter = (span: Span, text: string): Edit => {
  const separator = startsLine(text) || startsLine(span.text) ? '\n' : ' ';
  return { end: span.end, replacement: `${separator}${text}`, start: span.end };
};

const addOp = (spans: readonly Span[], map: AtomMap, op: AddOp): Applied => {
  checkText(op.text);
  const after = resolveRef(spans, map, op.after);
  return { added: op.text, edits: [insertAfter(after, op.text)], touched: [after] };
};

const moveOp = (source: string, spans: readonly Span[], map: AtomMap, op: MoveOp): Applied => {
  const target = resolveRef(spans, map, op.atom);
  const after = resolveRef(spans, map, op.after);
  return {
    added: target.text,
    edits: [removeSpan(source, target), insertAfter(after, target.text)],
    removed: target,
    touched: [target, after],
  };
};

const applyOp = (
  source: string,
  spans: readonly Span[],
  map: AtomMap,
  op: Exclude<DeltaOp, TagOp>,
): Applied => {
  if (op.op === 'add') {
    return addOp(spans, map, op);
  }
  if (op.op === 'modify') {
    return modifyOp(spans, map, op);
  }
  return op.op === 'retire' ? retireOp(source, spans, map, op) : moveOp(source, spans, map, op);
};

const gather = (source: string, map: AtomMap, ops: readonly DeltaOp[]): Gathered => {
  const spans = locateUnits(source);
  const out: Gathered = {
    added: [],
    edits: [],
    removed: new Set(),
    retired: [],
    spans,
    tags: [],
    touched: [],
  };
  for (const op of ops) {
    if (op.op === 'tag') {
      out.tags.push({ atomId: op.atomId, counter: op.counter });
      continue;
    }
    const applied = applyOp(source, spans, map, op);
    out.edits.push(...applied.edits);
    out.touched.push(...applied.touched);
    if (applied.added !== undefined) {
      out.added.push(applied.added);
    }
    if (applied.removed !== undefined) {
      out.removed.add(applied.removed);
    }
    if (applied.retired !== undefined) {
      out.retired.push(applied.retired);
    }
  }
  return out;
};

const textOf = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`Delta op field ${field} must be a string.`);
  }
  return value;
};

const opOf = (value: unknown): DeltaOp => {
  if (!isRecord(value)) {
    throw new Error('A delta op must be an object.');
  }
  switch (value.op) {
    case 'add':
      return { after: refOf(value.after), op: 'add', text: textOf(value.text, 'text') };
    case 'modify':
      return {
        atom: refOf(value.atom),
        op: 'modify',
        reason: textOf(value.reason, 'reason'),
        text: textOf(value.text, 'text'),
      };
    case 'move':
      return { after: refOf(value.after), atom: refOf(value.atom), op: 'move' };
    case 'retire':
      return { atom: refOf(value.atom), op: 'retire', reason: textOf(value.reason, 'reason') };
    case 'tag':
      if (value.counter !== 'helpful' && value.counter !== 'harmful') {
        throw new Error('A tag op counter must be helpful or harmful.');
      }
      return { atomId: textOf(value.atomId, 'atomId'), counter: value.counter, op: 'tag' };
    default:
      throw new Error('A delta op must be add, modify, move, retire, or tag.');
  }
};

export const parseDelta = (value: unknown): Delta => {
  if (!isRecord(value) || typeof value.document !== 'string' || !Array.isArray(value.ops)) {
    throw new Error('A delta needs a document path and an ops array.');
  }
  return { document: value.document, ops: value.ops.map(opOf) };
};

export const verifyUnits = (
  merged: string,
  spans: readonly Span[],
  removed: ReadonlySet<Span>,
  inserted: readonly string[],
): void => {
  const actual = sourceUnits(merged)
    .map((unit) => normalizeText(unit.text))
    .sort();
  const expected = expectedUnits(spans, removed, inserted);
  if (actual.length !== expected.length || actual.some((text, index) => text !== expected[index])) {
    throw new Error('The merge changed text outside the named atom spans.');
  }
};

// Applies ops to the raw text by anchor with no model call. Any drift, shared span, or change
// outside a named span rejects the whole delta.
export const mergeDelta = (source: string, map: AtomMap, ops: readonly DeltaOp[]): MergeResult => {
  if (ops.length === 0 || ops.length > MAX_DELTA_OPS) {
    throw new Error(`A delta carries 1 to ${MAX_DELTA_OPS} ops.`);
  }
  const gathered = gather(source, map, ops);
  rejectSharedSpans(gathered.touched);
  const text = applyEdits(source, gathered.edits);
  verifyUnits(text, gathered.spans, gathered.removed, gathered.added);
  return {
    added: gathered.added.map(atomIdOf),
    retired: gathered.retired,
    tags: gathered.tags,
    text,
  };
};
