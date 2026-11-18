import { homedir } from 'node:os';
import { basename, extname, join, relative, resolve, sep } from 'node:path';

import type { FileSystem } from '../filesystem.js';
import { fingerprint } from '../quality-engine/packet.js';

interface CentralArtifacts extends Record<string, unknown> {
  readonly comprehension: readonly unknown[];
}

interface CentralManifest {
  readonly artifacts: CentralArtifacts;
  readonly fingerprints: {
    readonly activationQueriesSha256: string;
    readonly casesSha256: string;
    readonly sourceRubricSha256: string;
  };
  readonly sourceRubric: string;
  readonly sources: readonly unknown[];
}

interface ComprehensionSet {
  readonly queryCount: number;
  readonly queryIds: readonly string[];
  readonly setPath: string;
  readonly sourcePath: string;
  readonly subject: string;
}

export interface SkillEvaluationPaths {
  readonly central: boolean;
  readonly comprehensionSets: readonly {
    readonly queryCount: number;
    readonly queryIds: readonly string[];
    readonly setPath: string;
    readonly sourcePath: string;
    readonly subject: string;
  }[];
  readonly fingerprints?: {
    readonly activationQueriesSha256: string;
    readonly casesSha256: string;
    readonly sourceRubricSha256: string;
  };
  readonly matrixPaths: readonly string[];
  readonly rubricPath: string;
  readonly triggerQueriesPath: string;
}

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const agentsRootFor = (path: string): string | undefined => {
  const marker = '/.agents/';
  const index = path.indexOf(marker);
  if (index >= 0) {
    return path.slice(0, index + '/.agents'.length);
  }
  return path.endsWith('/.agents') ? path : undefined;
};

const assertAtomLane = (
  data: Record<string, unknown>,
  artifacts: CentralArtifacts,
  manifestPath: string,
  name: string,
): void => {
  const declared = Array.isArray(data.requiredLanes) && data.requiredLanes.includes('atoms');
  const maps = artifacts.atoms;
  if (declared !== (maps !== undefined)) {
    throw new Error(
      `Skill atoms lane and atoms artifacts must be declared together: ${manifestPath}`,
    );
  }
  if (maps === undefined) {
    return;
  }
  const prefix = `evals/skills/${name}/atoms/`;
  const valid =
    Array.isArray(maps)
    && maps.every(
      (path) => typeof path === 'string' && path.startsWith(prefix) && path.endsWith('.md'),
    )
    && new Set(maps).size === maps.length;
  if (!valid) {
    throw new Error(
      `Skill atom maps must be unique Markdown paths inside the owner scope: ${manifestPath}`,
    );
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const artifactsFor = (
  data: Record<string, unknown>,
  manifestPath: string,
  name: string,
): CentralArtifacts => {
  if (!isRecord(data.artifacts)) {
    throw new Error(`Skill central evaluation manifest has invalid artifacts: ${manifestPath}`);
  }
  const artifacts = data.artifacts;
  const casesRelative = `evals/skills/${name}/cases.jsonl`;
  const triggerRelative = `evals/skills/${name}/trigger-queries.json`;
  if (artifacts.cases !== casesRelative) {
    throw new Error(`Skill cases path must stay inside the central skill scope: ${manifestPath}`);
  }
  if (artifacts.activationQueries !== triggerRelative) {
    throw new Error(
      `Skill activation path must stay inside the central skill scope: ${manifestPath}`,
    );
  }
  if (!Array.isArray(artifacts.comprehension) || artifacts.comprehension.length === 0) {
    throw new Error(
      `Skill central manifest requires per-source comprehension sets: ${manifestPath}`,
    );
  }
  return artifacts as CentralArtifacts;
};

const fingerprintsFor = (data: Record<string, unknown>, manifestPath: string) => {
  if (!isRecord(data.fingerprints)) {
    throw new Error(`Skill central manifest requires input fingerprints: ${manifestPath}`);
  }
  const { activationQueriesSha256, casesSha256, sourceRubricSha256 } = data.fingerprints;
  if (
    typeof activationQueriesSha256 !== 'string'
    || typeof casesSha256 !== 'string'
    || typeof sourceRubricSha256 !== 'string'
  ) {
    throw new Error(`Skill central manifest has incomplete input fingerprints: ${manifestPath}`);
  }
  return { activationQueriesSha256, casesSha256, sourceRubricSha256 };
};

export const isWithin = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

const comprehensionSetFor = (
  root: string,
  scopeRoot: string,
  name: string,
  manifestPath: string,
  sourceByPath: ReadonlyMap<string, string>,
  seenSources: Set<string>,
  seenSets: Set<string>,
  item: unknown,
): ComprehensionSet => {
  if (!isRecord(item)) {
    throw new Error(`Skill comprehension entries must be objects: ${manifestPath}`);
  }
  const { sourcePath, setPath, queryCount, queryIds } = item;
  if (
    typeof sourcePath !== 'string'
    || typeof setPath !== 'string'
    || typeof queryCount !== 'number'
    || !Array.isArray(queryIds)
    || !queryIds.every((id) => typeof id === 'string')
    || !sourceByPath.has(sourcePath)
    || seenSources.has(sourcePath)
    || seenSets.has(setPath)
    || !setPath.startsWith(`evals/skills/${name}/comprehension/`)
    || !setPath.endsWith('.json')
  ) {
    throw new Error(
      `Skill comprehension path is missing, duplicate, or outside its owner scope: ${manifestPath}`,
    );
  }
  const setFile = resolve(root, setPath);
  if (!isWithin(setFile, scopeRoot)) {
    throw new Error(`Skill comprehension set escapes its owner scope: ${setPath}`);
  }
  seenSources.add(sourcePath);
  seenSets.add(setPath);
  return {
    queryCount,
    queryIds,
    setPath: setFile,
    sourcePath: resolve(root, sourcePath),
    subject: `${name}--${basename(setPath, '.json')}`,
  };
};

const comprehensionSetsFor = (
  root: string,
  scopeRoot: string,
  name: string,
  manifestPath: string,
  sourceByPath: ReadonlyMap<string, string>,
  artifacts: CentralArtifacts,
): readonly ComprehensionSet[] => {
  const entries = artifacts.comprehension;
  const seenSources = new Set<string>();
  const seenSets = new Set<string>();
  const sets = entries.map((item) =>
    comprehensionSetFor(
      root,
      scopeRoot,
      name,
      manifestPath,
      sourceByPath,
      seenSources,
      seenSets,
      item,
    ),
  );
  if (seenSources.size !== sourceByPath.size) {
    throw new Error(`Skill comprehension inventory is incomplete: ${manifestPath}`);
  }
  return sets;
};

export const markdownFilesUnder = async (
  fileSystem: Pick<FileSystem, 'readdir'>,
  directory: string,
): Promise<readonly string[]> => {
  const entries = (await fileSystem.readdir?.(directory, { withFileTypes: true })) ?? [];
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) {
        return markdownFilesUnder(fileSystem, child);
      }
      return extname(entry.name) === '.md' ? [child] : [];
    }),
  );
  return nested.flat().sort();
};

export const readOptional = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  path: string,
): Promise<string | undefined> => {
  try {
    return await fileSystem.readFile(path, 'utf8');
  } catch {
    return undefined;
  }
};

const jsonObjectFor = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  manifestPath: string,
): Promise<Record<string, unknown>> => {
  const manifestText = await readOptional(fileSystem, manifestPath);
  if (!manifestText?.trim()) {
    throw new Error(`Skill central evaluation manifest is missing: ${manifestPath}`);
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error(`Skill central evaluation manifest is invalid JSON: ${manifestPath}`);
  }
  if (!isRecord(manifest)) {
    throw new Error(`Skill central evaluation manifest must be an object: ${manifestPath}`);
  }
  return manifest;
};

const legacyPathsFor = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  skillPath: string,
): Promise<SkillEvaluationPaths> => {
  const evalsPath = join(skillPath, 'evals');
  const entries = await fileSystem.readdir?.(evalsPath, { withFileTypes: true });
  if (!entries) {
    throw new Error('Skill evaluation requires directory listing support.');
  }
  const matrixPaths = entries
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(evalsPath, entry.name))
    .sort();
  if (matrixPaths.length === 0) {
    throw new Error(`Skill has no evaluation matrix: ${evalsPath}`);
  }
  if (!matrixPaths.includes(join(evalsPath, 'cases.jsonl'))) {
    throw new Error(
      `Skill is missing its canonical evaluation matrix: ${join(evalsPath, 'cases.jsonl')}`,
    );
  }
  const rubricPath = join(evalsPath, 'rubric.md');
  if (!(await readOptional(fileSystem, rubricPath))?.trim()) {
    throw new Error(`Skill is missing a nonblank evaluation rubric: ${rubricPath}`);
  }
  return {
    central: false,
    comprehensionSets: [],
    matrixPaths,
    rubricPath,
    triggerQueriesPath: join(evalsPath, 'trigger-queries.json'),
  };
};

export const skillNameFor = (skillPath: string): string => {
  const name = basename(resolve(skillPath));
  if (!skillNamePattern.test(name)) {
    throw new Error('Skill directory names must use lowercase letters, digits, and hyphens.');
  }
  return name;
};

const sourceEntryFor = (
  item: unknown,
  sourceByPath: ReadonlyMap<string, string>,
  manifestPath: string,
): { readonly sourcePath: string; readonly sha256: string } => {
  if (!isRecord(item)) {
    throw new Error(`Skill source entries must be objects: ${manifestPath}`);
  }
  const { sourcePath, sha256 } = item;
  if (
    typeof sourcePath !== 'string'
    || typeof sha256 !== 'string'
    || sourceByPath.has(sourcePath)
  ) {
    throw new Error(`Skill source paths and fingerprints must be unique strings: ${manifestPath}`);
  }
  return { sha256, sourcePath };
};

const sourceMapFor = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  skillPath: string,
  agentsRoot: string,
  scopeRoot: string,
  manifestPath: string,
  sources: readonly unknown[],
  sourceRubric: string,
): Promise<Map<string, string>> => {
  const sourceByPath = new Map<string, string>();
  for (const item of sources) {
    const { sourcePath, sha256 } = sourceEntryFor(item, sourceByPath, manifestPath);
    const absolute = resolve(agentsRoot, sourcePath);
    if (!isWithin(absolute, scopeRoot) && !isWithin(absolute, resolve(skillPath))) {
      throw new Error(`Skill source path escapes its owner scope: ${sourcePath}`);
    }
    const sourceText = await fileSystem.readFile(absolute, 'utf8');
    if (fingerprint(sourceText) !== sha256) {
      throw new Error(`Skill source fingerprint is stale: ${sourcePath}`);
    }
    sourceByPath.set(sourcePath, sha256);
  }
  if (!sourceByPath.has(sourceRubric)) {
    throw new Error(`Skill local rubric source is not declared: ${sourceRubric}`);
  }
  const activeSkillMarkdown = (await markdownFilesUnder(fileSystem, skillPath))
    .filter((path) => !isWithin(path, join(skillPath, 'evals')))
    .map((path) => relative(agentsRoot, path).split(sep).join('/'));
  const expectedSources = [...activeSkillMarkdown, sourceRubric].sort();
  if (JSON.stringify([...sourceByPath.keys()].sort()) !== JSON.stringify(expectedSources)) {
    throw new Error(`Skill manifest source inventory is incomplete or stale: ${manifestPath}`);
  }
  return sourceByPath;
};

const sourceRubricFor = (
  data: Record<string, unknown>,
  manifestPath: string,
  name: string,
): string => {
  const sourceRubric = data.sourceRubric;
  if (
    data.manifestVersion !== 1
    || data.schemaVersion !== 2
    || data.ownerId !== `skill:${name}`
    || data.scope !== `evals/skills/${name}/`
    || data.sharedRubric !== 'evals/rubric.md'
    || sourceRubric !== `evals/skills/${name}/rubric.md`
  ) {
    throw new Error(
      `Skill central evaluation manifest does not match owner ${name}: ${manifestPath}`,
    );
  }
  return sourceRubric;
};

const centralManifestFor = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  manifestPath: string,
  name: string,
): Promise<CentralManifest> => {
  const data = await jsonObjectFor(fileSystem, manifestPath);
  const sourceRubric = sourceRubricFor(data, manifestPath, name);
  const artifacts = artifactsFor(data, manifestPath, name);
  assertAtomLane(data, artifacts, manifestPath, name);
  if (!Array.isArray(data.sources)) {
    throw new Error(
      `Skill central evaluation manifest requires a source inventory: ${manifestPath}`,
    );
  }
  return {
    artifacts,
    fingerprints: fingerprintsFor(data, manifestPath),
    sourceRubric,
    sources: data.sources,
  };
};

const centralPathsFor = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  skillPath: string,
  agentsRoot: string,
  name: string,
): Promise<SkillEvaluationPaths> => {
  const scopeRoot = join(agentsRoot, 'evals', 'skills', name);
  const manifestPath = join(scopeRoot, 'manifest.json');
  const manifest = await centralManifestFor(fileSystem, manifestPath, name);
  const sourceByPath = await sourceMapFor(
    fileSystem,
    skillPath,
    agentsRoot,
    scopeRoot,
    manifestPath,
    manifest.sources,
    manifest.sourceRubric,
  );
  const comprehensionSets = comprehensionSetsFor(
    agentsRoot,
    scopeRoot,
    name,
    manifestPath,
    sourceByPath,
    manifest.artifacts,
  );
  return {
    central: true,
    comprehensionSets,
    fingerprints: manifest.fingerprints,
    matrixPaths: [resolve(agentsRoot, `evals/skills/${name}/cases.jsonl`)],
    rubricPath: resolve(agentsRoot, 'evals/rubric.md'),
    triggerQueriesPath: resolve(agentsRoot, `evals/skills/${name}/trigger-queries.json`),
  };
};

export const skillEvaluationPathsFor = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  skillPath: string,
): Promise<SkillEvaluationPaths> => {
  const name = skillNameFor(skillPath);
  const agentsRoot = agentsRootFor(skillPath);
  if (!agentsRoot || resolve(agentsRoot) !== resolve(join(homedir(), '.agents'))) {
    return legacyPathsFor(fileSystem, skillPath);
  }
  return centralPathsFor(fileSystem, skillPath, agentsRoot, name);
};
