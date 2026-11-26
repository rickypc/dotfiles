import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { env } from 'node:process';

import { nodeFileSystem } from '../../utils/filesystem.js';
import { casesForAtoms, ruleRangesOf } from '../../utils/quality-engine/atom/behavior.js';
import {
  type BuildReport,
  rebuildAtomMaps,
  renderAtomMap,
} from '../../utils/quality-engine/atom/build.js';
import {
  type Delta,
  type DeltaOp,
  mergeDelta,
  parseDelta,
} from '../../utils/quality-engine/atom/delta.js';
import {
  type AtomMap,
  normalizeText,
  parseAtomMap,
} from '../../utils/quality-engine/atom/index.js';
import { parseSealLines, unsealedCases } from '../../utils/quality-engine/behavior/seal.js';
import type { ProbeVectorCandidate } from '../../utils/quality-engine/candidate-frontier.js';
import { decideBatch } from '../../utils/quality-engine/controller.js';
import { reflowText } from '../../utils/reflow/file.js';
import {
  type BatchCandidateResult,
  type BatchMeasurement,
  type BatchResult,
  MAX_BATCH_CANDIDATES,
} from '../instruction-gate/batch.js';
import { defaultDependencies, evaluateBatchText, targetOf } from '../instruction-gate/index.js';
import {
  type Intent,
  type IntentResult,
  isIntent,
  MAX_INTENTS,
} from '../instruction-gate/intent.js';
import { atomMapPathOf, coreOf, policyProblems } from '../instruction-gate/policy.js';

export interface BatchManifest {
  readonly atomMapSha256: string;
  readonly baselineSha256: string;
  readonly batchId: string;
  readonly candidates: readonly { readonly candidateSha256: string; readonly id: string }[];
  readonly document: string;
  readonly round: number;
  readonly setSha256: string;
}

interface Bound {
  readonly atomMapSha256: string;
  readonly baselineSha256: string;
  readonly candidateSha256: string;
  readonly setSha256: string;
}

interface Candidate {
  readonly delta: Delta;
  readonly expectedBehavior: string;
  readonly id: string;
  readonly intents: readonly Intent[];
}

interface CandidateVerdict {
  readonly atoms: readonly {
    readonly atomId: string;
    readonly probes: readonly { readonly id: string; readonly passed: boolean }[];
  }[];
  readonly diagnoses: readonly {
    readonly expected: string;
    readonly given: string;
    readonly id: string;
    readonly suggestion?: string;
  }[];
  readonly expectedBehavior: string;
  readonly id: string;
  readonly intents: readonly IntentResult[];
  readonly intentsProven: boolean;
  readonly problems: readonly string[];
  readonly structural: readonly string[];
  readonly swapped: boolean;
  readonly trainGained: readonly string[];
  readonly validationPassed: number;
}

export interface CheckReport {
  readonly batchId: string;
  readonly candidates: readonly CandidateVerdict[];
  readonly nextStep: 'repair' | 'select' | 'stop';
  readonly round: number;
  readonly selected: string | null;
  readonly stopReason: string;
}

export interface CommitReport {
  readonly document: string;
  readonly receipt: string;
  readonly retirementRows: number;
  readonly unresolvedProbes: readonly string[];
}

interface Evaluated {
  readonly baseline: BatchMeasurement | undefined;
  readonly rows: readonly BatchCandidateResult[];
}

interface Inputs {
  readonly atomMapSha256: string;
  readonly baselineSha256: string;
  readonly map: AtomMap;
  readonly setSha256: string;
  readonly text: string;
}

interface Invocation {
  readonly argument: string;
  readonly command: string;
  readonly root: string;
  readonly swapReason: string | undefined;
}

export interface LibrarianDeps {
  readonly agentsRoot: string;
  readonly evaluate: (requestText: string) => Promise<BatchResult<unknown>>;
  readonly readText: (file: string) => Promise<string | undefined>;
  readonly rebuild: (ownerId: string) => Promise<BuildReport>;
  readonly reflow: (text: string) => string;
  readonly sha256: (text: string) => string;
  readonly storeRoot: string;
  readonly targetOf: (document: string) => {
    readonly receiptPath: string;
    readonly setPath: string;
  };
  readonly writeText: (file: string, content: string) => Promise<void>;
}

export interface ProposeReport {
  readonly baselineSha256: string;
  readonly batchId: string;
  readonly candidates: readonly {
    readonly candidateSha256: string;
    readonly changedAtoms: number;
    readonly id: string;
    readonly snapshot: string;
    readonly tokenDelta: number;
  }[];
  readonly document: string;
  readonly round: number;
  readonly setSha256: string;
}

export interface Snapshot {
  readonly added: readonly string[];
  readonly candidateSha256: string;
  readonly changedAtoms: number;
  readonly delta: Delta;
  readonly expectedBehavior: string;
  readonly id: string;
  readonly intents: readonly Intent[];
  readonly retired: readonly { readonly atomId: string; readonly reason: string }[];
  readonly text: string;
  readonly tokenDelta: number;
  readonly touched: readonly string[];
}

interface Verdict {
  readonly batchId: string;
  readonly bound: Bound | null;
  readonly harmful: readonly string[];
  readonly selected: string | null;
  readonly stopReason: string;
  readonly swapReason?: string;
}

export const MAX_ROUNDS = 3;

const BASELINE_ID = 'baseline';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/u;

const appendRound = async (
  deps: LibrarianDeps,
  row: {
    readonly batchId: string;
    readonly baselineSha256: string;
    readonly document: string;
    readonly setSha256: string;
  },
): Promise<void> => {
  const file = path.join(deps.storeRoot, 'rounds.jsonl');
  const existing = (await deps.readText(file)) ?? '';
  await deps.writeText(file, `${existing}${JSON.stringify(row)}\n`);
};

const applyCounters = async (
  deps: LibrarianDeps,
  mapPath: string,
  helpful: readonly string[],
  harmful: readonly string[],
): Promise<void> => {
  const text = await deps.readText(mapPath);
  if (text === undefined) {
    return;
  }
  const map = parseAtomMap(text);
  const bump = (id: string, counter: 'harmful' | 'helpful') =>
    (counter === 'helpful' ? helpful : harmful).filter((entry) => entry === id).length;
  const atoms = map.atoms.map((atom) => ({
    ...atom,
    harmful: atom.harmful + bump(atom.id, 'harmful'),
    helpful: atom.helpful + bump(atom.id, 'helpful'),
  }));
  await deps.writeText(mapPath, renderAtomMap({ ...map, atoms }));
};

const assertCurrent = (manifest: BatchManifest, inputs: Inputs): void => {
  if (
    inputs.baselineSha256 !== manifest.baselineSha256
    || inputs.atomMapSha256 !== manifest.atomMapSha256
    || inputs.setSha256 !== manifest.setSha256
  ) {
    throw new Error('Stale batch: the document, atom map, or probe set changed since propose.');
  }
};

export const defaultLibrarianDeps = (agentsRoot: string): LibrarianDeps => {
  const gate = defaultDependencies(agentsRoot);
  return {
    agentsRoot,
    evaluate: (requestText) => evaluateBatchText(requestText, gate),
    readText: gate.readText,
    rebuild: (ownerId) => rebuildAtomMaps(nodeFileSystem, agentsRoot, { ownerId, write: true }),
    reflow: (text) => reflowText(text, { band: true }).output,
    sha256: gate.sha256,
    storeRoot: env.INSTRUCTION_LIBRARIAN_STORE ?? path.join(tmpdir(), 'instruction-librarian'),
    targetOf: (document) => targetOf(document, gate),
    writeText: async (file, content) => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, 'utf8');
    },
  };
};

const descriptionOf = (text: string): string => {
  const front = /^---\n([\s\S]*?)\n---/u.exec(text)?.[1] ?? '';
  const found = /^description:[ \t]*([\s\S]*?)(?=\n[A-Za-z_-]+:|$)/mu.exec(front);
  return normalizeText(found?.[1] ?? '');
};

const harmfulOf = (
  snapshots: readonly Snapshot[],
  verdicts: readonly CandidateVerdict[],
): readonly string[] => [
  ...new Set(
    snapshots
      .filter((snapshot) =>
        verdicts.some(
          ({ id, problems }) => id === snapshot.id && problems.some((p) => p.startsWith('Core ')),
        ),
      )
      .flatMap(({ touched }) => touched),
  ),
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const baselineOf = async (
  deps: LibrarianDeps,
  receiptPath: string,
): Promise<{ readonly trainPassed: readonly string[]; readonly validationPassed: number }> => {
  const text = await deps.readText(path.join(deps.agentsRoot, receiptPath));
  const value: unknown = text === undefined ? undefined : JSON.parse(text);
  const measurement = isRecord(value) ? value.measurement : undefined;
  if (
    !isRecord(measurement)
    || !Array.isArray(measurement.trainPassed)
    || typeof measurement.validationPassed !== 'number'
  ) {
    throw new Error('The document has no accepted receipt to compare against.');
  }
  return {
    trainPassed: measurement.trainPassed as string[],
    validationPassed: measurement.validationPassed,
  };
};

export const librarianUsage = (): string =>
  [
    'Usage:',
    '  bun <agents-root>/scripts/skill-manager/index.ts propose <absolute-agents-root> <absolute-proposal-json>',
    '  bun <agents-root>/scripts/skill-manager/index.ts check <absolute-agents-root> <batch-id> [--allow-swap <reason>]',
    '  bun <agents-root>/scripts/skill-manager/index.ts commit <absolute-agents-root> <batch-id>',
  ].join('\n');

const invocationOf = (args: readonly string[]): Invocation => {
  const [command, root, argument, ...extra] = args;
  const swapReason = command === 'check' && extra[0] === '--allow-swap' ? extra[1] : undefined;
  const extras = swapReason === undefined ? extra : extra.slice(2);
  if (!root?.startsWith('/') || !argument || extras.length > 0) {
    throw new Error(librarianUsage());
  }
  return { argument, command: command ?? '', root, swapReason };
};

const ownerIdOf = (document: string): string => {
  const skill = /^skills\/([^/]+)\//u.exec(document)?.[1];
  return skill === undefined ? 'root' : `skill:${skill}`;
};

const parseCandidate = (value: unknown): Candidate => {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !ID_PATTERN.test(value.id)
    || value.id === BASELINE_ID
  ) {
    throw new Error('A candidate needs a lowercase id of letters, digits, and hyphens.');
  }
  const intents = value.intents ?? [];
  if (!Array.isArray(intents) || intents.length > MAX_INTENTS || !intents.every(isIntent)) {
    throw new Error(`Candidate ${value.id} has malformed intents.`);
  }
  const expected = value.expectedBehavior ?? '';
  if (typeof expected !== 'string') {
    throw new Error(`Candidate ${value.id} expectedBehavior must be a string.`);
  }
  return { delta: parseDelta(value.delta), expectedBehavior: expected, id: value.id, intents };
};

export const parseProposal = (
  text: string,
): { readonly candidates: readonly Candidate[]; readonly document: string } => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('The proposal is not valid JSON.');
  }
  const rows = isRecord(value) && Array.isArray(value.candidates) ? value.candidates : [];
  if (rows.length < 1 || rows.length > MAX_BATCH_CANDIDATES) {
    throw new Error(`A proposal carries 1 to ${MAX_BATCH_CANDIDATES} candidates.`);
  }
  const candidates = rows.map(parseCandidate);
  if (new Set(candidates.map(({ id }) => id)).size !== candidates.length) {
    throw new Error('Candidate ids must be unique.');
  }
  const document = candidates[0]?.delta.document ?? '';
  if (candidates.some((candidate) => candidate.delta.document !== document)) {
    throw new Error('Every candidate in a batch edits the same document.');
  }
  if (document === '' || path.isAbsolute(document) || document.split('/').includes('..')) {
    throw new Error('The delta document must be a relative path inside the agents root.');
  }
  return { candidates, document };
};

const readInputs = async (deps: LibrarianDeps, document: string): Promise<Inputs> => {
  const target = deps.targetOf(document);
  const mapPath = path.join(deps.agentsRoot, atomMapPathOf(target.setPath));
  const [text, mapText, setText] = await Promise.all([
    deps.readText(path.join(deps.agentsRoot, document)),
    deps.readText(mapPath),
    deps.readText(path.join(deps.agentsRoot, target.setPath)),
  ]);
  if (text === undefined || mapText === undefined || setText === undefined) {
    throw new Error(`The document, its atom map, and its probe set must all exist: ${document}`);
  }
  return {
    atomMapSha256: deps.sha256(mapText),
    baselineSha256: deps.sha256(text),
    map: parseAtomMap(mapText),
    setSha256: deps.sha256(setText),
    text,
  };
};

const retirementsPathOf = (deps: LibrarianDeps, setPath: string): string =>
  path.join(deps.agentsRoot, path.dirname(path.dirname(setPath)), 'retirements.json');

const addRetirements = async (
  deps: LibrarianDeps,
  setPath: string,
  rows: readonly { readonly atomId: string; readonly reason: string }[],
): Promise<number> => {
  if (rows.length === 0) {
    return 0;
  }
  const file = retirementsPathOf(deps, setPath);
  const text = await deps.readText(file);
  const value: unknown =
    text === undefined ? { retirements: [], schemaVersion: 1 } : JSON.parse(text);
  const existing = isRecord(value) && Array.isArray(value.retirements) ? value.retirements : [];
  const known = new Set(existing.map((row) => (isRecord(row) ? row.caseId : undefined)));
  const fresh = rows
    .filter(({ atomId }) => !known.has(`atom:${atomId}`))
    .map(({ atomId, reason }) => ({ caseId: `atom:${atomId}`, reason }));
  await deps.writeText(
    file,
    `${JSON.stringify({ ...(isRecord(value) ? value : {}), retirements: [...existing, ...fresh] }, null, 2)}\n`,
  );
  return fresh.length;
};

const roundRowOf = (
  line: string,
): {
  readonly baselineSha256: string;
  readonly batchId: string;
  readonly document: string;
  readonly setSha256?: string;
} => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error('The librarian round ledger contains invalid JSON.');
  }
  if (
    !isRecord(value)
    || typeof value.baselineSha256 !== 'string'
    || typeof value.batchId !== 'string'
    || typeof value.document !== 'string'
    || (value.setSha256 !== undefined
      && (typeof value.setSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.setSha256)))
  ) {
    throw new Error('The librarian round ledger contains an invalid entry.');
  }
  return {
    baselineSha256: value.baselineSha256,
    batchId: value.batchId,
    document: value.document,
    ...(typeof value.setSha256 === 'string' ? { setSha256: value.setSha256 } : {}),
  };
};

const roundRowsOf = (ledger: string) =>
  ledger
    .split('\n')
    .filter((entry) => entry.trim() !== '')
    .map(roundRowOf);

const sealsPathOf = (setPath: string): string =>
  `${setPath.slice(0, setPath.indexOf('comprehension/'))}behavior-seals.jsonl`;

// A candidate that touches a behavioral atom needs a passing seal for every behavior case that
// cites the atom, bound to this exact candidate text.
const behaviorProblems = async (
  deps: LibrarianDeps,
  inputs: Inputs,
  snapshot: Snapshot,
  setPath: string,
): Promise<readonly string[]> => {
  const touched = snapshot.touched.filter(
    (id) => inputs.map.atoms.find((atom) => atom.id === id)?.behavioral === true,
  );
  if (touched.length === 0) {
    return [];
  }
  const coverage = await deps.readText(path.join(deps.agentsRoot, 'evals/coverage-map.json'));
  const cases = casesForAtoms(
    inputs.text,
    inputs.map.source,
    touched,
    ruleRangesOf(coverage === undefined ? undefined : JSON.parse(coverage)),
  );
  if (cases.length === 0) {
    return ['A touched behavioral atom maps to no behavior case; send it for owner review.'];
  }
  const seals = await deps.readText(path.join(deps.agentsRoot, sealsPathOf(setPath)));
  return unsealedCases(
    seals === undefined ? [] : parseSealLines(seals),
    cases,
    snapshot.candidateSha256,
  ).map((id) => `Behavior case ${id} has no passing seal for this candidate.`);
};

const setSha256OfRound = async (
  deps: LibrarianDeps,
  row: { readonly batchId: string; readonly baselineSha256: string; readonly document: string },
): Promise<string> => {
  if (!/^[a-f0-9]{16}$/u.test(row.batchId)) {
    throw new Error('The librarian round ledger has an invalid batch id.');
  }
  const text = await deps.readText(path.join(deps.storeRoot, row.batchId, 'manifest.json'));
  let value: unknown;
  try {
    value = text === undefined ? undefined : JSON.parse(text);
  } catch {
    throw new Error('A prior librarian round has an unreadable manifest.');
  }
  if (
    !isRecord(value)
    || value.batchId !== row.batchId
    || value.document !== row.document
    || value.baselineSha256 !== row.baselineSha256
    || typeof value.setSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(value.setSha256)
  ) {
    throw new Error('A prior librarian round has no verifiable probe-set fingerprint.');
  }
  return value.setSha256;
};

const roundOf = async (
  deps: LibrarianDeps,
  document: string,
  baselineSha256: string,
  setSha256: string,
): Promise<number> => {
  const ledger = (await deps.readText(path.join(deps.storeRoot, 'rounds.jsonl'))) ?? '';
  const relevant = roundRowsOf(ledger).filter(
    (row) => row.document === document && row.baselineSha256 === baselineSha256,
  );
  const priorSetSha256s = await Promise.all(
    relevant.map((row) => row.setSha256 ?? setSha256OfRound(deps, row)),
  );
  return priorSetSha256s.filter((prior) => prior === setSha256).length + 1;
};

const storeFile = (deps: LibrarianDeps, batchId: string, name: string): string =>
  path.join(deps.storeRoot, batchId, name);

const readStore = async (deps: LibrarianDeps, batchId: string, name: string): Promise<unknown> => {
  const text = await deps.readText(storeFile(deps, batchId, name));
  if (text === undefined) {
    throw new Error(`Missing snapshot payload: ${batchId}/${name}`);
  }
  return JSON.parse(text);
};

const loadManifest = async (deps: LibrarianDeps, batchId: string): Promise<BatchManifest> => {
  const value = await readStore(deps, batchId, 'manifest.json');
  if (!isRecord(value) || value.batchId !== batchId || !Array.isArray(value.candidates)) {
    throw new Error(`The batch manifest is malformed: ${batchId}`);
  }
  return value as unknown as BatchManifest;
};

const loadSnapshot = async (
  deps: LibrarianDeps,
  batchId: string,
  entry: { readonly candidateSha256: string; readonly id: string },
): Promise<Snapshot> => {
  const value = await readStore(deps, batchId, `${entry.id}.json`);
  if (!isRecord(value) || typeof value.text !== 'string') {
    throw new Error(`The candidate snapshot is malformed: ${entry.id}`);
  }
  if (deps.sha256(value.text) !== entry.candidateSha256) {
    throw new Error(`The candidate snapshot does not match its recorded hash: ${entry.id}`);
  }
  return value as unknown as Snapshot;
};

const structuralProblems = (deps: LibrarianDeps, snapshot: Snapshot): readonly string[] => {
  const problems: string[] = [];
  if (deps.reflow(snapshot.text) !== snapshot.text) {
    problems.push('The candidate text is not reflowed to the 100-column band.');
  }
  return problems;
};

const structuralReport = (
  manifest: BatchManifest,
  snapshots: readonly Snapshot[],
  flagged: ReadonlyMap<string, readonly string[]>,
): CheckReport => ({
  batchId: manifest.batchId,
  candidates: snapshots.map((snapshot) => ({
    atoms: [],
    diagnoses: [],
    expectedBehavior: snapshot.expectedBehavior,
    id: snapshot.id,
    intents: [],
    intentsProven: false,
    problems: [],
    structural: flagged.get(snapshot.id) ?? [],
    swapped: false,
    trainGained: [],
    validationPassed: 0,
  })),
  nextStep: 'repair',
  round: manifest.round,
  selected: null,
  stopReason: 'structural',
});

const tagsOf = (snapshot: Snapshot, counter: 'harmful' | 'helpful'): readonly string[] =>
  snapshot.delta.ops.flatMap((op) =>
    op.op === 'tag' && op.counter === counter ? [op.atomId] : [],
  );

// The only path that writes an instruction file: it needs a selected verdict bound to the exact
// document, atom map, and probe set, then writes the text, retirement rows, and atom map. The
// receipt stays stale until `instruction-gate record` seals the new text.
export const commit = async (deps: LibrarianDeps, batchId: string): Promise<CommitReport> => {
  const manifest = await loadManifest(deps, batchId);
  const verdict = (await readStore(deps, batchId, 'verdict.json')) as Verdict;
  if (verdict.selected === null || verdict.bound === null) {
    throw new Error(`Refused: the verdict selected no candidate (${verdict.stopReason}).`);
  }
  const entry = manifest.candidates.find(({ id }) => id === verdict.selected);
  if (entry === undefined || entry.candidateSha256 !== verdict.bound.candidateSha256) {
    throw new Error('Refused: the verdict is not bound to a candidate of this batch.');
  }
  const inputs = await readInputs(deps, manifest.document);
  if (
    inputs.baselineSha256 !== verdict.bound.baselineSha256
    || inputs.atomMapSha256 !== verdict.bound.atomMapSha256
    || inputs.setSha256 !== verdict.bound.setSha256
  ) {
    throw new Error(
      'Refused: the verdict is stale for the current document, atom map, or probe set.',
    );
  }
  const snapshot = await loadSnapshot(deps, batchId, entry);
  const target = deps.targetOf(manifest.document);
  const unsealed = await behaviorProblems(deps, inputs, snapshot, target.setPath);
  if (unsealed.length > 0) {
    throw new Error(`Refused: ${unsealed.join(' ')}`);
  }
  const retirementRows = await addRetirements(deps, target.setPath, snapshot.retired);
  await deps.writeText(path.join(deps.agentsRoot, manifest.document), snapshot.text);
  const rebuilt = await deps.rebuild(ownerIdOf(manifest.document));
  await applyCounters(
    deps,
    path.join(deps.agentsRoot, atomMapPathOf(target.setPath)),
    [...snapshot.added, ...tagsOf(snapshot, 'helpful')],
    [...verdict.harmful, ...tagsOf(snapshot, 'harmful')],
  );
  return {
    document: manifest.document,
    receipt: `stale: run instruction-gate record ${verdict.swapReason === undefined ? '' : '--allow-swap <reason> '}${manifest.document}`,
    retirementRows,
    unresolvedProbes: rebuilt.maps.flatMap((map) => map.unresolvedProbes),
  };
};

const touchedIds = (ops: readonly DeltaOp[]): readonly string[] =>
  ops.flatMap((op) => (op.op === 'tag' || op.op === 'add' ? [] : [op.atom.atomId]));

const buildSnapshot = (deps: LibrarianDeps, inputs: Inputs, candidate: Candidate): Snapshot => {
  const merged = mergeDelta(inputs.text, inputs.map, candidate.delta.ops);
  const text = deps.reflow(merged.text);
  if (normalizeText(text) !== normalizeText(merged.text)) {
    throw new Error(`Candidate ${candidate.id}: reflow changed more than whitespace.`);
  }
  if (descriptionOf(text) !== descriptionOf(inputs.text)) {
    throw new Error(`Candidate ${candidate.id} changes the skill description.`);
  }
  if (text === inputs.text) {
    throw new Error(`Candidate ${candidate.id} does not change the document.`);
  }
  return {
    added: merged.added,
    candidateSha256: deps.sha256(text),
    changedAtoms: merged.added.length + merged.retired.length,
    delta: candidate.delta,
    expectedBehavior: candidate.expectedBehavior,
    id: candidate.id,
    intents: candidate.intents,
    retired: merged.retired,
    text,
    tokenDelta: normalizeText(text).length - normalizeText(inputs.text).length,
    touched: touchedIds(candidate.delta.ops),
  };
};

const vectorOf = (snapshot: Snapshot, row: BatchCandidateResult): ProbeVectorCandidate => ({
  candidateId: snapshot.id,
  changedAtoms: snapshot.changedAtoms,
  tokenDelta: snapshot.tokenDelta,
  trainPassed: row.measurement.trainPassed,
  validationPassed: row.measurement.validationPassed,
});

const verdictFor = (
  snapshot: Snapshot,
  row: BatchCandidateResult,
  map: AtomMap,
  problems: readonly string[],
  baselinePassed: readonly string[],
  swapped: boolean,
): CandidateVerdict => ({
  atoms: map.atoms
    .filter((atom) => snapshot.touched.includes(atom.id))
    .map((atom) => ({
      atomId: atom.id,
      probes: atom.probeIds.map((id) => ({ id, passed: row.passed[id] === true })),
    })),
  diagnoses: row.failures.map(({ expected, given, id, suggestion }) => ({
    expected,
    given,
    id,
    ...(suggestion === undefined ? {} : { suggestion }),
  })),
  expectedBehavior: snapshot.expectedBehavior,
  id: snapshot.id,
  intents: row.intents,
  intentsProven: row.intents.every(({ proven }) => proven),
  problems,
  structural: [],
  swapped,
  trainGained: row.measurement.trainPassed.filter((id) => !baselinePassed.includes(id)),
  validationPassed: row.measurement.validationPassed,
});

const writeStore = (
  deps: LibrarianDeps,
  batchId: string,
  name: string,
  value: unknown,
): Promise<void> =>
  deps.writeText(storeFile(deps, batchId, name), `${JSON.stringify(value, null, 2)}\n`);

// A batch with a free slot also measures the current text, so gains are counted against a real
// baseline instead of a possibly stale receipt.
const evaluateRows = async (
  deps: LibrarianDeps,
  manifest: BatchManifest,
  snapshots: readonly Snapshot[],
): Promise<Evaluated> => {
  const candidates = snapshots.map(({ id, intents, text }) => ({
    id,
    ...(intents.length > 0 ? { intents } : {}),
    source: text,
  }));
  const request = {
    schemaVersion: 1,
    targets: [
      {
        candidates:
          candidates.length < MAX_BATCH_CANDIDATES
            ? [...candidates, { id: BASELINE_ID }]
            : candidates,
        document: manifest.document,
      },
    ],
  };
  const result = await deps.evaluate(JSON.stringify(request));
  const rows = result.targets[0]?.candidates ?? [];
  await writeStore(deps, manifest.batchId, 'result.json', rows);
  return {
    baseline: rows.find(({ id }) => id === BASELINE_ID)?.measurement,
    rows: rows.filter(({ id }) => id !== BASELINE_ID),
  };
};

// Validates and merges up to three candidate deltas, then writes their snapshots to the OS-temp
// store. No repository file is written.
export const propose = async (deps: LibrarianDeps, requestText: string): Promise<ProposeReport> => {
  const { candidates, document } = parseProposal(requestText);
  const inputs = await readInputs(deps, document);
  const round = await roundOf(deps, document, inputs.baselineSha256, inputs.setSha256);
  if (round > MAX_ROUNDS) {
    throw new Error(
      `The ${MAX_ROUNDS}-round budget for this document text and probe set is spent; escalate.`,
    );
  }
  const snapshots = candidates.map((candidate) => buildSnapshot(deps, inputs, candidate));
  if (new Set(snapshots.map(({ candidateSha256 }) => candidateSha256)).size !== snapshots.length) {
    throw new Error('Two candidates produce the same document text.');
  }
  const batchId = deps
    .sha256(
      JSON.stringify([
        document,
        inputs.baselineSha256,
        inputs.setSha256,
        round,
        snapshots.map((s) => s.candidateSha256),
      ]),
    )
    .slice(0, 16);
  const manifest: BatchManifest = {
    atomMapSha256: inputs.atomMapSha256,
    baselineSha256: inputs.baselineSha256,
    batchId,
    candidates: snapshots.map(({ candidateSha256, id }) => ({ candidateSha256, id })),
    document,
    round,
    setSha256: inputs.setSha256,
  };
  await Promise.all(
    snapshots.map((snapshot) => writeStore(deps, batchId, `${snapshot.id}.json`, snapshot)),
  );
  await writeStore(deps, batchId, 'manifest.json', manifest);
  await appendRound(deps, {
    baselineSha256: inputs.baselineSha256,
    batchId,
    document,
    setSha256: inputs.setSha256,
  });
  return {
    baselineSha256: inputs.baselineSha256,
    batchId,
    candidates: snapshots.map((snapshot) => ({
      candidateSha256: snapshot.candidateSha256,
      changedAtoms: snapshot.changedAtoms,
      id: snapshot.id,
      snapshot: storeFile(deps, batchId, `${snapshot.id}.json`),
      tokenDelta: snapshot.tokenDelta,
    })),
    document,
    round,
    setSha256: inputs.setSha256,
  };
};

const proposeFromFile = async (deps: LibrarianDeps, file: string): Promise<ProposeReport> => {
  const text = await deps.readText(file);
  if (!file.startsWith('/') || text === undefined) {
    throw new Error(`Missing proposal file: ${file}`);
  }
  return propose(deps, text);
};

const writeVerdict = (deps: LibrarianDeps, batchId: string, verdict: Verdict): Promise<void> =>
  writeStore(deps, batchId, 'verdict.json', verdict);

const judgeBatch = async (
  deps: LibrarianDeps,
  manifest: BatchManifest,
  snapshots: readonly Snapshot[],
  swapReason: string | undefined,
): Promise<CheckReport> => {
  const target = deps.targetOf(manifest.document);
  const [evaluated, receiptBaseline, core, inputs] = await Promise.all([
    evaluateRows(deps, manifest, snapshots),
    baselineOf(deps, target.receiptPath),
    coreOf(deps, target.setPath),
    readInputs(deps, manifest.document),
  ]);
  const { rows } = evaluated;
  const baseline = evaluated.baseline ?? receiptBaseline;
  const judged = await Promise.all(
    snapshots.map(async (snapshot) => {
      const row = rows.find(({ id }) => id === snapshot.id);
      if (row === undefined) {
        throw new Error(`The batch result has no row for candidate ${snapshot.id}.`);
      }
      const policy = policyProblems(
        row.measurement,
        baseline,
        core ?? baseline.trainPassed,
        swapReason,
      );
      const problems = [
        ...policy.problems,
        ...(await behaviorProblems(deps, inputs, snapshot, target.setPath)),
      ];
      return {
        row,
        snapshot,
        verdict: verdictFor(
          snapshot,
          row,
          inputs.map,
          problems,
          baseline.trainPassed,
          policy.swapped,
        ),
      };
    }),
  );
  const admissible = judged
    .filter(({ verdict }) => verdict.problems.length === 0 && verdict.intentsProven)
    .filter(
      ({ snapshot, verdict }) => verdict.trainGained.length > 0 || snapshot.intents.length > 0,
    )
    .map(({ row, snapshot }) => vectorOf(snapshot, row));
  const decision = decideBatch({ admissible, round: manifest.round, roundBudget: MAX_ROUNDS });
  const verdicts = judged.map(({ verdict }) => verdict);
  const bound: Bound | null =
    decision.selected === null
      ? null
      : {
          atomMapSha256: manifest.atomMapSha256,
          baselineSha256: manifest.baselineSha256,
          candidateSha256:
            manifest.candidates.find(({ id }) => id === decision.selected)?.candidateSha256 ?? '',
          setSha256: manifest.setSha256,
        };
  await writeVerdict(deps, manifest.batchId, {
    batchId: manifest.batchId,
    bound,
    harmful: harmfulOf(snapshots, verdicts),
    selected: decision.selected,
    stopReason: decision.stopReason,
    ...(swapReason === undefined ? {} : { swapReason }),
  });
  return {
    batchId: manifest.batchId,
    candidates: verdicts,
    nextStep: decision.nextStep,
    round: manifest.round,
    selected: decision.selected,
    stopReason: decision.stopReason,
  };
};

// One structured verdict per round: structural checks, one batched reader run, the acceptance
// policy per candidate, the frontier choice, and the stop reason. Writes only the OS-temp store.
export const check = async (
  deps: LibrarianDeps,
  batchId: string,
  swapReason?: string,
): Promise<CheckReport> => {
  const manifest = await loadManifest(deps, batchId);
  assertCurrent(manifest, await readInputs(deps, manifest.document));
  const snapshots = await Promise.all(
    manifest.candidates.map((entry) => loadSnapshot(deps, batchId, entry)),
  );
  const flagged = new Map(snapshots.map((s) => [s.id, structuralProblems(deps, s)] as const));
  if ([...flagged.values()].some((problems) => problems.length > 0)) {
    await writeVerdict(deps, batchId, {
      batchId,
      bound: null,
      harmful: [],
      selected: null,
      stopReason: 'structural',
    });
    return structuralReport(manifest, snapshots, flagged);
  }
  return judgeBatch(deps, manifest, snapshots, swapReason);
};

export const runLibrarian = async (
  args: readonly string[],
  write: (message: string) => void,
  makeDeps: (agentsRoot: string) => LibrarianDeps,
): Promise<void> => {
  const { argument, command, root, swapReason } = invocationOf(args);
  const deps = makeDeps(root);
  const verbs: Readonly<Record<string, () => Promise<unknown>>> = {
    check: () => check(deps, argument, swapReason),
    commit: () => commit(deps, argument),
    propose: () => proposeFromFile(deps, argument),
  };
  if (!Object.hasOwn(verbs, command)) {
    throw new Error(librarianUsage());
  }
  write(JSON.stringify(await verbs[command]?.(), null, 2));
};
