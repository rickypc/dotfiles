import type { FileSystem } from '../filesystem.js';
import {
  type AtomCheckPolicy,
  type AtomFinding,
  type AtomMap,
  checkAtoms,
  parseAtomCheckPolicy,
  parseAtomMap,
} from './atoms.js';

export interface AuditFinding extends AtomFinding {
  readonly ownerId: string;
}

interface MapAudit {
  readonly atoms: number;
  readonly findings: readonly AtomFinding[];
  readonly probesMapped: number;
  readonly sensitivity: SensitivityState;
  readonly uncalibrated: readonly UncalibratedProbe[];
}

export interface OwnerAudit {
  readonly atoms: number;
  readonly errors: readonly string[];
  readonly findings: readonly AuditFinding[];
  readonly maps: number;
  readonly ownerId: string;
  readonly probesMapped: number;
  readonly sensitivity: SensitivityState;
  readonly uncalibrated: readonly UncalibratedProbe[];
}

export interface OwnerEntry {
  readonly directory: string;
  readonly id: string;
  readonly maps: readonly string[];
  readonly sets: readonly string[];
}

type Reader = Pick<FileSystem, 'readFile'>;

export interface SensitivityState {
  readonly calibrated: number;
  readonly uncalibrated: number;
  readonly unmeasured: number;
}

export interface UncalibratedProbe {
  readonly mutantsTried: number;
  readonly probeId: string;
  readonly source: string;
}

const emptySensitivity: SensitivityState = { calibrated: 0, uncalibrated: 0, unmeasured: 0 };

export const baseName = (path: string): string =>
  (path.split('/').pop() ?? path).replace(/\.[^.]+$/u, '');

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const readJson = async (reader: Reader, path: string): Promise<unknown> =>
  JSON.parse(await reader.readFile(path, 'utf8')) as unknown;

const activeProbeIdsOf = async (reader: Reader, path: string): Promise<readonly string[]> => {
  const set = await readJson(reader, path);
  const queries = isRecord(set) && Array.isArray(set.queries) ? set.queries : [];
  return queries.flatMap((query) =>
    isRecord(query) && typeof query.id === 'string' && query.retired === undefined
      ? [query.id]
      : [],
  );
};

const retirementsOf = async (
  reader: Reader,
  root: string,
  directory: string,
): Promise<ReadonlySet<string>> => {
  try {
    const file = await readJson(reader, `${root}/${directory}retirements.json`);
    const rows = isRecord(file) && Array.isArray(file.retirements) ? file.retirements : [];
    return new Set(
      rows.flatMap((row) =>
        isRecord(row) && typeof row.caseId === 'string' && row.caseId.startsWith('atom:')
          ? [row.caseId.slice('atom:'.length)]
          : [],
      ),
    );
  } catch {
    return new Set();
  }
};

const sensitivityOf = (map: AtomMap, probeIds: readonly string[]): SensitivityState => {
  const counts = { ...emptySensitivity };
  for (const id of probeIds) {
    const record = map.sensitivity.find((entry) => entry.probeId === id);
    if (record === undefined || record.mutantsTried === 0) {
      counts.unmeasured += 1;
    } else if (record.mutantsFlipped > 0) {
      counts.calibrated += 1;
    } else {
      counts.uncalibrated += 1;
    }
  }
  return counts;
};

const auditMap = async (
  reader: Reader,
  root: string,
  owner: OwnerEntry,
  mapPath: string,
  policy: AtomCheckPolicy,
): Promise<MapAudit> => {
  const map = parseAtomMap(await reader.readFile(`${root}/${mapPath}`, 'utf8'));
  const setPath = owner.sets.find((path) => baseName(path) === baseName(mapPath));
  if (setPath === undefined) {
    throw new Error(`No comprehension set matches ${mapPath}.`);
  }
  const probeIds = await activeProbeIdsOf(reader, `${root}/${setPath}`);
  const source = await reader.readFile(`${root}/${map.source}`, 'utf8');
  const recordedRetirements = await retirementsOf(reader, root, owner.directory);
  const linked = new Set(map.atoms.flatMap((atom) => atom.probeIds));
  return {
    atoms: map.atoms.length,
    findings: checkAtoms({ activeProbeIds: probeIds, map, policy, recordedRetirements, source }),
    probesMapped: probeIds.filter((id) => linked.has(id)).length,
    sensitivity: sensitivityOf(map, probeIds),
    uncalibrated: map.sensitivity
      .filter(
        (entry) =>
          probeIds.includes(entry.probeId) && entry.mutantsTried > 0 && entry.mutantsFlipped === 0,
      )
      .map((entry) => ({
        mutantsTried: entry.mutantsTried,
        probeId: entry.probeId,
        source: map.source,
      })),
  };
};

const setPathsOf = (artifacts: Record<string, unknown>): readonly string[] =>
  (Array.isArray(artifacts.comprehension) ? artifacts.comprehension : []).flatMap((entry) => {
    if (typeof entry === 'string') {
      return [entry];
    }
    return isRecord(entry) && typeof entry.setPath === 'string' ? [entry.setPath] : [];
  });

const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export const ownerEntryOf = (owner: unknown): OwnerEntry | undefined => {
  if (!isRecord(owner) || typeof owner.id !== 'string' || !isRecord(owner.artifacts)) {
    return undefined;
  }
  if (!stringList(owner.requiredLanes).includes('atoms')) {
    return undefined;
  }
  return {
    directory: typeof owner.directory === 'string' ? owner.directory : '',
    id: owner.id,
    maps: stringList(owner.artifacts.atoms),
    sets: setPathsOf(owner.artifacts),
  };
};

const sumSensitivity = (left: SensitivityState, right: SensitivityState): SensitivityState => ({
  calibrated: left.calibrated + right.calibrated,
  uncalibrated: left.uncalibrated + right.uncalibrated,
  unmeasured: left.unmeasured + right.unmeasured,
});

const auditOwner = async (
  reader: Reader,
  root: string,
  owner: OwnerEntry,
  policy: AtomCheckPolicy,
): Promise<OwnerAudit> => {
  const errors: string[] = owner.sets
    .filter((setPath) => !owner.maps.some((map) => baseName(map) === baseName(setPath)))
    .map((setPath) => `No atom map for comprehension set ${setPath}.`);
  const findings: AuditFinding[] = [];
  let totals = {
    atoms: 0,
    probesMapped: 0,
    sensitivity: emptySensitivity,
    uncalibrated: [] as readonly UncalibratedProbe[],
  };
  for (const mapPath of owner.maps) {
    try {
      const audit = await auditMap(reader, root, owner, mapPath, policy);
      findings.push(...audit.findings.map((finding) => ({ ...finding, ownerId: owner.id })));
      totals = {
        atoms: totals.atoms + audit.atoms,
        probesMapped: totals.probesMapped + audit.probesMapped,
        sensitivity: sumSensitivity(totals.sensitivity, audit.sensitivity),
        uncalibrated: [...totals.uncalibrated, ...audit.uncalibrated],
      };
    } catch (error) {
      errors.push(`${mapPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ...totals, errors, findings, maps: owner.maps.length, ownerId: owner.id };
};

export const auditAtoms = async (
  reader: Reader,
  root: string,
  ownerId?: string,
): Promise<readonly OwnerAudit[]> => {
  const manifest = await readJson(reader, `${root}/evals/manifest.json`);
  if (!isRecord(manifest) || !isRecord(manifest.policy) || !Array.isArray(manifest.owners)) {
    throw new Error('Root evaluation manifest has no policy or owners.');
  }
  const policy = parseAtomCheckPolicy(manifest.policy.atomChecks);
  const owners = manifest.owners
    .map(ownerEntryOf)
    .filter((owner): owner is OwnerEntry => owner !== undefined)
    .filter((owner) => ownerId === undefined || owner.id === ownerId);
  if (ownerId !== undefined && owners.length === 0) {
    throw new Error(`No owner with the atoms lane matches ${ownerId}.`);
  }
  return Promise.all(owners.map((owner) => auditOwner(reader, root, owner, policy)));
};
