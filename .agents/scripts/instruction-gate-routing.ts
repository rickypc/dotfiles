import path from 'node:path';
import type {
  Baseline,
  Fingerprint,
  GateDependencies,
  Measurement,
  Receipt,
  RecordOptions,
  Verdict,
} from './instruction-gate.js';
import type { GateTarget } from './instruction-gate-paths.js';
import {
  DESCRIPTION_PREFIX,
  isGlobalAgentsRoot,
  ROUTING_TOKEN,
  routingReceiptPathFor,
  routingSkillTarget,
} from './instruction-gate-paths.js';
import type {
  CatalogManifest,
  ReaderGeneration,
  ReaderGenerationSummary,
} from './instruction-gate-routing-evidence.js';
import {
  CATALOG_MANIFEST_PATH,
  CATALOG_OWNER_ID,
  catalogActivationStabilityProblems,
  catalogLedgerEntriesOf,
  catalogManifestOf,
  catalogRunArtifacts,
  readerGenerationsFor,
} from './instruction-gate-routing-evidence.js';

type AcceptedRoutingCandidate = Omit<RoutingCandidate, 'verdict'> & {
  readonly verdict: Extract<Verdict, { readonly accepted: true }>;
};

interface CentralRoutingInputs extends RoutingInputsBase {
  readonly catalogLedgerEntries: readonly Record<string, unknown>[];
  readonly catalogLedgerPath: string;
  readonly catalogLedgerText: string;
  readonly catalogManifest: CatalogManifest;
  readonly catalogManifestPath: string;
  readonly catalogManifestSha256: string;
  readonly source: 'central';
}

interface PackageRoutingInputs extends RoutingInputsBase {
  readonly source: 'package';
}

type RoutingCandidate = Awaited<ReturnType<typeof evaluateRoutingCandidate>>;

type RoutingInputs = CentralRoutingInputs | PackageRoutingInputs;

interface RoutingInputsBase {
  readonly catalogHash: string;
  readonly setSha: string;
  readonly sets: ReadonlyMap<string, string>;
  readonly skills: readonly string[];
}

interface RoutingMeasured {
  readonly answers: string;
  readonly bundle: string;
  readonly measurement: Measurement;
  readonly rawReplies: string;
  readonly readerLog: string;
  readonly skill: string;
  readonly work: string;
}

export interface RoutingRuntime {
  readonly currentFingerprint: (routing?: boolean) => Fingerprint;
  readonly decide: (
    candidate: Measurement,
    baseline: Baseline | null,
    options: RecordOptions & { readonly aggregate?: boolean; readonly fingerprintChanged: boolean },
  ) => Verdict;
  readonly fingerprintMatches: (left: Fingerprint, right: Fingerprint) => boolean;
  readonly formatReceipt: (receipt: Receipt) => string;
  readonly measureDocument: (
    target: GateTarget,
    deps: GateDependencies,
  ) => Promise<Omit<RoutingMeasured, 'skill'>>;
  readonly recordedProblems: (
    receipt: Receipt,
    deps: GateDependencies,
    expected: {
      readonly fingerprint: Fingerprint;
      readonly ids: readonly string[];
      readonly routing: boolean;
    },
  ) => string[];
  readonly sealReceipt: (
    receipt: Omit<Receipt, 'selfSha256'>,
    sha256: (text: string) => string,
  ) => Receipt;
}

const activationSkills = async (deps: GateDependencies): Promise<readonly string[]> => {
  const skills = await deps.listDirectory(path.join(deps.agentsRoot, 'skills'));
  const named = await Promise.all(
    skills
      .filter((item) => item.isDirectory)
      .map(async (item) => {
        const entries = await deps.listDirectory(path.join(deps.agentsRoot, 'skills', item.name));
        return entries.some((entry) => entry.name === 'SKILL.md') ? [item.name] : [];
      }),
  );
  return named.flat().sort();
};

const activeTrainIds = (setText: string): readonly string[] =>
  (
    JSON.parse(setText) as { queries: readonly { id: string; retired?: unknown; split?: string }[] }
  ).queries
    .filter((query) => query.split === 'train' && query.retired === undefined)
    .map((query) => query.id);

const baselineOf = (receipt: Receipt | undefined): Baseline | null =>
  receipt === undefined
    ? null
    : {
        trainPassed: receipt.measurement.trainPassed,
        validationPassed: receipt.measurement.validationPassed,
      };

const catalogSha = async (
  deps: GateDependencies,
  firstSkill: string,
): Promise<string | undefined> => {
  const built = await deps.executor({
    args: [
      path.join(deps.toolsRoot, 'scripts', 'skill-manager.ts'),
      'train',
      'bundle',
      path.join(deps.agentsRoot, 'skills', firstSkill),
    ],
    command: 'bun',
  });
  try {
    return built.code === 0
      ? deps.sha256(JSON.stringify((JSON.parse(built.stdout) as { catalog: unknown }).catalog))
      : undefined;
  } catch {
    return undefined;
  }
};

const isAcceptedRoutingCandidate = (
  candidate: RoutingCandidate,
): candidate is AcceptedRoutingCandidate => candidate.verdict.accepted;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const canonicalize = (value: unknown): unknown => {
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

const appendCatalogLedger = async (
  inputs: CentralRoutingInputs,
  run: {
    readonly readerGenerationSummary: ReaderGenerationSummary;
    readonly recordedAt: string;
    readonly runId: string;
    readonly runPath: string;
    readonly runText: string;
    readonly runSha256: string;
  },
  receiptText: string,
  receiptPath: string,
  measurement: Measurement,
  deps: GateDependencies,
): Promise<void> => {
  const ledgerPath = inputs.catalogLedgerPath;
  const ledgerText = inputs.catalogLedgerText;
  const manifestPath = inputs.catalogManifestPath;
  const manifestSha256 = inputs.catalogManifestSha256;
  const row = canonicalize({
    fingerprints: {
      activationQueriesSha256: inputs.setSha,
      catalogDescriptionsSha256: inputs.catalogHash,
    },
    kind: 'activation-run',
    manifestPath,
    manifestSha256,
    measurement: {
      trainFailed: measurement.trainFailed.length,
      trainPassed: measurement.trainPassed.length,
      trainTotal: measurement.trainFailed.length + measurement.trainPassed.length,
      validationPassed: measurement.validationPassed,
      validationTotal: measurement.validationTotal,
    },
    ownerId: CATALOG_OWNER_ID,
    readerGenerationSummary: run.readerGenerationSummary,
    receiptPath,
    receiptSha256: deps.sha256(receiptText),
    recordedAt: run.recordedAt,
    runId: run.runId,
    runReferencePath: path.relative(deps.agentsRoot, run.runPath),
    runReferenceSha256: run.runSha256,
    schema: 1,
  });
  const separator = ledgerText === '' || ledgerText.endsWith('\n') ? '' : '\n';
  await deps.writeText(run.runPath, run.runText);
  await deps.writeText(
    path.join(deps.agentsRoot, ledgerPath),
    `${ledgerText}${separator}${JSON.stringify(row)}\n`,
  );
};

const measureRouting = async (
  skills: readonly string[],
  deps: GateDependencies,
  runtime: RoutingRuntime,
): Promise<readonly RoutingMeasured[]> => {
  const central = isGlobalAgentsRoot(deps.agentsRoot);
  const parts: RoutingMeasured[] = [];
  for (let start = 0; start < skills.length; start += 4) {
    const batch = skills.slice(start, start + 4);
    parts.push(
      ...(await Promise.all(
        batch.map(async (skill) => ({
          ...(await runtime.measureDocument(routingSkillTarget(skill, central), deps)),
          skill,
        })),
      )),
    );
  }
  return parts;
};

const mergeRouting = (
  skills: readonly string[],
  parts: readonly RoutingMeasured[],
): Measurement => ({
  trainFailed: parts.flatMap((part, index) =>
    part.measurement.trainFailed.map((id) => `${skills[index]}/${id}`),
  ),
  trainPassed: parts.flatMap((part, index) =>
    part.measurement.trainPassed.map((id) => `${skills[index]}/${id}`),
  ),
  validationPassed: parts.reduce((sum, part) => sum + part.measurement.validationPassed, 0),
  validationTotal: parts.reduce((sum, part) => sum + part.measurement.validationTotal, 0),
});

const migratedBaselineMatches = (
  receipt: Receipt,
  receiptText: string,
  inputs: CentralRoutingInputs,
  deps: GateDependencies,
): boolean => {
  const baseline = inputs.catalogManifest.migratedBaseline;
  const entry = inputs.catalogLedgerEntries.find((item) => item.runId === baseline?.runId);
  return (
    baseline !== undefined
    && entry !== undefined
    && inputs.catalogLedgerEntries.at(-1) === entry
    && receipt.catalogManifestSha256 === undefined
    && receipt.runId === undefined
    && receipt.runReferenceSha256 === undefined
    && receipt.documentSha256 === inputs.catalogHash
    && receipt.setSha256 === inputs.setSha
    && baseline.receiptPath === routingReceiptPathFor(true)
    && baseline.receiptSha256 === deps.sha256(receiptText)
    && entry.kind === 'migrated-baseline'
    && entry.receiptPath === baseline.receiptPath
    && entry.receiptSha256 === baseline.receiptSha256
    && entry.manifestSha256 === inputs.catalogManifestSha256
  );
};

const catalogReceiptProblems = (
  receipt: Receipt,
  receiptText: string,
  inputs: RoutingInputs,
  deps: GateDependencies,
  runtime: RoutingRuntime,
): Promise<string[]> => {
  if (inputs.source === 'package') {
    return Promise.resolve([]);
  }
  if (migratedBaselineMatches(receipt, receiptText, inputs, deps)) {
    return Promise.resolve([
      `Catalog activation stability needs ${inputs.catalogManifest.activationRuns ?? 5} fresh current runs; the migrated baseline is historical only.`,
    ]);
  }
  const problems: string[] = [];
  if (receipt.catalogManifestSha256 !== inputs.catalogManifestSha256) {
    problems.push('The catalog receipt does not match the current catalog manifest.');
  }
  if (typeof receipt.runId !== 'string' || typeof receipt.runReferenceSha256 !== 'string') {
    problems.push('The catalog receipt has no run id or sealed run reference.');
    return Promise.resolve(problems);
  }
  const entry = inputs.catalogLedgerEntries.find((item) => item.runId === receipt.runId);
  if (
    entry === undefined
    || inputs.catalogLedgerEntries.at(-1) !== entry
    || entry.kind !== 'activation-run'
    || entry.manifestSha256 !== inputs.catalogManifestSha256
    || entry.receiptPath !== inputs.catalogManifest.artifacts.activationReceipt
    || entry.receiptSha256 !== deps.sha256(receiptText)
    || entry.runReferenceSha256 !== receipt.runReferenceSha256
  ) {
    problems.push('The catalog receipt has no matching latest ledger and run-reference entry.');
  }
  return problems.length > 0
    ? Promise.resolve(problems)
    : catalogActivationStabilityProblems(inputs, deps, runtime);
};

const objectFromJson = (text: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const parseReceipt = (text: string): Receipt | undefined => {
  const value = objectFromJson(text);
  return value?.schema === 1 ? (value as unknown as Receipt) : undefined;
};

const queriesOf = (
  setText: string,
): readonly {
  readonly evidence?: string;
  readonly expected?: string;
  readonly id: string;
  readonly query?: string;
  readonly should_trigger?: boolean;
}[] => (JSON.parse(setText) as { queries: readonly { id: string }[] }).queries;

const failureEntries = async (
  measured: RoutingMeasured,
  setText: string,
  skill: string,
  deps: GateDependencies,
): Promise<
  readonly { expected: string; given: string; id: string; query: string; rawReply?: string }[]
> => {
  const queries = queriesOf(setText);
  const answerLines = ((await deps.readText(measured.answers)) ?? '').split('\n').filter(Boolean);
  const rawReplyLines = ((await deps.readText(measured.rawReplies)) ?? '')
    .split('\n')
    .filter(Boolean);
  const rawReplies = new Map<string, string>();
  for (const line of rawReplyLines) {
    const entry = JSON.parse(line) as { query_id?: string; raw_reply?: string };
    if (entry.query_id !== undefined && entry.raw_reply !== undefined) {
      rawReplies.set(entry.query_id, entry.raw_reply);
    }
  }
  const given = new Map<string, string>();
  for (const line of answerLines) {
    const entry = JSON.parse(line) as {
      answer?: string;
      query_id?: string;
      skill_name?: string;
    };
    given.set(entry.query_id ?? '', entry.answer ?? entry.skill_name ?? '');
  }
  return measured.measurement.trainFailed.map((id) => {
    const probe = queries.find((query) => query.id === id);
    const expected = probe?.should_trigger ? skill : `anything but ${skill}`;
    const reply = given.get(id);
    return {
      expected,
      given: reply ?? '',
      id,
      query: probe?.query ?? '',
      rawReply: rawReplies.get(id),
    };
  });
};

const diagnose = async (
  skill: string,
  measured: RoutingMeasured,
  setText: string,
  deps: GateDependencies,
): Promise<string> => {
  const failures = await failureEntries(measured, setText, skill, deps);
  const failuresPath = path.join(measured.work, 'failures.json');
  const suggestionsPath = path.join(measured.work, 'suggestions.jsonl');
  await deps.writeText(failuresPath, JSON.stringify(failures));
  const suggested = await deps.executor({
    args: [
      path.join(deps.toolsRoot, 'scripts', 'weak-reader.ts'),
      'suggest',
      measured.bundle,
      failuresPath,
      suggestionsPath,
    ],
    command: 'bun',
    timeoutMs: 20 * 60 * 1000,
  });
  const text = suggested.code === 0 ? await deps.readText(suggestionsPath) : undefined;
  const suggestions = new Map<string, string>(
    (text ?? '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const entry = JSON.parse(line) as { id: string; suggestion: string };
        return [entry.id, entry.suggestion];
      }),
  );
  const blocks = failures.map((failure) => {
    return [
      `--- ${failure.id}: expected ${failure.expected}, the reader answered ${failure.given}`,
      failure.query,
      `Source rule: the description of ${skill} in the router catalog`,
      `Reader's original reply: ${JSON.stringify(failure.rawReply ?? '(not captured)')}`,
      `Reader's view: ${suggestions.get(failure.id) ?? '(no suggestion available)'}`,
    ].join('\n');
  });
  const subject = `${DESCRIPTION_PREFIX}${skill}`;
  const advice =
    'Rewrite the description so a router picks this skill for these queries and no other skill does, then record again.';
  const odd = measured.readerLog
    .split('\n')
    .filter((line) => line.includes('unparseable reply'))
    .slice(0, 5);
  const replies =
    odd.length > 0
      ? `Replies the reader gave that were not a skill name or letter:\n${odd.join('\n')}\n`
      : '';
  return `DIAGNOSIS ${subject}: failing train probes. ${advice}\n${blocks.join('\n')}\n${replies}`;
};

const readCatalogState = async (
  skills: readonly string[],
  deps: GateDependencies,
): Promise<
  Omit<CentralRoutingInputs, 'catalogHash' | 'setSha' | 'sets' | 'skills' | 'source'> | string
> => {
  const catalogManifestPath = CATALOG_MANIFEST_PATH;
  const manifestText = await deps.readText(path.join(deps.agentsRoot, catalogManifestPath));
  if (manifestText === undefined || manifestText.trim() === '') {
    return `Catalog manifest is missing or blank at ${catalogManifestPath}.`;
  }
  const manifestValue = objectFromJson(manifestText);
  if (manifestValue === undefined) {
    return `Catalog manifest at ${catalogManifestPath} is malformed JSON.`;
  }
  const manifest = catalogManifestOf(manifestValue, skills);
  if (typeof manifest === 'string') {
    return manifest;
  }
  const manifestSha256 = deps.sha256(manifestText);
  const catalogLedgerPath = manifest.artifacts.ledger;
  const catalogLedgerText = await deps.readText(path.join(deps.agentsRoot, catalogLedgerPath));
  if (catalogLedgerText === undefined) {
    return `Catalog ledger is missing at ${catalogLedgerPath}.`;
  }
  const catalogLedgerEntries = await catalogLedgerEntriesOf(
    catalogLedgerText,
    manifest,
    manifestSha256,
    deps,
  );
  return typeof catalogLedgerEntries === 'string'
    ? catalogLedgerEntries
    : {
        catalogLedgerEntries,
        catalogLedgerPath,
        catalogLedgerText,
        catalogManifest: manifest,
        catalogManifestPath,
        catalogManifestSha256: manifestSha256,
      };
};

const readRoutingInputs = async (deps: GateDependencies): Promise<RoutingInputs | string> => {
  const central = isGlobalAgentsRoot(deps.agentsRoot);
  const skills = await activationSkills(deps);
  const firstSkill = skills[0];
  if (firstSkill === undefined) {
    return 'No skills found under skills/.';
  }
  const sets = await Promise.all(
    skills.map((skill) =>
      deps.readText(path.join(deps.agentsRoot, routingSkillTarget(skill, central).setPath)),
    ),
  );
  const missingIndex = sets.indexOf(undefined);
  if (missingIndex >= 0) {
    const skill = skills[missingIndex] ?? '';
    return `No trigger query set at ${routingSkillTarget(skill, central).setPath}; create it before editing.`;
  }
  const catalogState = central ? await readCatalogState(skills, deps) : undefined;
  if (typeof catalogState === 'string') {
    return catalogState;
  }
  const setMap = new Map(skills.map((skill, index) => [skill, sets[index] ?? ''] as const));
  const catalogHash = await catalogSha(deps, firstSkill);
  if (catalogHash === undefined) {
    return 'Could not read the skill catalog from `train bundle`.';
  }
  const setSha = deps.sha256(skills.map((skill) => `${skill}\0${setMap.get(skill)}`).join('\n'));
  const shared = { catalogHash, setSha, sets: setMap, skills };
  return central
    ? {
        ...(catalogState as Omit<CentralRoutingInputs, keyof RoutingInputsBase | 'source'>),
        ...shared,
        source: 'central',
      }
    : { ...shared, source: 'package' };
};

const receiptFields = (receipt: Receipt): Omit<Receipt, 'selfSha256'> => {
  const { selfSha256: _seal, ...fields } = receipt;
  return fields;
};

const receiptSealValid = (receipt: Receipt, deps: GateDependencies): boolean =>
  receipt.selfSha256 === deps.sha256(JSON.stringify(canonicalize(receiptFields(receipt))));

const prepareRoutingRecord = async (
  deps: GateDependencies,
): Promise<
  | {
      readonly inputs: RoutingInputs;
      readonly previous?: Receipt;
      readonly previousText?: string;
      readonly migrated: boolean;
    }
  | string
> => {
  const inputs = await readRoutingInputs(deps);
  if (typeof inputs === 'string') {
    return inputs;
  }
  const receiptPath = routingReceiptPathFor(inputs.source === 'central');
  const previousText = await deps.readText(path.join(deps.agentsRoot, receiptPath));
  const previous = previousText === undefined ? undefined : parseReceipt(previousText);
  if (previousText !== undefined && previous === undefined) {
    return 'the existing catalog receipt is malformed; preserve it and repair its owner evidence before recording.';
  }
  if (previous !== undefined && !receiptSealValid(previous, deps)) {
    return 'the existing catalog receipt seal does not match.';
  }
  const migrated =
    inputs.source === 'central'
    && previous !== undefined
    && previousText !== undefined
    && migratedBaselineMatches(previous, previousText, inputs, deps);
  if (
    inputs.source === 'central'
    && inputs.catalogManifest.migratedBaseline !== undefined
    && previousText === undefined
  ) {
    return 'the manifest-declared migrated baseline receipt is missing.';
  }
  return { inputs, migrated, previous, previousText };
};

const routingDiagnosis = async (
  inputs: RoutingInputs,
  parts: readonly RoutingMeasured[],
  deps: GateDependencies,
): Promise<string> => {
  const blocks: string[] = [];
  for (const [index, skill] of inputs.skills.entries()) {
    const part = parts[index];
    if (part !== undefined && part.measurement.trainFailed.length > 0) {
      blocks.push(await diagnose(skill, part, inputs.sets.get(skill) ?? '', deps));
    }
  }
  return blocks.join('');
};

const acceptRoutingCandidate = async (
  inputs: RoutingInputs,
  previous: Receipt | undefined,
  options: RecordOptions,
  candidate: AcceptedRoutingCandidate,
  deps: GateDependencies,
  runtime: RoutingRuntime,
): Promise<boolean> => {
  const central = inputs.source === 'central';
  const receiptPath = routingReceiptPathFor(central);
  let readerGenerations: readonly ReaderGeneration[] = [];
  if (central) {
    const evidence = await readerGenerationsFor(
      inputs.skills,
      candidate.parts,
      runtime.currentFingerprint(true),
      deps,
    );
    if (typeof evidence === 'string') {
      deps.write(`${ROUTING_TOKEN}: ${evidence}\n`);
      return false;
    }
    readerGenerations = evidence;
  }
  const run =
    inputs.source === 'central'
      ? {
          artifacts: catalogRunArtifacts(
            inputs,
            candidate.measurement,
            readerGenerations,
            receiptPath,
            deps,
            runtime,
          ),
          inputs,
        }
      : undefined;
  const reason = options.rebaselineReason ?? options.allowEqualReason ?? '';
  const receipt = runtime.sealReceipt(
    {
      baseline: baselineOf(previous),
      ...(run !== undefined
        ? {
            catalogManifestSha256: run.inputs.catalogManifestSha256,
            runId: run.artifacts.runId,
            runReferenceSha256: run.artifacts.runSha256,
          }
        : {}),
      decision: candidate.verdict.decision,
      document: 'skills/*/SKILL.md',
      documentSha256: inputs.catalogHash,
      fingerprint: runtime.currentFingerprint(true),
      measurement: candidate.measurement,
      reason: ['allowed-equal', 'rebaseline'].includes(candidate.verdict.decision) ? reason : '',
      schema: 1,
      setPath: central
        ? 'evals/skills/*/trigger-queries.json'
        : 'skills/*/evals/trigger-queries.json',
      setSha256: inputs.setSha,
    },
    deps.sha256,
  );
  const receiptText = runtime.formatReceipt(receipt);
  if (run !== undefined) {
    await appendCatalogLedger(
      run.inputs,
      run.artifacts,
      receiptText,
      receiptPath,
      candidate.measurement,
      deps,
    );
  }
  await deps.writeText(path.join(deps.agentsRoot, receiptPath), receiptText);
  deps.write(`ACCEPTED ${ROUTING_TOKEN} (${candidate.score}) as ${candidate.verdict.decision}\n`);
  deps.write(await routingDiagnosis(inputs, candidate.parts, deps));
  return true;
};

const rejectRoutingCandidate = async (
  inputs: RoutingInputs,
  candidate: Awaited<ReturnType<typeof evaluateRoutingCandidate>>,
  deps: GateDependencies,
): Promise<boolean> => {
  deps.write(
    `REJECTED ${ROUTING_TOKEN} (${candidate.score})\n${candidate.verdict.problems.map((problem) => `  - ${problem}`).join('\n')}\n`,
  );
  deps.write(await routingDiagnosis(inputs, candidate.parts, deps));
  return false;
};

const routingIds = (inputs: RoutingInputs): readonly string[] =>
  inputs.skills.flatMap((skill) =>
    activeTrainIds(inputs.sets.get(skill) ?? '{}').map((id) => `${skill}/${id}`),
  );

const routingScore = (skills: readonly string[], parts: readonly RoutingMeasured[]): string =>
  skills
    .map((skill, index) => {
      const part = parts[index]?.measurement;
      const train = (part?.trainPassed.length ?? 0) + (part?.trainFailed.length ?? 0);
      return `${skill} ${part?.trainPassed.length ?? 0}/${train}`;
    })
    .join(', ');

const evaluateRoutingCandidate = async (
  inputs: RoutingInputs,
  previous: Receipt | undefined,
  migrated: boolean,
  options: RecordOptions,
  deps: GateDependencies,
  runtime: RoutingRuntime,
): Promise<{
  readonly measurement: Measurement;
  readonly parts: readonly RoutingMeasured[];
  readonly score: string;
  readonly verdict: Verdict;
}> => {
  const parts = await measureRouting(inputs.skills, deps, runtime);
  const measurement = mergeRouting(inputs.skills, parts);
  const central = inputs.source === 'central';
  const fingerprintChanged =
    previous !== undefined
    && (!runtime.fingerprintMatches(previous.fingerprint, runtime.currentFingerprint(true))
      || (central
        && !migrated
        && (previous.catalogManifestSha256 !== inputs.catalogManifestSha256
          || previous.setSha256 !== inputs.setSha)));
  const verdict = runtime.decide(measurement, baselineOf(previous), {
    ...options,
    aggregate: true,
    fingerprintChanged,
  });
  const total = measurement.trainPassed.length + measurement.trainFailed.length;
  return {
    measurement,
    parts,
    score: `train ${measurement.trainPassed.length}/${total}, validation ${measurement.validationPassed}/${measurement.validationTotal}; ${routingScore(inputs.skills, parts)}`,
    verdict,
  };
};

export const recordRouting = async (
  options: RecordOptions,
  deps: GateDependencies,
  runtime: RoutingRuntime,
): Promise<boolean> => {
  const prepared = await prepareRoutingRecord(deps);
  if (typeof prepared === 'string') {
    deps.write(`${ROUTING_TOKEN}: ${prepared}\n`);
    return false;
  }
  const candidate = await evaluateRoutingCandidate(
    prepared.inputs,
    prepared.previous,
    prepared.migrated,
    options,
    deps,
    runtime,
  );
  if (isAcceptedRoutingCandidate(candidate)) {
    return acceptRoutingCandidate(
      prepared.inputs,
      prepared.previous,
      options,
      candidate,
      deps,
      runtime,
    );
  }
  return rejectRoutingCandidate(prepared.inputs, candidate, deps);
};

export const verifyRouting = async (
  deps: GateDependencies,
  runtime: RoutingRuntime,
): Promise<readonly string[]> => {
  const receiptPath = routingReceiptPathFor(isGlobalAgentsRoot(deps.agentsRoot));
  const inputs = await readRoutingInputs(deps);
  if (typeof inputs === 'string') {
    return [inputs];
  }
  const receiptText = await deps.readText(path.join(deps.agentsRoot, receiptPath));
  const receipt = receiptText === undefined ? undefined : parseReceipt(receiptText);
  if (receiptText === undefined || receipt === undefined) {
    return [`No valid receipt at ${receiptPath}; run record where a GPU adapter exists.`];
  }
  const stale: string[] = [];
  if (receipt.documentSha256 !== inputs.catalogHash) {
    stale.push(
      'A skill description changed after the routing receipt was recorded; the router reads every description.',
    );
  }
  if (receipt.setSha256 !== inputs.setSha) {
    stale.push('A trigger query set changed after the routing receipt was recorded.');
  }
  return [
    ...stale,
    ...(await catalogReceiptProblems(receipt, receiptText, inputs, deps, runtime)),
    ...runtime.recordedProblems(receipt, deps, {
      fingerprint: runtime.currentFingerprint(true),
      ids: routingIds(inputs),
      routing: true,
    }),
  ];
};
