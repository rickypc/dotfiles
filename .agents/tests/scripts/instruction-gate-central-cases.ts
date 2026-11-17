import { describe, expect, test } from 'bun:test';
import type { GateDependencies, Receipt, RecordOptions } from '../../scripts/instruction-gate.js';
import type { CommandResult, CommandSpec } from '../../utils/contracts.js';

export interface CentralTestContext {
  readonly centralReceipt: string;
  readonly centralSet: string;
  readonly currentFingerprint: (
    routing?: boolean,
  ) => import('../../scripts/instruction-gate.js').Fingerprint;
  readonly document: string;
  readonly formatReceipt: (receipt: import('../../scripts/instruction-gate.js').Receipt) => string;
  readonly globalRoot: string;
  readonly instructionDocuments: (deps: GateDependencies) => Promise<readonly string[]>;
  readonly join: (...parts: string[]) => string;
  readonly makeHarness: (options?: {
    readonly agentsRoot?: string;
    readonly measure?: string;
    readonly readerAnswers?: readonly string[];
    readonly readerBundles?: readonly string[];
    readonly readerLogs?: readonly string[];
    readonly missingReadPaths?: readonly string[];
    readonly overrides?: (spec: CommandSpec) => CommandResult | undefined;
    readonly readerStderr?: string;
    readonly tempDirs?: readonly string[];
    readonly transformRead?: (file: string, text: string | undefined) => string | undefined;
    readonly toolsRoot?: string;
    readonly tree?: Record<string, readonly { isDirectory: boolean; name: string }[]>;
  }) => CentralTestHarness;
  readonly receipt: string;
  readonly receiptPathFor: (document: string, central?: boolean) => string;
  readonly record: (
    documents: readonly string[],
    options: RecordOptions,
    deps: GateDependencies,
  ) => Promise<number>;
  readonly routingReceipt: string;
  readonly sealReceipt: (
    receipt: Omit<import('../../scripts/instruction-gate.js').Receipt, 'selfSha256'>,
  ) => import('../../scripts/instruction-gate.js').Receipt;
  readonly set: string;
  readonly setPathFor: (document: string, central?: boolean) => string;
  readonly setText: string;
  readonly triggerSet: string;
  readonly verifyRouting: (deps: GateDependencies) => Promise<readonly string[]>;
}

export interface CentralTestHarness {
  readonly deps: GateDependencies;
  readonly executorCalls: () => number;
  readonly files: Map<string, string>;
  readonly output: string[];
  readonly readPaths: string[];
}

export const CATALOG_MANIFEST_PATH = 'evals/skills/_catalog/manifest.json';
export const CATALOG_LEDGER_PATH = 'evals/skills/_catalog/ledger.jsonl';
const CATALOG_RUN_DIRECTORY =
  'os.tmpdir()/agents-evaluation-runs/{repositoryId}/{ownerId}/{runId}/';
export const CATALOG_RECEIPT_PATH = 'evals/skills/_catalog/receipts/activation.json';
export const CATALOG_TRIGGER_PATH = 'evals/skills/aidp/trigger-queries.json';
export const CATALOG_RUN_ROOT = '/os-temp/agents-evaluation-runs/test-home-.agents/skill-catalog';
export const catalogRunPathFor = (join: CentralTestContext['join'], runId: string): string =>
  join(CATALOG_RUN_ROOT, runId, 'run.json');
export const ROUTING_BUNDLE = JSON.stringify({
  catalog: [{ description: 'd', name: 'aidp' }],
  document: 'Skill catalog:\n- aidp: d',
  instructions: 'Return the matching skill name or NO_SKILL.',
  names: ['aidp'],
  prompts: [
    { query: 'Plan it', query_id: 'a1', run: 1 },
    { query: 'Hello', query_id: 'a2', run: 1 },
    { query: 'Held out', query_id: 'av', run: 1 },
  ],
});

export const ROUTING_ANSWERS = `${[
  { query_id: 'a1', run: 1, skill_name: 'aidp' },
  { query_id: 'a2', run: 1, skill_name: 'NO_SKILL' },
  { query_id: 'av', run: 1, skill_name: 'aidp' },
]
  .map((entry) => JSON.stringify(entry))
  .join('\n')}\n`;

export const canonicalizeForTest = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonicalizeForTest)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, entry]) => [key, canonicalizeForTest(entry)]),
        )
      : value;

export const catalogLedgerRows = (
  context: CentralTestContext,
  harness: CentralTestHarness,
): Record<string, unknown>[] =>
  (harness.files.get(context.join(context.globalRoot, CATALOG_LEDGER_PATH)) ?? '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

export const hash = (value: string): string => `h(${value})`;

export const readerLogFor = (
  fingerprint: import('../../scripts/instruction-gate.js').Fingerprint,
  promptRows = 3,
  distinctQueries = 3,
  modelRevision = fingerprint.modelRevision,
  runtimeBundleSha256 = fingerprint.bundleSha256,
): string =>
  `[weak-reader] GPU ready; context 3/10 tokens; answered ${promptRows} probes from ${distinctQueries} queries; load 0.001 s, warmup 0.001 s, total 0.002 s; last query first token 0.001 s, total 0.001 s; model revision ${modelRevision}; runtime bundle ${runtimeBundleSha256}`;

export const recordFreshCatalogRun = async (
  context: CentralTestContext,
  harness: CentralTestHarness,
): Promise<number> => {
  const exitCode = await context.record(
    ['descriptions'],
    { allowEqualReason: 'repeated fresh reader generation stability sample' },
    harness.deps,
  );
  if (exitCode !== 0) {
    throw new Error(harness.output.join(''));
  }
  return exitCode;
};

export const rewriteCatalogRun = (
  context: CentralTestContext,
  harness: CentralTestHarness,
  runId: string,
  update: (run: Record<string, unknown>) => void,
  options: { readonly refreshSummary?: boolean } = {},
): void => {
  const runPath = catalogRunPathFor(context.join, runId);
  const parsed = JSON.parse(harness.files.get(runPath) ?? '{}') as Record<string, unknown>;
  delete parsed.selfSha256;
  update(parsed);
  const unsigned = canonicalizeForTest(parsed) as Record<string, unknown>;
  const run = canonicalizeForTest({
    ...unsigned,
    selfSha256: hash(JSON.stringify(unsigned)),
  });
  const runText = `${JSON.stringify(run, null, 2)}\n`;
  harness.files.set(runPath, runText);

  const rows = catalogLedgerRows(context, harness);
  const row = rows.find((entry) => entry.runId === runId);
  if (row === undefined) {
    throw new Error(`No catalog ledger row for ${runId}`);
  }
  row.runReferenceSha256 = hash(runText);
  row.portableRunEvidence = canonicalizeForTest({
    activationRuns: parsed.activationRuns,
    fingerprint: parsed.fingerprint,
    manifestPath: parsed.manifestPath,
    manifestSha256: parsed.manifestSha256,
    ownerId: parsed.ownerId,
    readerGenerations: parsed.readerGenerations,
    receiptPath: parsed.receiptPath,
    runId: parsed.runId,
    schema: parsed.schema,
    setFingerprint: parsed.setFingerprint,
    sourceFingerprint: parsed.sourceFingerprint,
  });
  row.portableRunEvidenceSha256 = hash(
    JSON.stringify(canonicalizeForTest(row.portableRunEvidence)),
  );
  if (options.refreshSummary) {
    const generations = parsed.readerGenerations as readonly Record<string, unknown>[];
    row.readerGenerationSummary = {
      count: generations.length,
      evidenceSha256: hash(JSON.stringify(canonicalizeForTest(generations))),
      freshCount: generations.filter((generation) => generation.freshGeneration === true).length,
    };
  }
  const receiptPath = context.join(context.globalRoot, CATALOG_RECEIPT_PATH);
  const receipt = JSON.parse(harness.files.get(receiptPath) ?? '{}') as Record<string, unknown>;
  if (receipt.runId === runId) {
    delete receipt.selfSha256;
    receipt.runReferenceSha256 = hash(runText);
    const receiptText = context.formatReceipt(
      context.sealReceipt(receipt as unknown as Omit<Receipt, 'selfSha256'>),
    );
    harness.files.set(receiptPath, receiptText);
    row.receiptSha256 = hash(receiptText);
  }
  harness.files.set(
    context.join(context.globalRoot, CATALOG_LEDGER_PATH),
    `${rows.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
  );
};
export const SUCCESSFUL_MEASUREMENT = JSON.stringify({
  measurement: {
    trainQueries: [
      { id: 'a1', passed: true },
      { id: 'a2', passed: true },
    ],
    validation: { passedQueries: 1, totalQueries: 1 },
  },
});

export const EQUAL_WITH_FAILURE_MEASUREMENT = JSON.stringify({
  measurement: {
    trainQueries: [
      { id: 'a1', passed: true },
      { id: 'a2', passed: false },
    ],
    validation: { passedQueries: 1, totalQueries: 1 },
  },
});

export const catalogManifestJson = (
  triggerPath: string,
  overrides: Record<string, unknown> = {},
): string =>
  JSON.stringify({
    artifacts: {
      activationReceipt: CATALOG_RECEIPT_PATH,
      ledger: CATALOG_LEDGER_PATH,
      runsDirectory: CATALOG_RUN_DIRECTORY,
    },
    inputs: { activationSets: [{ path: triggerPath, skill: 'aidp' }] },
    inventory: { skills: 1 },
    manifestVersion: 1,
    ownerId: 'skill-catalog',
    requiredLanes: ['activation'],
    schemaVersion: 2,
    scope: 'evals/skills/_catalog/',
    sources: [{ skill: 'aidp', sourcePath: 'skills/aidp/SKILL.md' }],
    ...overrides,
  });

export const globalTreeFor = (
  globalRoot: string,
  join: CentralTestContext['join'],
  skills: readonly string[] = ['aidp'],
): Record<string, readonly { isDirectory: boolean; name: string }[]> => ({
  [globalRoot]: [{ isDirectory: true, name: 'skills' }],
  [join(globalRoot, 'skills')]: skills.map((name) => ({ isDirectory: true, name })),
  ...Object.fromEntries(
    skills.map((name) => [
      join(globalRoot, 'skills', name),
      [{ isDirectory: false, name: 'SKILL.md' }],
    ]),
  ),
});

export const catalogHarness = (
  context: CentralTestContext,
  text: string,
  options: {
    readonly measure?: string;
    readonly overrides?: (spec: CommandSpec) => CommandResult | undefined;
    readonly readerAnswers?: readonly string[];
    readonly readerBundles?: readonly string[];
    readonly readerLogs?: readonly string[];
    readonly missingReadPaths?: readonly string[];
    readonly triggerSets?: Readonly<Record<string, string>>;
    readonly readerStderr?: string;
    readonly tempDirs?: readonly string[];
    readonly transformRead?: (file: string, text: string | undefined) => string | undefined;
    readonly tree?: Record<string, readonly { isDirectory: boolean; name: string }[]>;
  } = {},
): CentralTestHarness => {
  const { globalRoot, join, makeHarness, triggerSet } = context;
  const harness = makeHarness({
    agentsRoot: globalRoot,
    measure: options.measure ?? SUCCESSFUL_MEASUREMENT,
    missingReadPaths: options.missingReadPaths,
    overrides: options.overrides,
    readerAnswers: options.readerAnswers,
    readerBundles: options.readerBundles,
    readerLogs: options.readerLogs,
    readerStderr: options.readerStderr,
    tempDirs: options.tempDirs,
    toolsRoot: globalRoot,
    transformRead: options.transformRead,
    tree: options.tree ?? globalTreeFor(globalRoot, join),
  });
  const triggerSets = options.triggerSets ?? { aidp: triggerSet };
  for (const [skill, content] of Object.entries(triggerSets)) {
    harness.files.set(join(globalRoot, `evals/skills/${skill}/trigger-queries.json`), content);
  }
  harness.files.set(join(globalRoot, CATALOG_MANIFEST_PATH), text);
  harness.files.set(join(globalRoot, CATALOG_LEDGER_PATH), '');
  return harness;
};

export const migratedCatalogStateFor = (
  context: CentralTestContext,
): {
  readonly manifestText: string;
  readonly receiptText: string;
  readonly runId: string;
  readonly runText: string;
  readonly ledgerText: string;
} => {
  const { currentFingerprint, formatReceipt, sealReceipt, triggerSet } = context;
  const runId = 'activation-migrated-baseline';
  const receiptPath = CATALOG_RECEIPT_PATH;
  const receiptText = formatReceipt(
    sealReceipt({
      baseline: null,
      decision: 'baseline',
      document: 'skills/*/SKILL.md',
      documentSha256: hash(JSON.stringify([{ description: 'd', name: 'aidp' }])),
      fingerprint: currentFingerprint(true),
      measurement: {
        trainFailed: [],
        trainPassed: ['aidp/a1', 'aidp/a2'],
        validationPassed: 1,
        validationTotal: 1,
      },
      reason: '',
      schema: 1,
      setPath: 'skills/*/evals/trigger-queries.json',
      setSha256: hash(`aidp\0${triggerSet}`),
    }),
  );
  const receiptSha256 = hash(receiptText);
  const manifestText = catalogManifestJson(CATALOG_TRIGGER_PATH, {
    migratedBaseline: { receiptPath, receiptSha256, runId },
  });
  const manifestSha256 = hash(manifestText);
  const ledgerText = `${JSON.stringify({
    kind: 'migrated-baseline',
    manifestPath: CATALOG_MANIFEST_PATH,
    manifestSha256,
    ownerId: 'skill-catalog',
    receiptPath,
    receiptSha256,
    runId,
    schema: 1,
  })}\n`;
  const runText = JSON.stringify({
    manifestPath: CATALOG_MANIFEST_PATH,
    manifestSha256,
    ownerId: 'skill-catalog',
    receiptPath,
    receiptSha256,
    runId,
    schema: 1,
  });
  return { ledgerText, manifestText, receiptText, runId, runText };
};

const registerAcceptedCatalogRunTest = (context: CentralTestContext): void => {
  const { globalRoot, join, makeHarness, record, triggerSet, verifyRouting } = context;
  test('accepted routing persists a sealed receipt, run reference, and ledger row', async () => {
    const harness = makeHarness({
      agentsRoot: globalRoot,
      measure: SUCCESSFUL_MEASUREMENT,
      toolsRoot: globalRoot,
      tree: globalTreeFor(globalRoot, join),
    });
    harness.files.set(join(globalRoot, CATALOG_TRIGGER_PATH), triggerSet);
    harness.files.set(
      join(globalRoot, CATALOG_MANIFEST_PATH),
      catalogManifestJson(CATALOG_TRIGGER_PATH),
    );
    harness.files.set(join(globalRoot, CATALOG_LEDGER_PATH), '');

    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    expect(harness.output.join('')).toContain('ACCEPTED');

    const receiptPath = join(globalRoot, CATALOG_RECEIPT_PATH);
    const receipt = JSON.parse(harness.files.get(receiptPath) ?? '{}') as {
      catalogManifestSha256?: string;
      runId?: string;
      runReferenceSha256?: string;
    };
    const rows = (harness.files.get(join(globalRoot, CATALOG_LEDGER_PATH)) ?? '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { runId: string });
    const runId = receipt.runId ?? 'missing-run-id';
    const runPath = catalogRunPathFor(join, runId);

    expect(receipt).toMatchObject({
      catalogManifestSha256: hash(catalogManifestJson(CATALOG_TRIGGER_PATH)),
    });
    expect(typeof receipt.runId).toBe('string');
    expect(typeof receipt.runReferenceSha256).toBe('string');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.runId).toBe(runId);
    expect(harness.files.has(runPath)).toBe(true);
    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'Catalog activation stability needs 5 fresh runs; found 1/5.',
    );
  });
};

const registerCentralPathMappingTests = (context: CentralTestContext): void => {
  const { centralReceipt, document, receipt, set, receiptPathFor, setPathFor } = context;
  describe('instruction-gate central path mappings', () => {
    test.each<[string, string, string, boolean]>([
      [document, 'evals/skills/aidp/comprehension/SKILL.json', centralReceipt, true],
      [
        'skills/aidp/references/deep.md',
        'evals/skills/aidp/comprehension/references-deep.json',
        'evals/skills/aidp/receipts/references--deep.json',
        true,
      ],
      [
        'evals/skills/aidp/rubric.md',
        'evals/skills/aidp/comprehension/evals-rubric.json',
        'evals/skills/aidp/receipts/rubric.json',
        true,
      ],
      [document, set, receipt, false],
    ])(
      'maps %s to its scope-specific set and receipt',
      (source, expectedSet, expectedReceipt, isCentral) => {
        expect(setPathFor(source, isCentral)).toBe(expectedSet);
        expect(receiptPathFor(source, isCentral)).toBe(expectedReceipt);
      },
    );
  });
};

const registerNoGpuReceiptTest = (context: CentralTestContext): void => {
  const { globalRoot, join, makeHarness, record, triggerSet } = context;
  test('a no-GPU routing attempt writes no receipt, ledger entry, or run reference', async () => {
    const harness = makeHarness({
      agentsRoot: globalRoot,
      overrides: (spec) =>
        spec.args.some((arg) => arg.endsWith('/weak-reader.ts'))
          ? { code: 2, stderr: 'no GPU adapter', stdout: '' }
          : undefined,
      toolsRoot: globalRoot,
      tree: globalTreeFor(globalRoot, join),
    });
    harness.files.set(join(globalRoot, CATALOG_TRIGGER_PATH), triggerSet);
    harness.files.set(
      join(globalRoot, CATALOG_MANIFEST_PATH),
      catalogManifestJson(CATALOG_TRIGGER_PATH),
    );
    harness.files.set(join(globalRoot, CATALOG_LEDGER_PATH), '');

    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.files.has(join(globalRoot, CATALOG_RECEIPT_PATH))).toBe(false);
    expect(harness.files.get(join(globalRoot, CATALOG_LEDGER_PATH))).toBe('');
    expect([...harness.files.keys()].some((file) => file.includes('/runs/'))).toBe(false);
    expect(harness.output.join('')).toContain('weak reader exited 2');
  });
};

const registerRoutingInputAndRecordPreflightTests = (context: CentralTestContext): void => {
  const { globalRoot, join, makeHarness, record, verifyRouting } = context;
  test('blocks routing when no skill with a SKILL.md is present', async () => {
    const harness = makeHarness({
      agentsRoot: globalRoot,
      tree: { [join(globalRoot, 'skills')]: [] },
    });

    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain('No skills found under skills/.');
    expect(harness.executorCalls()).toBe(0);
  });

  test('blocks routing when an active skill has no central trigger set', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    harness.files.delete(join(globalRoot, CATALOG_TRIGGER_PATH));

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'No trigger query set at evals/skills/aidp/trigger-queries.json',
    );
    expect(harness.executorCalls()).toBe(0);
  });

  test('blocks record with a malformed pre-existing catalog receipt', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    harness.files.set(join(globalRoot, CATALOG_RECEIPT_PATH), '{');

    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain('existing catalog receipt is malformed');
  });

  test('blocks record when a validly shaped pre-existing catalog receipt has a bad seal', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    const receiptPath = join(globalRoot, CATALOG_RECEIPT_PATH);
    const current = JSON.parse(harness.files.get(receiptPath) ?? '{}') as Record<string, unknown>;
    harness.files.set(receiptPath, JSON.stringify({ ...current, selfSha256: 'wrong' }));

    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain('existing catalog receipt seal does not match');
  });
};

const registerRoutingRunIdAndDiagnosisTests = (context: CentralTestContext): void => {
  const { globalRoot, join, record, triggerSet } = context;
  test('allocates a new catalog run id when the fixed recording timestamp already exists', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    const receipt = JSON.parse(
      harness.files.get(join(globalRoot, CATALOG_RECEIPT_PATH)) ?? '{}',
    ) as { runId?: string };

    expect(receipt.runId).toBe('activation-20261114180000000-2');
    expect(
      harness.files.get(join(globalRoot, CATALOG_LEDGER_PATH))?.trim().split('\n'),
    ).toHaveLength(2);
  });

  test('reports train failures against the catalog skill and omits a diagnosis for validation-only regressions', async () => {
    let currentMeasurement = SUCCESSFUL_MEASUREMENT;
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      overrides: (spec) => {
        if (spec.args.includes('measure')) {
          return { code: 0, stderr: '', stdout: currentMeasurement };
        }
        return undefined;
      },
      readerStderr: '[weak-reader] unparseable reply for "Hello": "poem"',
    });
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);

    currentMeasurement = JSON.stringify({
      measurement: {
        trainQueries: [
          { id: 'a1', passed: false },
          { id: 'a2', passed: false },
        ],
        validation: { passedQueries: 1, totalQueries: 1 },
      },
    });
    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    const diagnosis = harness.output.join('');
    expect(diagnosis).toContain('expected aidp');
    expect(diagnosis).toContain('expected anything but aidp');
    expect(diagnosis).toContain('Source rule: the description of aidp in the router catalog');
    expect(diagnosis).toContain('Reader\'s original reply: "raw-a1"');
    expect(diagnosis).toContain('Replies the reader gave that were not a skill name or letter');
    expect(diagnosis).toContain('Rewrite the description so a router picks this skill');

    const priorOutputLength = harness.output.join('').length;
    currentMeasurement = JSON.stringify({
      measurement: {
        trainQueries: [
          { id: 'a1', passed: true },
          { id: 'a2', passed: true },
        ],
        validation: { passedQueries: 0, totalQueries: 1 },
      },
    });
    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.output.join('').slice(priorOutputLength)).not.toContain('DIAGNOSIS');
    expect(triggerSet).toContain('a1');
  });

  test('omits optional unparseable-reply detail when the reader log has none', async () => {
    let currentMeasurement = SUCCESSFUL_MEASUREMENT;
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      overrides: (spec) =>
        spec.args.includes('measure')
          ? { code: 0, stderr: '', stdout: currentMeasurement }
          : undefined,
    });
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    currentMeasurement = JSON.stringify({
      measurement: {
        trainQueries: [
          { id: 'a1', passed: false },
          { id: 'a2', passed: true },
        ],
        validation: { passedQueries: 1, totalQueries: 1 },
      },
    });

    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain('DIAGNOSIS description:aidp');
    expect(harness.output.join('')).not.toContain(
      'Replies the reader gave that were not a skill name or letter',
    );
  });
};

export const registerCentralPathTests = (context: CentralTestContext): void => {
  registerAcceptedCatalogRunTest(context);
  registerCentralPathMappingTests(context);
  registerRoutingInputAndRecordPreflightTests(context);
  registerRoutingRunIdAndDiagnosisTests(context);
  registerNoGpuReceiptTest(context);
};
