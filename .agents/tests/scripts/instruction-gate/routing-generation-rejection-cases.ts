import { describe, expect, test } from 'bun:test';
import { readerGenerationsFor } from '../../../scripts/instruction-gate/routing-evidence.js';
import {
  CATALOG_LEDGER_PATH,
  CATALOG_MANIFEST_PATH,
  CATALOG_RECEIPT_PATH,
  CATALOG_RUN_ROOT,
  CATALOG_TRIGGER_PATH,
  type CentralTestContext,
  catalogHarness,
  catalogLedgerRows,
  catalogManifestJson,
  catalogRunPathFor,
  EQUAL_WITH_FAILURE_MEASUREMENT,
  migratedCatalogStateFor,
  ROUTING_ANSWERS,
  ROUTING_BUNDLE,
  readerLogFor,
  recordFreshCatalogRun,
  rewriteCatalogRun,
} from './central-cases.js';

const registerInvalidReaderGenerationReferences = (context: CentralTestContext): void => {
  const { verifyRouting } = context;
  const cases: readonly {
    readonly expected: string;
    readonly label: string;
    readonly mutate: (run: Record<string, unknown>) => void;
  }[] = [
    {
      expected: '0/1',
      label: 'wrong generation count',
      mutate: (run) => {
        run.readerGenerations = [];
      },
    },
    {
      expected: 'malformed per-skill generation evidence',
      label: 'non-object generation',
      mutate: (run) => {
        run.readerGenerations = [null];
      },
    },
    {
      expected: 'missing, unknown, or duplicate per-skill generation evidence',
      label: 'unknown skill generation',
      mutate: (run) => {
        const generations = run.readerGenerations as Record<string, unknown>[];
        generations[0] = { ...generations[0], skill: 'unknown-skill' };
      },
    },
    {
      expected: 'no distinct successful fresh generation',
      label: 'non-fresh generation',
      mutate: (run) => {
        const generations = run.readerGenerations as Record<string, unknown>[];
        generations[0] = { ...generations[0], freshGeneration: false };
      },
    },
    {
      expected: 'incomplete generation hashes or counts',
      label: 'empty answer hash',
      mutate: (run) => {
        const generations = run.readerGenerations as Record<string, unknown>[];
        generations[0] = { ...generations[0], answersSha256: '' };
      },
    },
  ];
  for (const { expected, label, mutate } of cases) {
    test(`rejects ${label} in a sealed catalog run reference`, async () => {
      const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
        measure: EQUAL_WITH_FAILURE_MEASUREMENT,
        tempDirs: ['/work/reader-one'],
      });
      expect(await recordFreshCatalogRun(context, harness)).toBe(0);
      const runId = String(catalogLedgerRows(context, harness).at(-1)?.runId);
      rewriteCatalogRun(context, harness, runId, mutate);

      expect((await verifyRouting(harness.deps)).join('\n')).toContain(expected);
    });
  }

  test('rejects missing per-skill generation evidence in a schema-2 run', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      tempDirs: ['/work/reader-one'],
    });
    expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    const runId = String(catalogLedgerRows(context, harness).at(-1)?.runId);
    rewriteCatalogRun(context, harness, runId, (run) => {
      delete run.readerGenerations;
    });

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'has no per-skill generation evidence',
    );
  });

  test('rejects a run reference with a different activation run count', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      tempDirs: ['/work/reader-one'],
    });
    expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    const runId = String(catalogLedgerRows(context, harness).at(-1)?.runId);
    rewriteCatalogRun(context, harness, runId, (run) => {
      run.activationRuns = 3;
    });

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'does not match manifest activationRuns=5',
    );
  });

  test('rejects a legacy schema-1 run among the latest fresh activation runs', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      tempDirs: [
        '/work/reader-one',
        '/work/reader-two',
        '/work/reader-three',
        '/work/reader-four',
        '/work/reader-five',
      ],
    });
    for (let index = 0; index < 5; index += 1) {
      expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    }
    const runId = String(catalogLedgerRows(context, harness)[0]?.runId);
    rewriteCatalogRun(context, harness, runId, (run) => {
      run.schema = 1;
    });

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'must all have portable schema-2 run evidence',
    );
  });
};

const registerMalformedManifestTests = (context: CentralTestContext): void => {
  const { globalRoot, join, record } = context;
  describe('catalog manifest preflight', () => {
    test.each<[string, string | undefined]>([
      ['missing', undefined],
      ['malformed', '{'],
    ])('blocks on a %s manifest before reader execution', async (_label, text) => {
      const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
      if (text === undefined) {
        harness.files.delete(join(globalRoot, CATALOG_MANIFEST_PATH));
      } else {
        harness.files.set(join(globalRoot, CATALOG_MANIFEST_PATH), text);
      }

      expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
      expect(harness.executorCalls()).toBe(0);
      expect(harness.files.has(join(globalRoot, CATALOG_RECEIPT_PATH))).toBe(false);
      expect(harness.files.get(join(globalRoot, CATALOG_LEDGER_PATH))).toBe('');
      expect([...harness.files.keys()].some((file) => file.includes('/runs/'))).toBe(false);
    });
    test('rejects activationRuns=2 before reader execution', async () => {
      const harness = catalogHarness(
        context,
        catalogManifestJson(CATALOG_TRIGGER_PATH, { activationRuns: 2 }),
      );

      expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
      expect(harness.executorCalls()).toBe(0);
      expect(harness.output.join('')).toContain(
        'activationRuns must be a safe integer of at least 3',
      );
      expect(harness.files.get(join(globalRoot, CATALOG_LEDGER_PATH))).toBe('');
    });
    test('rejects source and activation inventories that do not match active skills', async () => {
      const text = catalogManifestJson(CATALOG_TRIGGER_PATH, {
        inputs: { activationSets: [] },
        sources: [],
      });
      const harness = catalogHarness(context, text);

      expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
      expect(harness.executorCalls()).toBe(0);
      expect(harness.output.join('')).toContain('Catalog manifest');
    });
    test('rejects a malformed migrated-baseline binding', async () => {
      const harness = catalogHarness(
        context,
        catalogManifestJson(CATALOG_TRIGGER_PATH, { migratedBaseline: null }),
      );

      expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
      expect(harness.output.join('')).toContain('malformed migrated-baseline binding');
      expect(harness.executorCalls()).toBe(0);
    });
  });
};

const registerMigratedBaselineTests = (context: CentralTestContext): void => {
  const { globalRoot, join, record, verifyRouting } = context;
  test('accepts and upgrades a fully bound migrated catalog baseline', async () => {
    const migrated = migratedCatalogStateFor(context);
    const harness = catalogHarness(context, migrated.manifestText);
    harness.files.set(join(globalRoot, CATALOG_LEDGER_PATH), migrated.ledgerText);
    harness.files.set(join(globalRoot, CATALOG_RECEIPT_PATH), migrated.receiptText);

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'migrated baseline is historical only',
    );
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    expect(harness.output.join('')).toContain('as perfect');
    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'Catalog activation stability needs 5 fresh runs; found 1/5.',
    );
  });

  test('blocks a declared migrated baseline when its ledger binding is missing', async () => {
    const migrated = migratedCatalogStateFor(context);
    const harness = catalogHarness(context, migrated.manifestText);
    harness.files.set(join(globalRoot, CATALOG_LEDGER_PATH), '');

    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain(
      'does not contain the manifest-declared migrated baseline',
    );
    expect(harness.executorCalls()).toBe(0);
  });

  test('blocks when the manifest declares a migrated baseline but its receipt is absent', async () => {
    const migrated = migratedCatalogStateFor(context);
    const harness = catalogHarness(context, migrated.manifestText);
    harness.files.set(join(globalRoot, CATALOG_LEDGER_PATH), migrated.ledgerText);

    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain(
      'manifest-declared migrated baseline receipt is missing',
    );
    expect(harness.executorCalls()).toBe(1);
  });
};

const registerMissingRunReferenceTest = (context: CentralTestContext): void => {
  const { join, verifyRouting } = context;
  test('verification passes with all five catalog run payloads absent from machine temp', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      tempDirs: [
        '/work/reader-one',
        '/work/reader-two',
        '/work/reader-three',
        '/work/reader-four',
        '/work/reader-five',
      ],
    });
    for (let index = 0; index < 5; index += 1) {
      expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    }
    for (const row of catalogLedgerRows(context, harness)) {
      if (typeof row.runId === 'string') {
        harness.files.delete(catalogRunPathFor(join, row.runId));
      }
    }

    expect(await verifyRouting(harness.deps)).toEqual([]);
  });
};

const registerReaderBundleParserFailures = (context: CentralTestContext): void => {
  const fingerprint = context.currentFingerprint(true);
  test.each([
    ['malformed JSON', '{', 'Catalog run bundle is malformed JSON for aidp.'],
    [
      'empty prompts',
      JSON.stringify({ prompts: [] }),
      'Catalog run bundle has no prompt rows for aidp.',
    ],
  ])('rejects a reader bundle with %s', async (_label, bundleText, expected) => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    const bundlePath = '/work/bundle.json';
    const answersPath = '/work/answers.jsonl';
    harness.files.set(bundlePath, bundleText);
    harness.files.set(answersPath, ROUTING_ANSWERS);

    expect(
      await readerGenerationsFor(
        ['aidp'],
        [
          {
            answers: answersPath,
            bundle: bundlePath,
            readerLog: readerLogFor(fingerprint),
            skill: 'aidp',
            work: '/work/reader-one',
          },
        ],
        fingerprint,
        harness.deps,
      ),
    ).toBe(expected);
  });
};

const registerReaderBundleStabilityTest = (context: CentralTestContext): void => {
  test('verification rejects changed per-skill prompt bundles across fresh runs when answers and model identity stay equal', async () => {
    const changedPromptBundle = ROUTING_BUNDLE.replace('Plan it', 'Plan the migration');
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      readerBundles: [
        ROUTING_BUNDLE,
        changedPromptBundle,
        ROUTING_BUNDLE,
        changedPromptBundle,
        ROUTING_BUNDLE,
      ],
      tempDirs: [
        '/work/reader-one',
        '/work/reader-two',
        '/work/reader-three',
        '/work/reader-four',
        '/work/reader-five',
      ],
    });
    for (let index = 0; index < 5; index += 1) {
      expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    }

    expect(await context.verifyRouting(harness.deps)).not.toEqual([]);
  });
};

const registerRejectedReaderGenerationTests = (context: CentralTestContext): void => {
  const { globalRoot, join, verifyRouting } = context;
  const fingerprint = context.currentFingerprint(true);
  const cases = [
    ['malformed router bundle', { readerBundles: ['{'] }, 'Could not read the skill catalog'],
    [
      'bundle with no prompts',
      { readerBundles: [JSON.stringify({ catalog: [{ description: 'd', name: 'aidp' }] })] },
      'no prompt rows',
    ],
    [
      'malformed prompt row',
      {
        readerBundles: [
          JSON.stringify({
            catalog: [{ description: 'd', name: 'aidp' }],
            prompts: [{ query: '', query_id: 'a1', run: 1 }],
          }),
        ],
      },
      'malformed prompt row',
    ],
    [
      'prompt missing its query id',
      {
        readerBundles: [
          JSON.stringify({
            catalog: [{ description: 'd', name: 'aidp' }],
            prompts: [{ query: 'Plan it', run: 1 }],
          }),
        ],
      },
      'malformed prompt row',
    ],
    ['missing answers', { readerAnswers: [''] }, 'row counts differ'],
    ['answer row that is not an object', { readerAnswers: ['null\n'] }, 'malformed answer row'],
    ['malformed answer JSONL', { readerAnswers: ['{bad}\n'] }, 'malformed answer JSONL'],
    [
      'answer count mismatch',
      { readerAnswers: ['{"query_id":"a1","run":1,"skill_name":"aidp"}\n'] },
      'row counts differ',
    ],
    [
      'answer rows out of prompt order',
      {
        readerAnswers: [`${ROUTING_ANSWERS.split('\n').filter(Boolean).reverse().join('\n')}\n`],
      },
      'answer rows do not match prompt order',
    ],
    ['missing GPU summary', { readerLogs: [''] }, 'exactly one successful GPU-ready log line'],
    [
      'missing bundle artifact',
      { missingReadPaths: ['/work/bundle.json'] },
      'missing the bundle or answer artifact',
    ],
    ['empty invocation directory', { tempDirs: ['/'] }, 'no unique temporary invocation id'],
    [
      'GPU count mismatch',
      { readerLogs: [readerLogFor(fingerprint, 2, 2)] },
      'GPU log counts or model identity do not match',
    ],
    [
      'stale model identity in the GPU summary',
      { readerLogs: [readerLogFor(fingerprint, 3, 3, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')] },
      'GPU log counts or model identity do not match',
    ],
  ] as const;
  test.each(cases)(
    'does not persist a catalog receipt for %s',
    async (_label, options, expected) => {
      const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), options);

      expect(await context.record(['descriptions'], {}, harness.deps)).toBe(1);
      expect(harness.output.join('\n')).toContain(expected);
      expect(harness.files.has(join(globalRoot, CATALOG_RECEIPT_PATH))).toBe(false);
      expect(harness.files.get(join(globalRoot, CATALOG_LEDGER_PATH))).toBe('');
      expect(
        [...harness.files.keys()].filter((file) => file.startsWith(`${CATALOG_RUN_ROOT}/`)),
      ).toEqual([]);
      expect(await verifyRouting(harness.deps)).not.toEqual([]);
    },
  );
};

export const registerCatalogGenerationRejectionTests = (context: CentralTestContext): void => {
  registerInvalidReaderGenerationReferences(context);
  registerRejectedReaderGenerationTests(context);
  registerMalformedManifestTests(context);
  registerMigratedBaselineTests(context);
  registerMissingRunReferenceTest(context);
  registerReaderBundleParserFailures(context);
  registerReaderBundleStabilityTest(context);
};
