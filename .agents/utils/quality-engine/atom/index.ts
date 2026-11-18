import { createHash } from 'node:crypto';

import { type OkfMetadata, parseOkfConcept } from '../../okf.js';

export interface Atom {
  readonly behavioral: boolean;
  readonly harmful: number;
  readonly helpful: number;
  readonly id: string;
  readonly placements: readonly { readonly headingPath: readonly string[] }[];
  readonly precedence: number;
  readonly probeIds: readonly string[];
  readonly status: 'active' | 'retired';
  readonly tags: readonly string[];
  readonly textSha256: string;
}

export interface AtomCheckInput {
  readonly activeProbeIds: readonly string[];
  readonly map: AtomMap;
  readonly policy: AtomCheckPolicy;
  readonly recordedRetirements: ReadonlySet<string>;
  readonly source: string;
}

export interface AtomCheckPolicy {
  readonly duplicateReportOnly: boolean;
  readonly duplicateSimilarity: number;
  readonly maxDocumentChars: number;
}

export interface AtomFinding {
  readonly atomId?: string;
  readonly detail: string;
  readonly kind:
    | 'anchor-drift'
    | 'duplicate-text'
    | 'near-duplicate'
    | 'orphan-atom'
    | 'orphan-probe'
    | 'size-budget'
    | 'unrecorded-retirement';
  readonly probeId?: string;
  readonly severity: 'error' | 'report';
  readonly source: string;
}

export interface AtomMap {
  readonly atoms: readonly Atom[];
  readonly sensitivity: readonly Sensitivity[];
  readonly source: string;
}

interface Draft {
  readonly lines: string[];
  readonly path: readonly string[];
}

interface Heading {
  readonly level: number;
  readonly title: string;
}

interface ParseState {
  readonly blocks: SourceBlock[];
  current?: Draft;
  inFence: boolean;
  inFront: boolean;
  readonly stack: Heading[];
}

export interface Sensitivity {
  readonly mutantsFlipped: number;
  readonly mutantsTried: number;
  readonly probeId: string;
}

export interface SourceBlock {
  readonly headingPath: readonly string[];
  readonly text: string;
}

export const ATOM_SCHEMA_VERSION = 1;

const atomKeys = [
  'behavioral',
  'harmful',
  'helpful',
  'id',
  'placements',
  'precedence',
  'probeIds',
  'status',
  'tags',
  'textSha256',
];

const mapKeys = [
  'atoms',
  'description',
  'schemaVersion',
  'sensitivity',
  'source',
  'tags',
  'title',
  'type',
];

const sensitivityKeys = ['mutantsFlipped', 'mutantsTried', 'probeId'];

const sha256Pattern = /^[0-9a-f]{64}$/u;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);

const hasUniqueValues = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const assertMapShape = (metadata: OkfMetadata): void => {
  if (!Object.keys(metadata).every((key) => mapKeys.includes(key))) {
    throw new Error('Atom map has an unknown field.');
  }
  if (metadata.type !== 'atom-map') {
    throw new Error('Atom map type must be atom-map.');
  }
  if (metadata.schemaVersion !== ATOM_SCHEMA_VERSION) {
    throw new Error(`Atom map schemaVersion must be ${ATOM_SCHEMA_VERSION}.`);
  }
  if (!isNonBlank(metadata.source)) {
    throw new Error('Atom map source is required.');
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isSensitivity = (value: unknown): value is Sensitivity =>
  isRecord(value)
  && hasExactKeys(value, sensitivityKeys)
  && isNonBlank(value.probeId)
  && isCount(value.mutantsTried)
  && isCount(value.mutantsFlipped)
  && value.mutantsFlipped <= value.mutantsTried;

const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isNonBlank);

const isPlacements = (value: unknown): value is Atom['placements'] =>
  Array.isArray(value)
  && value.length > 0
  && value.every(
    (entry) =>
      isRecord(entry)
      && hasExactKeys(entry, ['headingPath'])
      && isStringList(entry.headingPath)
      && entry.headingPath.length > 0,
  );

const isAtom = (value: unknown): value is Atom =>
  isRecord(value)
  && hasExactKeys(value, atomKeys)
  && isNonBlank(value.id)
  && isPlacements(value.placements)
  && typeof value.textSha256 === 'string'
  && sha256Pattern.test(value.textSha256)
  && isStringList(value.tags)
  && isCount(value.precedence)
  && isStringList(value.probeIds)
  && typeof value.behavioral === 'boolean'
  && (value.status === 'active' || value.status === 'retired')
  && isCount(value.helpful)
  && isCount(value.harmful);

export const parseAtomMap = (content: string): AtomMap => {
  const metadata = parseOkfConcept(content);
  assertMapShape(metadata);
  const atoms = metadata.atoms;
  if (!Array.isArray(atoms) || !atoms.every(isAtom)) {
    throw new Error('Atom map atoms must be a list of complete atom records.');
  }
  if (!hasUniqueValues(atoms.map((atom) => atom.id))) {
    throw new Error('Atom map has a duplicate atom id.');
  }
  const sensitivity = metadata.sensitivity ?? [];
  if (!Array.isArray(sensitivity) || !sensitivity.every(isSensitivity)) {
    throw new Error('Atom map sensitivity must be a list of complete sensitivity records.');
  }
  if (!hasUniqueValues(sensitivity.map((entry) => entry.probeId))) {
    throw new Error('Atom map has a duplicate sensitivity probe id.');
  }
  return { atoms, sensitivity, source: metadata.source as string };
};

const headingPattern = /^(#{1,6})\s+(.*)$/u;
const listItemPattern = /^ {0,3}([-*+]|\d+[.)])\s/u;
const shingleSize = 3;

const activeAtomsOf = (map: AtomMap): readonly Atom[] =>
  map.atoms.filter((atom) => atom.status === 'active');

const atomFinding = (
  input: AtomCheckInput,
  kind: AtomFinding['kind'],
  detail: string,
  extra: Pick<AtomFinding, 'atomId' | 'probeId'> = {},
): AtomFinding => ({ ...extra, detail, kind, severity: 'error', source: input.map.source });

const flushDraft = (state: ParseState): void => {
  if (state.current !== undefined && state.current.lines.length > 0) {
    state.blocks.push({
      headingPath: state.current.path,
      text: state.current.lines.join('\n'),
    });
  }
  state.current = undefined;
};

const headingPathOf = (state: ParseState): readonly string[] =>
  state.stack.length > 0 ? state.stack.map((entry) => entry.title) : ['(preamble)'];

const addLine = (state: ParseState, line: string): void => {
  if (state.current === undefined) {
    state.current = { lines: [line], path: headingPathOf(state) };
    return;
  }
  state.current.lines.push(line);
};

const headingLine = (state: ParseState, level: number, title: string): void => {
  flushDraft(state);
  while (state.stack.length > 0 && (state.stack.at(-1)?.level ?? 0) >= level) {
    state.stack.pop();
  }
  state.stack.push({ level, title: title.trim() });
  state.blocks.push({ headingPath: headingPathOf(state), text: `${'#'.repeat(level)} ${title}` });
};

const isAtomicBlock = (block: SourceBlock): boolean =>
  block.headingPath[0] === 'frontmatter'
  || block.text.startsWith('```')
  || block.text.startsWith('|')
  || block.text.startsWith('#');

export const normalizeText = (text: string): string => text.replace(/\s+/gu, ' ').trim();

const orphanFindings = (input: AtomCheckInput): readonly AtomFinding[] => {
  const known = new Set(input.activeProbeIds);
  const linked = new Set(activeAtomsOf(input.map).flatMap((atom) => atom.probeIds));
  const atoms = activeAtomsOf(input.map)
    .filter((atom) => !atom.probeIds.some((id) => known.has(id)))
    .map((atom) =>
      atomFinding(input, 'orphan-atom', 'No active probe covers this atom.', { atomId: atom.id }),
    );
  const probes = input.activeProbeIds
    .filter((id) => !linked.has(id))
    .map((id) =>
      atomFinding(input, 'orphan-probe', 'No active atom links this probe.', { probeId: id }),
    );
  return [...atoms, ...probes];
};

export const parseAtomCheckPolicy = (value: unknown): AtomCheckPolicy => {
  if (!isRecord(value)) {
    throw new Error('Atom check policy must be an object.');
  }
  const { duplicateReportOnly, duplicateSimilarity, maxDocumentChars } = value;
  if (
    typeof duplicateReportOnly !== 'boolean'
    || typeof duplicateSimilarity !== 'number'
    || !(duplicateSimilarity > 0 && duplicateSimilarity <= 1)
    || !Number.isSafeInteger(maxDocumentChars)
    || (maxDocumentChars as number) <= 0
  ) {
    throw new Error('Atom check policy fields are missing or out of range.');
  }
  return { duplicateReportOnly, duplicateSimilarity, maxDocumentChars: maxDocumentChars as number };
};

const pathKey = (path: readonly string[]): string => path.join('\n');

const retirementFindings = (input: AtomCheckInput): readonly AtomFinding[] =>
  input.map.atoms
    .filter((atom) => atom.status === 'retired' && !input.recordedRetirements.has(atom.id))
    .map((atom) =>
      atomFinding(input, 'unrecorded-retirement', 'A retired atom has no retirement record.', {
        atomId: atom.id,
      }),
    );

const sentencesOf = (text: string): readonly string[] =>
  normalizeText(text).split(/(?<=[.!?])\s+/u);

export const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

const placementsResolve = (atom: Atom, blocks: readonly SourceBlock[]): boolean => {
  const found = blocks
    .filter((block) => sha256Hex(normalizeText(block.text)) === atom.textSha256)
    .map((block) => pathKey(block.headingPath))
    .sort();
  const recorded = atom.placements.map((placement) => pathKey(placement.headingPath)).sort();
  return found.length === recorded.length && found.every((key, index) => key === recorded[index]);
};

const shinglesOf = (text: string): ReadonlySet<string> => {
  const words = normalizeText(text).toLowerCase().split(' ');
  const shingles = new Set<string>();
  for (let index = 0; index + shingleSize <= words.length; index += 1) {
    shingles.add(words.slice(index, index + shingleSize).join(' '));
  }
  return shingles;
};

export const shingleSimilarity = (left: string, right: string): number => {
  const a = shinglesOf(left);
  const b = shinglesOf(right);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const shingle of a) {
    shared += b.has(shingle) ? 1 : 0;
  }
  return shared / (a.size + b.size - shared);
};

const sizeFindings = (input: AtomCheckInput): readonly AtomFinding[] => {
  const size = normalizeText(input.source).length;
  return size > input.policy.maxDocumentChars
    ? [
        atomFinding(
          input,
          'size-budget',
          `Source is ${size} characters, over the ${input.policy.maxDocumentChars} budget.`,
        ),
      ]
    : [];
};

const startDraft = (state: ParseState, path: readonly string[], line: string): void => {
  flushDraft(state);
  state.current = { lines: [line], path };
};

const bodyLine = (state: ParseState, line: string): void => {
  if (line.trim() === '') {
    flushDraft(state);
  } else if (line.startsWith('|')) {
    flushDraft(state);
    state.blocks.push({ headingPath: headingPathOf(state), text: line });
  } else if (listItemPattern.test(line)) {
    startDraft(state, headingPathOf(state), line);
  } else {
    addLine(state, line);
  }
};

const fenceLine = (state: ParseState, line: string): void => {
  if (!state.inFence) {
    startDraft(state, headingPathOf(state), line);
    state.inFence = true;
    return;
  }
  addLine(state, line);
  if (line.startsWith('```')) {
    flushDraft(state);
    state.inFence = false;
  }
};

const frontmatterLine = (state: ParseState, line: string): void => {
  if (line === '---') {
    flushDraft(state);
    state.inFront = false;
    return;
  }
  if (/^\S/u.test(line) && !line.startsWith('- ')) {
    startDraft(state, ['frontmatter'], line);
    return;
  }
  if (state.current === undefined) {
    startDraft(state, ['frontmatter'], line);
    return;
  }
  state.current.lines.push(line);
};

const stepLine = (state: ParseState, line: string, index: number): void => {
  const heading = headingPattern.exec(line);
  if (index === 0 && line === '---') {
    state.inFront = true;
  } else if (state.inFront) {
    frontmatterLine(state, line);
  } else if (state.inFence || line.startsWith('```')) {
    fenceLine(state, line);
  } else if (heading?.[1] !== undefined) {
    headingLine(state, heading[1].length, heading[2] ?? '');
  } else {
    bodyLine(state, line);
  }
};

export const sourceBlocks = (source: string): readonly SourceBlock[] => {
  const state: ParseState = { blocks: [], inFence: false, inFront: false, stack: [] };
  source.split('\n').forEach((line, index) => {
    stepLine(state, line, index);
  });
  flushDraft(state);
  return state.blocks;
};

export const sourceUnits = (source: string): readonly SourceBlock[] =>
  sourceBlocks(source).flatMap((block) =>
    isAtomicBlock(block)
      ? [block]
      : sentencesOf(block.text).map((text) => ({ headingPath: block.headingPath, text })),
  );

const driftFindings = (input: AtomCheckInput): readonly AtomFinding[] => {
  const blocks = sourceUnits(input.source);
  return activeAtomsOf(input.map)
    .filter((atom) => !placementsResolve(atom, blocks))
    .map((atom) =>
      atomFinding(input, 'anchor-drift', 'The recorded placements no longer match the source.', {
        atomId: atom.id,
      }),
    );
};

const duplicateFindings = (input: AtomCheckInput): readonly AtomFinding[] => {
  const blocks = sourceUnits(input.source);
  const texts = activeAtomsOf(input.map).map((atom) => ({
    atom,
    text:
      blocks.find((block) => sha256Hex(normalizeText(block.text)) === atom.textSha256)?.text ?? '',
  }));
  const severity = input.policy.duplicateReportOnly ? 'report' : 'error';
  return texts.flatMap((entry, index) =>
    texts
      .slice(index + 1)
      .map((other) => ({ other, score: shingleSimilarity(entry.text, other.text) }))
      .filter(({ score }) => score >= input.policy.duplicateSimilarity)
      .map(({ other, score }) => ({
        ...atomFinding(
          input,
          'near-duplicate',
          `Similar to ${other.atom.id} (${score.toFixed(2)}).`,
          {
            atomId: entry.atom.id,
          },
        ),
        severity,
      })),
  );
};

const minDuplicateChars = 30;

const duplicateTextFindings = (input: AtomCheckInput): readonly AtomFinding[] => {
  const groups = new Map<string, string[]>();
  for (const block of sourceUnits(input.source)) {
    const text = normalizeText(block.text);
    if (text.length >= minDuplicateChars && !text.startsWith('#')) {
      groups.set(text, [...(groups.get(text) ?? []), block.headingPath.join(' > ')]);
    }
  }
  return [...groups.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([text, paths]) => ({
      ...atomFinding(
        input,
        'duplicate-text',
        `Identical text at ${paths.length} placements (${paths.join(' | ')}): ${text.slice(0, 60)}`,
      ),
      severity: 'report' as const,
    }));
};

export const checkAtoms = (input: AtomCheckInput): readonly AtomFinding[] => [
  ...orphanFindings(input),
  ...driftFindings(input),
  ...retirementFindings(input),
  ...sizeFindings(input),
  ...duplicateFindings(input),
  ...duplicateTextFindings(input),
];
