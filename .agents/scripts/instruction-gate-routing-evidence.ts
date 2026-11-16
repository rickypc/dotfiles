import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Fingerprint, GateDependencies, Measurement } from './instruction-gate.js';
import { routingReceiptPathFor } from './instruction-gate-paths.js';

export const CATALOG_MANIFEST_PATH = 'evals/skills/_catalog/manifest.json';
export const CATALOG_OWNER_ID = 'skill-catalog';
export const CATALOG_RUNS_DIRECTORY =
  'os.tmpdir()/agents-evaluation-runs/{repositoryId}/{ownerId}/{runId}/';

export interface CatalogEvidenceRuntime {
  readonly currentFingerprint: (routing?: boolean) => Fingerprint;
  readonly fingerprintMatches: (left: Fingerprint, right: Fingerprint) => boolean;
}

export interface CatalogManifest {
  readonly activationRuns?: number;
  readonly artifacts: {
    readonly activationReceipt: string;
    readonly ledger: string;
    readonly runsDirectory: string;
  };
  readonly inputs: {
    readonly activationSets: readonly { readonly path: string; readonly skill: string }[];
  };
  readonly inventory: { readonly skills: number };
  readonly manifestVersion: number;
  readonly migratedBaseline?: {
    readonly receiptPath: string;
    readonly receiptSha256: string;
    readonly runId: string;
  };
  readonly ownerId: string;
  readonly requiredLanes: readonly string[];
  readonly schemaVersion: number;
  readonly scope: string;
  readonly sources: readonly { readonly skill: string; readonly sourcePath: string }[];
}

export interface CatalogRunArtifacts {
  readonly readerGenerationSummary: ReaderGenerationSummary;
  readonly recordedAt: string;
  readonly runId: string;
  readonly runPath: string;
  readonly runSha256: string;
  readonly runText: string;
}

export interface CatalogRunCreationInputs extends CatalogStabilityInputs {
  readonly catalogManifestPath: string;
}

export interface CatalogRunReference {
  readonly activationRuns: number;
  readonly fingerprint: Fingerprint;
  readonly manifestPath: string;
  readonly manifestSha256: string;
  readonly measurement: {
    readonly trainFailed: number;
    readonly trainPassed: number;
    readonly trainTotal: number;
    readonly validationPassed: number;
    readonly validationTotal: number;
  };
  readonly ownerId: string;
  readonly readerGenerations: readonly ReaderGeneration[];
  readonly receiptPath: string;
  readonly recordedAt: string;
  readonly runId: string;
  readonly schema: 2;
  readonly selfSha256: string;
  readonly setFingerprint: string;
  readonly sourceFingerprint: string;
}

export interface CatalogStabilityInputs {
  readonly catalogHash: string;
  readonly catalogLedgerEntries: readonly Record<string, unknown>[];
  readonly catalogManifest: CatalogManifest;
  readonly catalogManifestSha256: string;
  readonly setSha: string;
  readonly skills: readonly string[];
}

export interface ReaderGeneration {
  readonly answerRows: number;
  readonly answersSha256: string;
  readonly bundleSha256: string;
  readonly distinctQueryCount: number;
  readonly freshGeneration: true;
  readonly generatedQueryCount: number;
  readonly logSha256: string;
  readonly modelRevision: string;
  readonly promptRows: number;
  readonly readerInvocationId: string;
  readonly runtimeBundleSha256: string;
  readonly skill: string;
}

export interface ReaderGenerationSummary {
  readonly count: number;
  readonly evidenceSha256: string;
  readonly freshCount: number;
}

export interface RoutingMeasuredEvidence {
  readonly answers: string;
  readonly bundle: string;
  readonly readerLog: string;
  readonly skill: string;
  readonly work: string;
}

const catalogLedgerEntryProblem = (
  entry: Record<string, unknown> | undefined,
  index: number,
  seen: ReadonlySet<string>,
  manifest: CatalogManifest,
): string | undefined => {
  const runId = entry?.runId;
  if (
    entry === undefined
    || entry.schema !== 1
    || entry.ownerId !== CATALOG_OWNER_ID
    || typeof runId !== 'string'
    || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(runId)
    || seen.has(runId)
    || typeof entry.kind !== 'string'
    || typeof entry.receiptPath !== 'string'
    || entry.receiptPath !== manifest.artifacts.activationReceipt
    || typeof entry.receiptSha256 !== 'string'
    || entry.manifestPath !== CATALOG_MANIFEST_PATH
    || typeof entry.manifestSha256 !== 'string'
  ) {
    return `Catalog ledger line ${index + 1} is malformed or duplicates a run id.`;
  }
  return undefined;
};

const generationsForSkill = (
  skill: string,
  runs: readonly Record<string, unknown>[],
): ReaderGeneration[] =>
  runs.flatMap((run) =>
    (run.readerGenerations as ReaderGeneration[]).filter((item) => item.skill === skill),
  );

const gpuLogIdentity = (
  log: string,
  promptCount: number,
  distinctQueryCount: number,
  fingerprint: Fingerprint,
  skill: string,
): { readonly modelRevision: string; readonly runtimeBundleSha256: string } | string => {
  const gpuLines = log
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes('GPU ready;'));
  if (gpuLines.length !== 1) {
    return `Catalog run needs exactly one successful GPU-ready log line for ${skill}.`;
  }
  const logMatch =
    /^(?:\[weak-reader\]\s*)?GPU ready; .*?answered (\d+) probes from (\d+) queries; .*?model revision ([a-f0-9]+); runtime bundle ([a-f0-9]+)$/u.exec(
      gpuLines[0] ?? '',
    );
  if (
    logMatch === null
    || Number(logMatch[1]) !== promptCount
    || Number(logMatch[2]) !== distinctQueryCount
    || logMatch[3] !== fingerprint.modelRevision
    || logMatch[4] !== fingerprint.bundleSha256
  ) {
    return `Catalog run GPU log counts or model identity do not match the current bundle for ${skill}.`;
  }
  return { modelRevision: logMatch[3], runtimeBundleSha256: logMatch[4] };
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const answerRows = (text: string, skill: string): readonly Record<string, unknown>[] | string => {
  const answers: Record<string, unknown>[] = [];
  try {
    for (const line of text.split(/\r?\n/u).filter((item) => item.trim() !== '')) {
      const answer: unknown = JSON.parse(line);
      if (!isRecord(answer)) {
        return `Catalog run has a malformed answer row for ${skill}.`;
      }
      answers.push(answer);
    }
    return answers;
  } catch {
    return `Catalog run has a malformed answer JSONL file for ${skill}.`;
  }
};

const answersMatchPrompts = (
  prompts: readonly unknown[],
  answers: readonly Record<string, unknown>[],
  skill: string,
): string | undefined => {
  if (answers.length !== prompts.length) {
    return `Catalog run prompt and answer row counts differ for ${skill} (${prompts.length}/${answers.length}).`;
  }
  for (const [index, prompt] of prompts.entries()) {
    const answer = answers[index];
    if (
      !isRecord(prompt)
      || answer?.query_id !== prompt.query_id
      || answer?.run !== prompt.run
      || typeof answer?.skill_name !== 'string'
    ) {
      return `Catalog run answer rows do not match prompt order for ${skill}.`;
    }
  }
  return undefined;
};

export const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  return isRecord(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonicalize(value[key])]),
      )
    : value;
};

const exactManifestRows = (
  actual: unknown,
  expected: readonly { readonly path: string; readonly skill: string }[],
  pathKey: string,
): boolean =>
  Array.isArray(actual)
  && actual.length === expected.length
  && actual.every(
    (entry, index) =>
      isRecord(entry)
      && entry.skill === expected[index]?.skill
      && entry[pathKey] === expected[index]?.path,
  );

const fingerprintIsCurrent = (
  value: unknown,
  expected: Fingerprint,
  runtime: CatalogEvidenceRuntime,
): boolean =>
  isRecord(value)
  && typeof value.bundleSha256 === 'string'
  && typeof value.maxNewTokens === 'number'
  && typeof value.modelRevision === 'string'
  && typeof value.readerVersion === 'string'
  && runtime.fingerprintMatches(value as unknown as Fingerprint, expected);

const activationRunFingerprintMatches = (
  entry: Record<string, unknown>,
  run: Record<string, unknown>,
  inputs: CatalogStabilityInputs,
  requiredRuns: number,
  fingerprint: Fingerprint,
  runtime: CatalogEvidenceRuntime,
): boolean =>
  entry.manifestSha256 === inputs.catalogManifestSha256
  && isRecord(entry.fingerprints)
  && entry.fingerprints.activationQueriesSha256 === inputs.setSha
  && entry.fingerprints.catalogDescriptionsSha256 === inputs.catalogHash
  && run.manifestSha256 === inputs.catalogManifestSha256
  && run.activationRuns === requiredRuns
  && run.sourceFingerprint === inputs.catalogHash
  && run.setFingerprint === inputs.setSha
  && fingerprintIsCurrent(run.fingerprint, fingerprint, runtime);

const isValidActivationRunCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 3;

const latestActivationEntries = (
  entries: readonly Record<string, unknown>[],
  requiredRuns: number,
): readonly Record<string, unknown>[] =>
  entries.filter((entry) => entry.kind === 'activation-run').slice(-requiredRuns);

const manifestArtifactsMatch = (value: unknown): value is Record<string, unknown> =>
  isRecord(value)
  && value.activationReceipt === routingReceiptPathFor(true)
  && value.ledger === 'evals/skills/_catalog/ledger.jsonl'
  && value.runsDirectory === CATALOG_RUNS_DIRECTORY;

const migratedBaselineIsValid = (value: unknown): boolean =>
  value === undefined
  || (isRecord(value)
    && typeof value.runId === 'string'
    && typeof value.receiptPath === 'string'
    && typeof value.receiptSha256 === 'string');

export const catalogManifestOf = (
  value: Record<string, unknown>,
  skills: readonly string[],
): CatalogManifest | string => {
  const artifacts = value.artifacts;
  const inputs = value.inputs;
  const inventory = value.inventory;
  const expectedSources = skills.map((skill) => ({ path: `skills/${skill}/SKILL.md`, skill }));
  const expectedSets = skills.map((skill) => ({
    path: `evals/skills/${skill}/trigger-queries.json`,
    skill,
  }));
  const lanes = value.requiredLanes;
  const activationRuns = value.activationRuns;
  if (activationRuns !== undefined && !isValidActivationRunCount(activationRuns)) {
    return 'Catalog manifest activationRuns must be a safe integer of at least 3.';
  }
  if (
    value.manifestVersion !== 1
    || value.schemaVersion !== 2
    || value.ownerId !== CATALOG_OWNER_ID
    || value.scope !== 'evals/skills/_catalog/'
    || !Array.isArray(lanes)
    || lanes.length !== 1
    || lanes[0] !== 'activation'
    || !manifestArtifactsMatch(artifacts)
    || !isRecord(inputs)
    || !isRecord(inventory)
    || inventory.skills !== skills.length
    || !exactManifestRows(value.sources, expectedSources, 'sourcePath')
    || !exactManifestRows(inputs.activationSets, expectedSets, 'path')
  ) {
    return 'Catalog manifest owner, required lane, skill inventory, or central artifact paths do not match active skills.';
  }
  if (!migratedBaselineIsValid(value.migratedBaseline)) {
    return 'Catalog manifest has a malformed migrated-baseline binding.';
  }
  return value as unknown as CatalogManifest;
};

const migratedBaselineProblem = (
  manifest: CatalogManifest,
  manifestSha256: string,
  entries: readonly Record<string, unknown>[],
): string | undefined => {
  const baseline = manifest.migratedBaseline;
  if (baseline === undefined) {
    return undefined;
  }
  const entry = entries.find((item) => item.runId === baseline.runId);
  return entry === undefined
    || entry.kind !== 'migrated-baseline'
    || entry.receiptPath !== baseline.receiptPath
    || entry.receiptSha256 !== baseline.receiptSha256
    || entry.manifestSha256 !== manifestSha256
    ? 'Catalog ledger does not contain the manifest-declared migrated baseline.'
    : undefined;
};

const nextRunId = (recordedAt: string, entries: readonly Record<string, unknown>[]): string => {
  const existing = new Set(
    entries.flatMap((entry) => (typeof entry.runId === 'string' ? [entry.runId] : [])),
  );
  const prefix = `activation-${recordedAt.replace(/\D/gu, '').slice(0, 17)}`;
  let sequence = 1;
  while (existing.has(`${prefix}-${sequence}`)) {
    sequence += 1;
  }
  return `${prefix}-${sequence}`;
};

export const objectFromJson = (text: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const promptQueries = (value: unknown, skill: string): readonly string[] | string => {
  if (!Array.isArray(value) || value.length === 0) {
    return `Catalog run bundle has no prompt rows for ${skill}.`;
  }
  const queries: string[] = [];
  for (const prompt of value) {
    if (
      !isRecord(prompt)
      || typeof prompt.query !== 'string'
      || prompt.query.trim() === ''
      || typeof prompt.query_id !== 'string'
      || typeof prompt.run !== 'number'
    ) {
      return `Catalog run bundle has a malformed prompt row for ${skill}.`;
    }
    queries.push(prompt.query);
  }
  return queries;
};

const promptRows = (bundleText: string, skill: string): readonly unknown[] | string => {
  const bundle = objectFromJson(bundleText);
  return bundle === undefined
    ? `Catalog run bundle is malformed JSON for ${skill}.`
    : Array.isArray(bundle.prompts)
      ? bundle.prompts
      : `Catalog run bundle has no prompt rows for ${skill}.`;
};

const readerGenerationFieldsAreValid = (candidate: Record<string, unknown>): boolean =>
  candidate.freshGeneration === true
  && typeof candidate.readerInvocationId === 'string'
  && candidate.readerInvocationId.trim() !== ''
  && typeof candidate.bundleSha256 === 'string'
  && candidate.bundleSha256 !== ''
  && typeof candidate.answersSha256 === 'string'
  && candidate.answersSha256 !== ''
  && typeof candidate.logSha256 === 'string'
  && candidate.logSha256 !== ''
  && typeof candidate.modelRevision === 'string'
  && candidate.modelRevision !== ''
  && typeof candidate.runtimeBundleSha256 === 'string'
  && candidate.runtimeBundleSha256 !== ''
  && typeof candidate.promptRows === 'number'
  && Number.isSafeInteger(candidate.promptRows)
  && candidate.promptRows >= 1
  && candidate.answerRows === candidate.promptRows
  && typeof candidate.distinctQueryCount === 'number'
  && Number.isSafeInteger(candidate.distinctQueryCount)
  && candidate.distinctQueryCount >= 1
  && candidate.distinctQueryCount <= candidate.promptRows
  && candidate.generatedQueryCount === candidate.distinctQueryCount;

const readerGenerationIdentityMatches = (
  run: Record<string, unknown>,
  fingerprint: Fingerprint,
  requiredRuns: number,
): boolean =>
  Array.isArray(run.readerGenerations)
  && run.readerGenerations.length > 0
  && (run.readerGenerations as ReaderGeneration[]).every(
    (generation) =>
      generation.modelRevision === fingerprint.modelRevision
      && generation.runtimeBundleSha256 === fingerprint.bundleSha256,
  )
  && requiredRuns >= 3;

const readerGenerationProblem = (
  candidate: Record<string, unknown>,
  skills: readonly string[],
  seenSkills: ReadonlySet<string>,
  seenInvocations: ReadonlySet<string>,
): string | undefined => {
  const skill = candidate.skill;
  if (typeof skill !== 'string' || !skills.includes(skill) || seenSkills.has(skill)) {
    return 'Catalog run has missing, unknown, or duplicate per-skill generation evidence.';
  }
  if (
    candidate.freshGeneration !== true
    || (typeof candidate.readerInvocationId === 'string'
      && seenInvocations.has(candidate.readerInvocationId))
  ) {
    return `Catalog run has no distinct successful fresh generation for ${skill}.`;
  }
  return readerGenerationFieldsAreValid(candidate)
    ? undefined
    : `Catalog run has incomplete generation hashes or counts for ${skill}.`;
};

export const readerGenerationsProblem = (
  value: unknown,
  skills: readonly string[],
): string | undefined => {
  if (!Array.isArray(value) || value.length !== skills.length) {
    const count = Array.isArray(value) ? value.length : 0;
    return `Catalog run does not contain fresh-process evidence for every skill (${count}/${skills.length}).`;
  }
  const seenSkills = new Set<string>();
  const seenInvocations = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      return 'Catalog run has malformed per-skill generation evidence.';
    }
    const problem = readerGenerationProblem(candidate, skills, seenSkills, seenInvocations);
    if (problem !== undefined) {
      return problem;
    }
    seenSkills.add(candidate.skill as string);
    seenInvocations.add(candidate.readerInvocationId as string);
  }
  return undefined;
};

export const readerGenerationSummaryFor = (
  readerGenerations: readonly ReaderGeneration[],
  sha256: GateDependencies['sha256'],
): ReaderGenerationSummary => ({
  count: readerGenerations.length,
  evidenceSha256: sha256(JSON.stringify(canonicalize(readerGenerations))),
  freshCount: readerGenerations.filter((item) => item.freshGeneration).length,
});

const readerInvocationId = (workPath: string, skill: string): string => {
  const invocationId = path.basename(workPath);
  return invocationId === '' || invocationId === '.' || invocationId === path.sep
    ? `Catalog run has no unique temporary invocation id for ${skill}.`
    : invocationId;
};

const readerGenerationFor = async (
  part: RoutingMeasuredEvidence,
  fingerprint: Fingerprint,
  deps: GateDependencies,
): Promise<ReaderGeneration | string> => {
  const [bundleText, answersText] = await Promise.all([
    deps.readText(part.bundle),
    deps.readText(part.answers),
  ]);
  if (bundleText === undefined || answersText === undefined) {
    return `Catalog run is missing the bundle or answer artifact for ${part.skill}.`;
  }
  const prompts = promptRows(bundleText, part.skill);
  if (typeof prompts === 'string') {
    return prompts;
  }
  const queries = promptQueries(prompts, part.skill);
  if (typeof queries === 'string') {
    return queries;
  }
  const answers = answerRows(answersText, part.skill);
  if (typeof answers === 'string') {
    return answers;
  }
  const mismatch = answersMatchPrompts(prompts, answers, part.skill);
  if (mismatch !== undefined) {
    return mismatch;
  }
  const distinctQueryCount = new Set(queries).size;
  const logIdentity = gpuLogIdentity(
    part.readerLog,
    prompts.length,
    distinctQueryCount,
    fingerprint,
    part.skill,
  );
  if (typeof logIdentity === 'string') {
    return logIdentity;
  }
  const invocationId = readerInvocationId(part.work, part.skill);
  if (invocationId.startsWith('Catalog run ')) {
    return invocationId;
  }
  return {
    answerRows: answers.length,
    answersSha256: deps.sha256(answersText),
    bundleSha256: deps.sha256(bundleText),
    distinctQueryCount,
    freshGeneration: true,
    generatedQueryCount: distinctQueryCount,
    logSha256: deps.sha256(part.readerLog),
    modelRevision: logIdentity.modelRevision,
    promptRows: prompts.length,
    readerInvocationId: invocationId,
    runtimeBundleSha256: logIdentity.runtimeBundleSha256,
    skill: part.skill,
  };
};

export const readerGenerationsFor = async (
  skills: readonly string[],
  parts: readonly RoutingMeasuredEvidence[],
  fingerprint: Fingerprint,
  deps: GateDependencies,
): Promise<readonly ReaderGeneration[] | string> => {
  const evidence = await Promise.all(
    parts.map((part) => readerGenerationFor(part, fingerprint, deps)),
  );
  const failed = evidence.find((item): item is string => typeof item === 'string');
  if (failed !== undefined) {
    return failed;
  }
  const generations = evidence as readonly ReaderGeneration[];
  return readerGenerationsProblem(generations, skills) ?? generations;
};

export const repositoryIdFor = (agentsRoot: string): string => {
  const resolvedRoot = path.resolve(agentsRoot);
  const repositoryId = resolvedRoot
    .slice(path.parse(resolvedRoot).root.length)
    .replace(/[\\/:]+/gu, '-');
  return repositoryId || 'root';
};

const runReferenceMatchesLedger = (
  entry: Record<string, unknown>,
  run: Record<string, unknown> | undefined,
  runId: string,
): run is Record<string, unknown> =>
  run !== undefined
  && (run.schema === 1 || run.schema === 2)
  && run.ownerId === CATALOG_OWNER_ID
  && run.runId === runId
  && run.receiptPath === entry.receiptPath
  && run.manifestPath === CATALOG_MANIFEST_PATH
  && run.manifestSha256 === entry.manifestSha256;

const runReferenceSealMatches = (
  entry: Record<string, unknown>,
  run: Record<string, unknown>,
  text: string,
  deps: GateDependencies,
): boolean => {
  const unsigned = { ...run };
  const selfSha256 = unsigned.selfSha256;
  delete unsigned.selfSha256;
  return (
    typeof entry.runReferenceSha256 === 'string'
    && deps.sha256(text) === entry.runReferenceSha256
    && typeof selfSha256 === 'string'
    && deps.sha256(JSON.stringify(canonicalize(unsigned))) === selfSha256
  );
};

const runReferenceSealProblem = (
  entry: Record<string, unknown>,
  run: Record<string, unknown>,
  runText: string,
  runId: string,
  deps: GateDependencies,
): string | undefined => {
  if (typeof entry.runReferenceSha256 !== 'string') {
    return entry.kind === 'migrated-baseline' && run.receiptSha256 === entry.receiptSha256
      ? undefined
      : `Catalog ledger run ${runId} has no sealed run-reference hash.`;
  }
  const unsigned = { ...run };
  const selfSha256 = unsigned.selfSha256;
  delete unsigned.selfSha256;
  return deps.sha256(runText) === entry.runReferenceSha256
    && typeof selfSha256 === 'string'
    && deps.sha256(JSON.stringify(canonicalize(unsigned))) === selfSha256
    ? undefined
    : `Catalog run reference ${runId} has a mismatched hash or seal.`;
};

export const runReferenceTextFor = (
  agentsRoot: string,
  manifest: CatalogManifest,
  runId: string,
): string => {
  const relativeRunDirectory = manifest.artifacts.runsDirectory
    .replace(/^os\.tmpdir\(\)\//u, '')
    .replace('{repositoryId}', repositoryIdFor(agentsRoot))
    .replace('{ownerId}', manifest.ownerId)
    .replace('{runId}', runId);
  return path.join(tmpdir(), relativeRunDirectory, 'run.json');
};

const activationRunFor = async (
  entry: Record<string, unknown>,
  inputs: CatalogStabilityInputs,
  requiredRuns: number,
  fingerprint: Fingerprint,
  deps: GateDependencies,
  runtime: CatalogEvidenceRuntime,
): Promise<Record<string, unknown> | string> => {
  const runId = typeof entry.runId === 'string' ? entry.runId : '';
  const runText = await deps.readText(
    runReferenceTextFor(deps.agentsRoot, inputs.catalogManifest, runId),
  );
  const run = runText === undefined ? undefined : objectFromJson(runText);
  if (run === undefined || run.schema !== 2) {
    return `The latest ${requiredRuns} catalog activation entries must all use fresh schema-2 run references.`;
  }
  if (!runReferenceSealMatches(entry, run, runText ?? '', deps)) {
    return `Catalog run reference ${runId} changed after its ledger entry was verified.`;
  }
  if (!activationRunFingerprintMatches(entry, run, inputs, requiredRuns, fingerprint, runtime)) {
    return `The latest ${requiredRuns} catalog activation runs must match the current source, sets, manifest, and model fingerprint.`;
  }
  return readerGenerationIdentityMatches(run, fingerprint, requiredRuns)
    ? run
    : `One of the latest ${requiredRuns} catalog activation runs (${runId}) contains stale reader identity evidence.`;
};

export const catalogRunArtifacts = (
  inputs: CatalogRunCreationInputs,
  measurement: Measurement,
  readerGenerations: readonly ReaderGeneration[],
  receiptPath: string,
  deps: GateDependencies,
  runtime: CatalogEvidenceRuntime,
): CatalogRunArtifacts => {
  const manifest = inputs.catalogManifest;
  const recordedAt = deps.now().toISOString();
  const runId = nextRunId(recordedAt, inputs.catalogLedgerEntries);
  const unsigned: Omit<CatalogRunReference, 'selfSha256'> = {
    activationRuns: manifest.activationRuns ?? 5,
    fingerprint: runtime.currentFingerprint(true),
    manifestPath: inputs.catalogManifestPath,
    manifestSha256: inputs.catalogManifestSha256,
    measurement: {
      trainFailed: measurement.trainFailed.length,
      trainPassed: measurement.trainPassed.length,
      trainTotal: measurement.trainFailed.length + measurement.trainPassed.length,
      validationPassed: measurement.validationPassed,
      validationTotal: measurement.validationTotal,
    },
    ownerId: CATALOG_OWNER_ID,
    readerGenerations,
    receiptPath,
    recordedAt,
    runId,
    schema: 2,
    setFingerprint: inputs.setSha,
    sourceFingerprint: inputs.catalogHash,
  };
  const run = canonicalize({
    ...unsigned,
    selfSha256: deps.sha256(JSON.stringify(canonicalize(unsigned))),
  });
  const runText = `${JSON.stringify(run, null, 2)}\n`;
  const runPath = runReferenceTextFor(deps.agentsRoot, manifest, runId);
  return {
    readerGenerationSummary: readerGenerationSummaryFor(readerGenerations, deps.sha256),
    recordedAt,
    runId,
    runPath,
    runSha256: deps.sha256(runText),
    runText,
  };
};

const runSummaryMatchesLedger = (
  summary: unknown,
  generations: readonly unknown[],
  deps: GateDependencies,
): boolean => {
  if (!isRecord(summary)) {
    return false;
  }
  const expected = readerGenerationSummaryFor(
    generations as unknown as readonly ReaderGeneration[],
    deps.sha256,
  );
  return (
    summary.count === expected.count
    && summary.freshCount === expected.freshCount
    && summary.evidenceSha256 === expected.evidenceSha256
  );
};

const skillInvocationProblem = (
  skill: string,
  generations: readonly ReaderGeneration[],
  requiredRuns: number,
): string | undefined =>
  new Set(generations.map((generation) => generation.readerInvocationId)).size === requiredRuns
    ? undefined
    : `Catalog activation for ${skill} needs ${requiredRuns} distinct reader invocations.`;

const skillStabilityProblems = (
  skills: readonly string[],
  runs: readonly Record<string, unknown>[],
  requiredRuns: number,
): string[] => {
  const invocationIds = new Set<string>();
  for (const skill of skills) {
    const present = generationsForSkill(skill, runs);
    const invocationProblem = skillInvocationProblem(skill, present, requiredRuns);
    if (invocationProblem !== undefined) {
      return [invocationProblem];
    }
    for (const generation of present) {
      invocationIds.add(generation.readerInvocationId);
    }
    if (new Set(present.map((generation) => generation.answersSha256)).size !== 1) {
      return [
        `Catalog activation answers for ${skill} do not match across ${requiredRuns} distinct invocations.`,
      ];
    }
    if (new Set(present.map((generation) => generation.bundleSha256)).size !== 1) {
      return [
        `Catalog activation bundles for ${skill} do not match across ${requiredRuns} distinct invocations.`,
      ];
    }
  }
  return invocationIds.size === skills.length * requiredRuns
    ? []
    : [
        `Catalog activation stability requires globally unique reader invocations across all ${requiredRuns} runs and skills.`,
      ];
};

export const catalogActivationStabilityProblems = async (
  inputs: CatalogStabilityInputs,
  deps: GateDependencies,
  runtime: CatalogEvidenceRuntime,
): Promise<string[]> => {
  const requiredRuns = inputs.catalogManifest.activationRuns ?? 5;
  const latest = latestActivationEntries(inputs.catalogLedgerEntries, requiredRuns);
  if (latest.length < requiredRuns) {
    return [
      `Catalog activation stability needs ${requiredRuns} fresh runs; found ${latest.length}/${requiredRuns}.`,
    ];
  }
  const fingerprint = runtime.currentFingerprint(true);
  const runs: Record<string, unknown>[] = [];
  for (const entry of latest) {
    const verified = await activationRunFor(
      entry,
      inputs,
      requiredRuns,
      fingerprint,
      deps,
      runtime,
    );
    if (typeof verified === 'string') {
      return [verified];
    }
    runs.push(verified);
  }
  return skillStabilityProblems(inputs.skills, runs, requiredRuns);
};

const validateSchemaTwoRun = (
  entry: Record<string, unknown>,
  run: Record<string, unknown>,
  manifest: CatalogManifest,
  runId: string,
  deps: GateDependencies,
): string | undefined => {
  if (run.schema !== 2) {
    return undefined;
  }
  if (run.activationRuns !== (manifest.activationRuns ?? 5)) {
    return `Catalog run reference ${runId} does not match manifest activationRuns=${manifest.activationRuns ?? 5}.`;
  }
  const generations = run.readerGenerations;
  if (!Array.isArray(generations)) {
    return `Catalog run reference ${runId} has no per-skill generation evidence.`;
  }
  const evidenceProblem = readerGenerationsProblem(
    generations,
    manifest.sources.map((source) => source.skill),
  );
  if (evidenceProblem !== undefined) {
    return `Catalog run reference ${runId}: ${evidenceProblem}`;
  }
  return runSummaryMatchesLedger(entry.readerGenerationSummary, generations, deps)
    ? undefined
    : `Catalog run reference ${runId} does not match its ledger generation summary.`;
};

const catalogRunReferenceProblem = async (
  entry: Record<string, unknown>,
  manifest: CatalogManifest,
  deps: GateDependencies,
): Promise<string | undefined> => {
  const runId = entry.runId as string;
  const runText = await deps.readText(runReferenceTextFor(deps.agentsRoot, manifest, runId));
  const run = runText === undefined ? undefined : objectFromJson(runText);
  if (!runReferenceMatchesLedger(entry, run, runId)) {
    return `Catalog ledger run ${runId} has no matching readable run reference.`;
  }
  const sealProblem = runReferenceSealProblem(entry, run, runText ?? '', runId, deps);
  if (sealProblem !== undefined) {
    return sealProblem;
  }
  return validateSchemaTwoRun(entry, run, manifest, runId, deps);
};

export const catalogLedgerEntriesOf = async (
  text: string,
  manifest: CatalogManifest,
  manifestSha256: string,
  deps: GateDependencies,
): Promise<readonly Record<string, unknown>[] | string> => {
  const entries: Record<string, unknown>[] = [];
  const runIds = new Set<string>();
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  for (const [index, line] of lines.entries()) {
    const entry = objectFromJson(line);
    const malformed = catalogLedgerEntryProblem(entry, index, runIds, manifest);
    if (malformed !== undefined || entry === undefined) {
      return malformed ?? `Catalog ledger line ${index + 1} is malformed.`;
    }
    const referenceProblem = await catalogRunReferenceProblem(entry, manifest, deps);
    if (referenceProblem !== undefined) {
      return referenceProblem;
    }
    runIds.add(entry.runId as string);
    entries.push(entry);
  }
  return migratedBaselineProblem(manifest, manifestSha256, entries) ?? entries;
};
