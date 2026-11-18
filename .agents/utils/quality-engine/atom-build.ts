import type { FileSystem } from '../filesystem.js';
import { renderOkfConcept } from '../okf.js';
import { baseName, isRecord, type OwnerEntry, ownerEntryOf, readJson } from './atom-audit.js';
import { type RuleRange, ruleRangesOf, tagBehavioral } from './atom-behavior.js';
import {
  type Atom,
  type AtomMap,
  normalizeText,
  parseAtomMap,
  type SourceBlock,
  sha256Hex,
  sourceUnits,
} from './atoms.js';

type ArtifactsPicker = (manifest: Record<string, unknown>) => Record<string, unknown> | undefined;

export interface BuildMapReport {
  readonly atoms: number;
  readonly behavioral: number;
  readonly mappedCases: readonly string[];
  readonly path: string;
  readonly retiredAtoms: readonly string[];
  readonly status: 'changed' | 'created' | 'unchanged';
  readonly unresolvedProbes: readonly string[];
}

export interface BuildProbe {
  readonly evidence: string;
  readonly id: string;
}

export interface BuildReport {
  readonly manifests: readonly string[];
  readonly maps: readonly BuildMapReport[];
  readonly unmappedCases: readonly string[];
  readonly written: boolean;
}

type BuildSystem = Pick<FileSystem, 'exists' | 'mkdir' | 'readFile' | 'writeFile'>;

interface Hit {
  readonly order: number;
  readonly probes: Set<string>;
  readonly text: string;
}

const atomFor = (
  hit: Hit,
  units: readonly SourceBlock[],
  previous: ReadonlyMap<string, Atom>,
): Atom => {
  const id = `r-${sha256Hex(hit.text).slice(0, 10)}`;
  const kept = previous.get(id);
  return {
    behavioral: kept?.behavioral ?? false,
    harmful: kept?.harmful ?? 0,
    helpful: kept?.helpful ?? 0,
    id,
    placements: units
      .filter((unit) => normalizeText(unit.text) === hit.text)
      .map((unit) => ({ headingPath: unit.headingPath })),
    precedence: kept?.precedence ?? 0,
    probeIds: [...hit.probes].sort(),
    status: 'active',
    tags: kept?.tags ?? [],
    textSha256: sha256Hex(hit.text),
  };
};

const editAtomList =
  (pick: ArtifactsPicker, maps: readonly string[], path: string) =>
  async (manifest: Record<string, unknown>): Promise<boolean> => {
    const artifacts = pick(manifest);
    if (artifacts === undefined) {
      throw new Error(`Manifest has no artifacts object: ${path}`);
    }
    const next = [...maps].sort();
    const same = JSON.stringify(artifacts.atoms) === JSON.stringify(next);
    artifacts.atoms = next;
    return !same;
  };

// A skill manifest records the SHA-256 of every source document; `validate-skills` rejects a
// stale value, so a document edit must refresh it together with the atom map.
const editSourceHashes =
  (fileSystem: BuildSystem, root: string) =>
  async (manifest: Record<string, unknown>): Promise<boolean> => {
    const sources = (Array.isArray(manifest.sources) ? manifest.sources : []).filter(isRecord);
    let changed = false;
    for (const source of sources) {
      const text = await fileSystem.readFile(`${root}/${String(source.sourcePath)}`, 'utf8');
      const digest = sha256Hex(text);
      changed ||= source.sha256 !== digest;
      source.sha256 = digest;
      if (source.sourcePath === manifest.sourceRubric && isRecord(manifest.fingerprints)) {
        changed ||= manifest.fingerprints.sourceRubricSha256 !== digest;
        manifest.fingerprints.sourceRubricSha256 = digest;
      }
    }
    return changed;
  };

const indexesOf = (haystack: string, needle: string): readonly number[] => {
  const hits: number[] = [];
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    hits.push(at);
  }
  return hits;
};

const hitsFor = (
  units: readonly SourceBlock[],
  probes: readonly BuildProbe[],
): { readonly hits: Map<string, Hit>; readonly unresolved: readonly string[] } => {
  const spans: { readonly end: number; readonly start: number; readonly text: string }[] = [];
  let full = '';
  for (const unit of units) {
    const text = normalizeText(unit.text);
    const start = full.length === 0 ? 0 : full.length + 1;
    full = full.length === 0 ? text : `${full} ${text}`;
    spans.push({ end: start + text.length, start, text });
  }
  const hits = new Map<string, Hit>();
  const unresolved: string[] = [];
  for (const probe of probes) {
    const evidence = normalizeText(probe.evidence);
    const found = indexesOf(full, evidence);
    if (found.length === 0) {
      unresolved.push(probe.id);
    }
    for (const at of found) {
      spans.forEach((span, order) => {
        if (span.start < at + evidence.length && span.end > at) {
          const hit = hits.get(span.text) ?? { order, probes: new Set<string>(), text: span.text };
          hit.probes.add(probe.id);
          hits.set(span.text, hit);
        }
      });
    }
  }
  return { hits, unresolved };
};

export const buildAtomMap = (input: {
  readonly existing?: AtomMap;
  readonly probes: readonly BuildProbe[];
  readonly source: string;
  readonly sourcePath: string;
}): {
  readonly map: AtomMap;
  readonly retired: readonly string[];
  readonly unresolved: readonly string[];
} => {
  const units = sourceUnits(input.source);
  const { hits, unresolved } = hitsFor(units, input.probes);
  const previous = new Map((input.existing?.atoms ?? []).map((atom) => [atom.id, atom]));
  const active = [...hits.values()]
    .sort((left, right) => left.order - right.order)
    .map((hit) => atomFor(hit, units, previous));
  const activeIds = new Set(active.map((atom) => atom.id));
  const retiredAtoms = (input.existing?.atoms ?? [])
    .filter((atom) => !activeIds.has(atom.id))
    .map((atom) => ({ ...atom, probeIds: [], status: 'retired' as const }));
  const probeIds = new Set(input.probes.map((probe) => probe.id));
  return {
    map: {
      atoms: [...active, ...retiredAtoms],
      sensitivity: (input.existing?.sensitivity ?? []).filter((entry) =>
        probeIds.has(entry.probeId),
      ),
      source: input.sourcePath,
    },
    retired: retiredAtoms
      .filter((atom) => !previous.has(atom.id) || previous.get(atom.id)?.status === 'active')
      .map((atom) => atom.id),
    unresolved,
  };
};

export const mapPathFor = (owner: OwnerEntry, setPath: string): string =>
  owner.id === 'root'
    ? `evals/atoms/${baseName(setPath)}.md`
    : `${owner.directory}atoms/${baseName(setPath)}.md`;

const ownersOf = (manifest: unknown, ownerId: string | undefined): readonly OwnerEntry[] => {
  const rows = isRecord(manifest) && Array.isArray(manifest.owners) ? manifest.owners : [];
  const owners = rows
    .map(ownerEntryOf)
    .filter((owner): owner is OwnerEntry => owner !== undefined)
    .filter((owner) => ownerId === undefined || owner.id === ownerId);
  if (owners.length === 0) {
    throw new Error(`No owner with the atoms lane matches ${ownerId ?? 'the manifest'}.`);
  }
  return owners;
};

const probeIdsOf = (value: unknown): readonly BuildProbe[] =>
  (isRecord(value) && Array.isArray(value.queries) ? value.queries : []).flatMap((query) =>
    isRecord(query)
    && typeof query.id === 'string'
    && typeof query.evidence === 'string'
    && query.retired === undefined
      ? [{ evidence: query.evidence, id: query.id }]
      : [],
  );

export const renderAtomMap = (map: AtomMap): string => {
  const rows = map.atoms
    .filter((atom) => atom.status === 'active')
    .map(
      (atom) =>
        `| \`${atom.id}\` | ${atom.placements
          .map((place) => place.headingPath.join(' > '))
          .join('; ')
          .replaceAll('|', '/')} | ${atom.probeIds.length} |`,
    );
  const body = [
    `Atoms for \`${map.source}\`.`,
    '',
    '| Atom | Placements | Probes |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
  const metadata = {
    atoms: map.atoms,
    description: `Rule atoms placed in ${map.source}; derived from comprehension probe evidence.`,
    schemaVersion: 1,
    ...(map.sensitivity.length > 0 ? { sensitivity: map.sensitivity } : {}),
    source: map.source,
    tags: ['atoms'],
    title: `Atom map for ${map.source}`,
    type: 'atom-map',
  };
  return renderOkfConcept(metadata, body);
};

export const resolveTarget = (setPath: string, target: unknown): string | undefined => {
  if (typeof target !== 'string' || target.length === 0) {
    return undefined;
  }
  const parts = setPath.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') {
      parts.pop();
    } else if (segment !== '.' && segment !== '') {
      parts.push(segment);
    }
  }
  return parts.join('/');
};

const buildOwnerMap = async (
  fileSystem: BuildSystem,
  root: string,
  owner: OwnerEntry,
  setPath: string,
  write: boolean,
  ranges: readonly RuleRange[],
): Promise<BuildMapReport> => {
  const path = mapPathFor(owner, setPath);
  const set = await readJson(fileSystem, `${root}/${setPath}`);
  const sourcePath = resolveTarget(setPath, isRecord(set) ? set.target : undefined);
  if (sourcePath === undefined) {
    throw new Error(`The comprehension set names no target document: ${setPath}.`);
  }
  const absolute = `${root}/${path}`;
  const existingText = (await fileSystem.exists(absolute))
    ? await fileSystem.readFile(absolute, 'utf8')
    : undefined;
  const source = await fileSystem.readFile(`${root}/${sourcePath}`, 'utf8');
  const built = buildAtomMap({
    existing: existingText === undefined ? undefined : parseAtomMap(existingText),
    probes: probeIdsOf(set),
    source,
    sourcePath,
  });
  const tagging = tagBehavioral(source, sourcePath, built.map.atoms, ranges);
  const rendered = renderAtomMap({ ...built.map, atoms: tagging.atoms });
  const status =
    existingText === undefined ? 'created' : existingText === rendered ? 'unchanged' : 'changed';
  if (write && status !== 'unchanged') {
    await fileSystem.mkdir(absolute.slice(0, absolute.lastIndexOf('/')), { recursive: true });
    await fileSystem.writeFile(absolute, rendered, 'utf8');
  }
  return {
    atoms: built.map.atoms.length,
    behavioral: tagging.atoms.filter((atom) => atom.behavioral).length,
    mappedCases: tagging.mapped,
    path,
    retiredAtoms: built.retired,
    status,
    unresolvedProbes: built.unresolved,
  };
};

const rootPicker =
  (ownerId: string): ArtifactsPicker =>
  (manifest) => {
    const row = (Array.isArray(manifest.owners) ? manifest.owners : []).find(
      (item) => isRecord(item) && item.id === ownerId,
    );
    return isRecord(row) && isRecord(row.artifacts) ? row.artifacts : undefined;
  };

const skillPicker: ArtifactsPicker = (manifest) =>
  isRecord(manifest.artifacts) ? manifest.artifacts : undefined;

const updateManifest = async (
  fileSystem: BuildSystem,
  path: string,
  write: boolean,
  edit: (manifest: Record<string, unknown>) => Promise<boolean>,
): Promise<boolean> => {
  const text = await fileSystem.readFile(path, 'utf8');
  const manifest = JSON.parse(text) as Record<string, unknown>;
  if (`${JSON.stringify(manifest, null, 2)}\n` !== text) {
    throw new Error(`Manifest does not round-trip byte-identically: ${path}`);
  }
  if (!(await edit(manifest))) {
    return false;
  }
  if (write) {
    await fileSystem.writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  return true;
};

const syncManifests = async (
  fileSystem: BuildSystem,
  root: string,
  owner: OwnerEntry,
  maps: readonly string[],
  write: boolean,
): Promise<readonly string[]> => {
  const rootPath = `${root}/evals/manifest.json`;
  const skillPath = `${root}/${owner.directory}manifest.json`;
  const edits: readonly (readonly [string, (m: Record<string, unknown>) => Promise<boolean>])[] = [
    [rootPath, editAtomList(rootPicker(owner.id), maps, rootPath)],
    ...(owner.id === 'root'
      ? []
      : ([
          [skillPath, editAtomList(skillPicker, maps, skillPath)],
          [skillPath, editSourceHashes(fileSystem, root)],
        ] as const)),
  ];
  const changed: string[] = [];
  for (const [path, edit] of edits) {
    if (await updateManifest(fileSystem, path, write, edit)) {
      changed.push(path.replace(`${root}/`, ''));
    }
  }
  return changed;
};

export const rebuildAtomMaps = async (
  fileSystem: BuildSystem,
  root: string,
  options: { readonly ownerId?: string; readonly write: boolean },
): Promise<BuildReport> => {
  const owners = ownersOf(
    await readJson(fileSystem, `${root}/evals/manifest.json`),
    options.ownerId,
  );
  const maps: BuildMapReport[] = [];
  const manifests: string[] = [];
  const coveragePath = `${root}/evals/coverage-map.json`;
  const ranges = (await fileSystem.exists(coveragePath))
    ? ruleRangesOf(await readJson(fileSystem, coveragePath))
    : [];
  for (const owner of owners) {
    const reports: BuildMapReport[] = [];
    for (const setPath of owner.sets) {
      reports.push(await buildOwnerMap(fileSystem, root, owner, setPath, options.write, ranges));
    }
    maps.push(...reports);
    const paths = reports.map((report) => report.path);
    manifests.push(...(await syncManifests(fileSystem, root, owner, paths, options.write)));
  }
  const mapped = new Set(maps.flatMap((map) => map.mappedCases));
  const unmappedCases = [...new Set(ranges.map(({ caseId }) => caseId))].filter(
    (caseId) => !mapped.has(caseId),
  );
  return { manifests: [...new Set(manifests)], maps, unmappedCases, written: options.write };
};
