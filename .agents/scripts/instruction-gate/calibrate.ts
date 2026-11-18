import path from 'node:path';
import {
  isRecord,
  type OwnerEntry,
  ownerEntryOf,
  readJson,
} from '../../utils/quality-engine/atom/audit.js';
import { mapPathFor, renderAtomMap, resolveTarget } from '../../utils/quality-engine/atom/build.js';
import {
  type Atom,
  type AtomMap,
  normalizeText,
  parseAtomMap,
  type Sensitivity,
  sha256Hex,
  sourceUnits,
} from '../../utils/quality-engine/atom/index.js';
import {
  CALIBRATION_ATOM_LIMIT,
  type Mutant,
  mutantsFor,
  selectAtoms,
} from '../../utils/quality-engine/atom/mutate.js';
import {
  blindDocumentBundleFor,
  parseTriggerQuerySet,
  type TriggerQuerySet,
} from '../../utils/quality-engine/train/index.js';
import { isNoAdapterFailure } from '../weak-reader/index.js';
import type { BatchDeps } from './batch.js';

export interface CalibrationReport {
  readonly owners: readonly OwnerCalibration[];
}

export interface DocumentCalibration {
  readonly atoms: number;
  readonly document: string;
  readonly mapPath: string;
  readonly mutants: number;
  readonly probes: readonly Sensitivity[];
}

interface Job {
  readonly answersPath: string;
  readonly atom: Atom | undefined;
  readonly kind: 'baseline' | Mutant['kind'];
}

export interface OwnerCalibration {
  readonly documents: readonly DocumentCalibration[];
  readonly ownerId: string;
  readonly uncalibrated: readonly { readonly document: string; readonly probeId: string }[];
  readonly written: boolean;
}

interface Plan {
  readonly document: string;
  readonly items: readonly object[];
  readonly jobs: readonly Job[];
  readonly map: AtomMap;
  readonly mapPath: string;
  readonly selected: readonly Atom[];
}

const bundleFor = (
  querySet: TriggerQuerySet,
  text: string,
  probeIds: ReadonlySet<string>,
): string => {
  const bundle = blindDocumentBundleFor(querySet, text);
  return JSON.stringify({
    ...bundle,
    prompts: bundle.prompts.filter((prompt) => probeIds.has(prompt.query_id)),
  });
};

const lettersOf = async (deps: BatchDeps, answersPath: string): Promise<Map<string, string>> => {
  const text = await deps.readText(answersPath);
  if (text === undefined) {
    throw new Error(`The reader wrote no answers: ${answersPath}`);
  }
  const rows = text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { answer?: string; query_id: string });
  const letters = new Map<string, string>();
  for (const row of rows) {
    if (!letters.has(row.query_id)) {
      letters.set(row.query_id, row.answer ?? '');
    }
  }
  return letters;
};

const mergeSensitivity = (
  map: AtomMap,
  measured: readonly Sensitivity[],
): readonly Sensitivity[] => {
  const replaced = new Set(measured.map((entry) => entry.probeId));
  return [...map.sensitivity.filter((entry) => !replaced.has(entry.probeId)), ...measured].sort(
    (left, right) => (left.probeId < right.probeId ? -1 : 1),
  );
};

const reader = (deps: BatchDeps) => ({
  readFile: async (file: string): Promise<string> => {
    const text = await deps.readText(file);
    if (text === undefined) {
      throw new Error(`Missing file: ${file}`);
    }
    return text;
  },
});

const runReader = async (
  deps: BatchDeps,
  work: string,
  items: readonly object[],
): Promise<void> => {
  const manifestPath = path.join(work, 'batch.json');
  await deps.writeText(manifestPath, JSON.stringify({ items }));
  const read = await deps.executor({
    args: [path.join(deps.toolsRoot, 'scripts', 'weak-reader', 'index.ts'), 'batch', manifestPath],
    command: 'bun',
    timeoutMs: 120 * 60 * 1000,
  });
  if (read.code !== 0) {
    const hint = isNoAdapterFailure(read.stdout)
      ? ' (no GPU adapter: run this command outside the sandbox)'
      : '';
    throw new Error(`weak reader exited ${read.code}${hint}: ${read.stderr.trim().slice(-300)}`);
  }
};

const scorePlan = async (deps: BatchDeps, plan: Plan): Promise<readonly Sensitivity[]> => {
  const [baseline, ...mutants] = plan.jobs;
  const base = await lettersOf(deps, (baseline as Job).answersPath);
  const tried = new Map<string, number>();
  const flipped = new Map<string, number>();
  for (const job of mutants) {
    const letters = await lettersOf(deps, job.answersPath);
    for (const probeId of job.atom?.probeIds ?? []) {
      tried.set(probeId, (tried.get(probeId) ?? 0) + 1);
      const changed = letters.get(probeId) !== base.get(probeId);
      flipped.set(probeId, (flipped.get(probeId) ?? 0) + (changed ? 1 : 0));
    }
  }
  return [...tried.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([probeId, count]) => ({
      mutantsFlipped: flipped.get(probeId) ?? 0,
      mutantsTried: count,
      probeId,
    }));
};

const sentenceOf = (source: string, atom: Atom): string | undefined =>
  sourceUnits(source)
    .map((unit) => normalizeText(unit.text))
    .find((text) => sha256Hex(text) === atom.textSha256);

const planDocument = async (
  deps: BatchDeps,
  owner: OwnerEntry,
  setPath: string,
  work: string,
  index: number,
): Promise<Plan> => {
  const root = deps.agentsRoot;
  const setText = await reader(deps).readFile(path.join(root, setPath));
  const set = JSON.parse(setText) as Record<string, unknown>;
  const document = resolveTarget(setPath, set.target);
  if (document === undefined) {
    throw new Error(`The comprehension set names no target document: ${setPath}.`);
  }
  const mapPath = mapPathFor(owner, setPath);
  const map = parseAtomMap(await reader(deps).readFile(path.join(root, mapPath)));
  const source = await reader(deps).readFile(path.join(root, document));
  const querySet = parseTriggerQuerySet(setText, setPath);
  const selected = selectAtoms(map.atoms, CALIBRATION_ATOM_LIMIT);
  const runs: {
    readonly atom: Atom | undefined;
    readonly kind: Job['kind'];
    readonly text: string;
    readonly probes: ReadonlySet<string>;
  }[] = [
    {
      atom: undefined,
      kind: 'baseline',
      probes: new Set(selected.flatMap((atom) => atom.probeIds)),
      text: source,
    },
    ...selected.flatMap((atom) =>
      mutantsFor(source, sentenceOf(source, atom) ?? '').map((mutant) => ({
        atom,
        kind: mutant.kind,
        probes: new Set(atom.probeIds),
        text: mutant.text,
      })),
    ),
  ];
  const items: object[] = [];
  const jobs: Job[] = [];
  for (const [position, run] of runs.entries()) {
    const base = path.join(work, `${index}-${position}`);
    await deps.writeText(`${base}.bundle.json`, bundleFor(querySet, run.text, run.probes));
    items.push({ answersPath: `${base}.answers.jsonl`, bundlePath: `${base}.bundle.json` });
    jobs.push({ answersPath: `${base}.answers.jsonl`, atom: run.atom, kind: run.kind });
  }
  return { document, items, jobs, map, mapPath, selected };
};

const calibrateOwner = async (
  deps: BatchDeps,
  owner: OwnerEntry,
  write: boolean,
): Promise<OwnerCalibration> => {
  const work = await deps.makeTempDir();
  const plans: Plan[] = [];
  for (const [index, setPath] of owner.sets.entries()) {
    plans.push(await planDocument(deps, owner, setPath, work, index));
  }
  await runReader(
    deps,
    work,
    plans.flatMap((plan) => plan.items),
  );
  const documents: DocumentCalibration[] = [];
  const uncalibrated: { document: string; probeId: string }[] = [];
  for (const plan of plans) {
    const probes = await scorePlan(deps, plan);
    if (write) {
      const next = { ...plan.map, sensitivity: mergeSensitivity(plan.map, probes) };
      await deps.writeText(path.join(deps.agentsRoot, plan.mapPath), renderAtomMap(next));
    }
    uncalibrated.push(
      ...probes
        .filter((entry) => entry.mutantsFlipped === 0)
        .map((entry) => ({ document: plan.document, probeId: entry.probeId })),
    );
    documents.push({
      atoms: plan.selected.length,
      document: plan.document,
      mapPath: plan.mapPath,
      mutants: plan.jobs.length - 1,
      probes,
    });
  }
  return { documents, ownerId: owner.id, uncalibrated, written: write };
};

export const calibrateOwners = async (
  deps: BatchDeps,
  ownerIds: readonly string[],
  write: boolean,
): Promise<CalibrationReport> => {
  const manifest = await readJson(
    reader(deps),
    path.join(deps.agentsRoot, 'evals', 'manifest.json'),
  );
  const rows = isRecord(manifest) && Array.isArray(manifest.owners) ? manifest.owners : [];
  const owners = rows.map(ownerEntryOf).filter((owner): owner is OwnerEntry => owner !== undefined);
  const chosen = ownerIds.map((id) => {
    const owner = owners.find((entry) => entry.id === id);
    if (owner === undefined) {
      throw new Error(`No owner with the atoms lane matches ${id}.`);
    }
    return owner;
  });
  const results: OwnerCalibration[] = [];
  for (const owner of chosen) {
    results.push(await calibrateOwner(deps, owner, write));
  }
  return { owners: results };
};
