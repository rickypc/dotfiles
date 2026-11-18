import { expect, test } from 'bun:test';
import type { Receipt } from '../../scripts/instruction-gate.js';
import {
  CATALOG_LEDGER_PATH,
  CATALOG_MANIFEST_PATH,
  CATALOG_RECEIPT_PATH,
  CATALOG_TRIGGER_PATH,
  type CentralTestContext,
  type CentralTestHarness,
  canonicalizeForTest,
  catalogHarness,
  catalogLedgerRows,
  catalogManifestJson,
  catalogRunPathFor,
  EQUAL_WITH_FAILURE_MEASUREMENT,
  globalTreeFor,
  hash,
  ROUTING_ANSWERS,
  ROUTING_BUNDLE,
  readerLogFor,
  recordFreshCatalogRun,
  rewriteCatalogRun,
} from './instruction-gate-central-cases.js';

const registerCatalogGenerationAnswerStabilityTests = (context: CentralTestContext): void => {
  const { verifyRouting } = context;
  test('verification rejects reader answers that change across the five accepted runs', async () => {
    const changedAnswers = ROUTING_ANSWERS.replace('"skill_name":"aidp"', '"skill_name":"aidx"');
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      readerAnswers: [
        ROUTING_ANSWERS,
        changedAnswers,
        ROUTING_ANSWERS,
        ROUTING_ANSWERS,
        ROUTING_ANSWERS,
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

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'do not match across 5 distinct invocations',
    );
  });
};

const registerCatalogGenerationCreationTests = (context: CentralTestContext): void => {
  const { currentFingerprint, globalRoot, join, verifyRouting } = context;
  test('records exact fresh reader evidence for a catalog run and keeps one run below verify threshold', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      tempDirs: ['/work/reader-one'],
    });

    expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    const receipt = JSON.parse(
      harness.files.get(join(globalRoot, CATALOG_RECEIPT_PATH)) ?? '{}',
    ) as { runId?: string };
    const run = JSON.parse(
      harness.files.get(catalogRunPathFor(join, receipt.runId ?? 'missing-run-id')) ?? '{}',
    ) as Record<string, unknown>;
    const generations = run.readerGenerations as readonly Record<string, unknown>[];
    const ledger = catalogLedgerRows(context, harness)[0];
    const fingerprint = currentFingerprint(true);
    const expectedLog = readerLogFor(fingerprint);

    expect(run).toMatchObject({ schema: 2 });
    expect(generations).toEqual([
      {
        answerRows: 3,
        answersSha256: hash(ROUTING_ANSWERS),
        bundleSha256: hash(ROUTING_BUNDLE),
        distinctQueryCount: 3,
        freshGeneration: true,
        generatedQueryCount: 3,
        logSha256: hash(expectedLog),
        modelRevision: fingerprint.modelRevision,
        promptRows: 3,
        readerInvocationId: 'reader-one',
        runtimeBundleSha256: fingerprint.bundleSha256,
        skill: 'aidp',
      },
    ]);
    expect(ledger?.readerGenerationSummary).toEqual({
      count: 1,
      evidenceSha256: hash(JSON.stringify(canonicalizeForTest(generations))),
      freshCount: 1,
    });
    expect(ledger?.runReferencePath).toBeUndefined();
    expect(ledger?.portableRunEvidence).toMatchObject({ runId: ledger?.runId, schema: 2 });
    expect(typeof ledger?.portableRunEvidenceSha256).toBe('string');
    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'Catalog activation stability needs 5 fresh runs; found 1/5.',
    );
  });

  test('counts model generations by distinct query when the bundle repeats a query row', async () => {
    const duplicateQueryBundle = JSON.stringify({
      catalog: [{ description: 'd', name: 'aidp' }],
      document: 'Skill catalog:\n- aidp: d',
      instructions: 'Return the matching skill name or NO_SKILL.',
      names: ['aidp'],
      prompts: [
        { query: 'same query', query_id: 'a1', run: 1 },
        { query: 'same query', query_id: 'a2', run: 1 },
        { query: 'held out', query_id: 'av', run: 1 },
      ],
    });
    const duplicateQueryAnswers = `${[
      { query_id: 'a1', run: 1, skill_name: 'aidp' },
      { query_id: 'a2', run: 1, skill_name: 'NO_SKILL' },
      { query_id: 'av', run: 1, skill_name: 'aidp' },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n')}\n`;
    const expectedLog = readerLogFor(currentFingerprint(true), 3, 2);
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      readerAnswers: [duplicateQueryAnswers],
      readerBundles: [duplicateQueryBundle],
      readerLogs: [expectedLog],
      tempDirs: ['/work/deduplicated-reader'],
    });

    expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    const receipt = JSON.parse(
      harness.files.get(join(globalRoot, CATALOG_RECEIPT_PATH)) ?? '{}',
    ) as { runId?: string };
    const run = JSON.parse(
      harness.files.get(catalogRunPathFor(join, receipt.runId ?? 'missing-run-id')) ?? '{}',
    ) as { readonly readerGenerations?: readonly Record<string, unknown>[] };

    expect(run.readerGenerations?.[0]).toMatchObject({
      answerRows: 3,
      answersSha256: hash(duplicateQueryAnswers),
      bundleSha256: hash(duplicateQueryBundle),
      distinctQueryCount: 2,
      generatedQueryCount: 2,
      logSha256: hash(expectedLog),
      promptRows: 3,
      readerInvocationId: 'deduplicated-reader',
    });
  });
};

const registerCatalogGenerationInvocationUniquenessTests = (context: CentralTestContext): void => {
  const { verifyRouting } = context;
  test('verification rejects invocation ids reused across separate catalog runs', async () => {
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
      rewriteCatalogRun(
        context,
        harness,
        String(row.runId),
        (run) => {
          const generations = run.readerGenerations as Record<string, unknown>[];
          generations[0] = { ...generations[0], readerInvocationId: 'same-reader-process' };
        },
        { refreshSummary: true },
      );
    }

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'needs 5 distinct reader invocations',
    );
  });

  test('verification rejects reader invocation ids reused across different skills and runs', async () => {
    const skills = ['aidp', 'aidx'] as const;
    const triggerSets = { aidp: context.triggerSet, aidx: context.triggerSet };
    const manifest = catalogManifestJson(CATALOG_TRIGGER_PATH, {
      inputs: {
        activationSets: skills.map((skill) => ({
          path: `evals/skills/${skill}/trigger-queries.json`,
          skill,
        })),
      },
      inventory: { skills: skills.length },
      sources: skills.map((skill) => ({ skill, sourcePath: `skills/${skill}/SKILL.md` })),
    });
    const harness = catalogHarness(context, manifest, {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      tempDirs: Array.from({ length: 10 }, (_value, index) => `/work/reader-${index + 1}`),
      tree: globalTreeFor(context.globalRoot, context.join, skills),
      triggerSets,
    });
    for (let index = 0; index < 5; index += 1) {
      expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    }
    const rows = catalogLedgerRows(context, harness);
    const firstRunId = String(rows[0]?.runId);
    const secondRunId = String(rows[1]?.runId);
    const firstRun = JSON.parse(
      harness.files.get(catalogRunPathFor(context.join, firstRunId)) ?? '{}',
    ) as { readonly readerGenerations: readonly Record<string, unknown>[] };
    const sharedInvocationId = String(
      firstRun.readerGenerations.find((generation) => generation.skill === 'aidp')
        ?.readerInvocationId,
    );
    rewriteCatalogRun(
      context,
      harness,
      secondRunId,
      (run) => {
        const generations = run.readerGenerations as Record<string, unknown>[];
        const aidx = generations.find((generation) => generation.skill === 'aidx');
        if (aidx !== undefined) {
          Object.assign(aidx, { readerInvocationId: sharedInvocationId });
        }
      },
      { refreshSummary: true },
    );

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'globally unique reader invocations',
    );
  });
};

const registerCatalogGenerationLedgerIntegrityTests = (context: CentralTestContext): void => {
  const { globalRoot, join, verifyRouting } = context;
  test.each<[string, unknown]>([
    ['non-object', null],
    ['mismatched', { count: 99, evidenceSha256: 'wrong', freshCount: 99 }],
  ])(
    'verification rejects a %s ledger summary changed independently of its run reference',
    async (_label, readerGenerationSummary) => {
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
      const ledgerPath = join(globalRoot, CATALOG_LEDGER_PATH);
      const rows = catalogLedgerRows(context, harness);
      const latest = rows.at(-1);
      if (latest !== undefined) {
        latest.readerGenerationSummary = readerGenerationSummary;
      }
      harness.files.set(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

      expect((await verifyRouting(harness.deps)).join('\n')).toContain(
        'does not match its ledger generation summary',
      );
    },
  );

  test('verification rejects portable evidence changed without updating its checksum', async () => {
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
    const ledgerPath = join(globalRoot, CATALOG_LEDGER_PATH);
    const rows = catalogLedgerRows(context, harness);
    const latest = rows.at(-1);
    const evidence = latest?.portableRunEvidence;
    if (latest !== undefined && typeof evidence === 'object' && evidence !== null) {
      latest.portableRunEvidence = {
        ...(evidence as Record<string, unknown>),
        runId: 'tampered-run',
      };
    }
    harness.files.set(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'has invalid portable run evidence',
    );
  });

  test('verification rejects portable evidence bound to a different ledger run id', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      tempDirs: ['/work/reader-one'],
    });
    expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    const ledgerPath = join(globalRoot, CATALOG_LEDGER_PATH);
    const rows = catalogLedgerRows(context, harness);
    const latest = rows.at(-1);
    const evidence = latest?.portableRunEvidence;
    if (latest !== undefined && typeof evidence === 'object' && evidence !== null) {
      const altered = {
        ...(evidence as Record<string, unknown>),
        runId: 'different-run-id',
      };
      latest.portableRunEvidence = altered;
      latest.portableRunEvidenceSha256 = hash(JSON.stringify(canonicalizeForTest(altered)));
    }
    harness.files.set(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'portable evidence does not match its ledger entry',
    );
  });
};

const registerCatalogGenerationReaderIdentityTests = (context: CentralTestContext): void => {
  const { verifyRouting } = context;
  test('verification rejects a stale top-level reader fingerprint in the latest five runs', async () => {
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
    const oldestRunId = String(catalogLedgerRows(context, harness)[0]?.runId);
    rewriteCatalogRun(context, harness, oldestRunId, (run) => {
      const fingerprint = run.fingerprint as Record<string, unknown>;
      run.fingerprint = { ...fingerprint, readerVersion: 'stale-reader-version' };
    });

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'match the current source, sets, manifest, and model fingerprint',
    );
  });

  test('verification rejects stale model identity in per-skill generation evidence', async () => {
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
    const oldestRunId = String(catalogLedgerRows(context, harness)[0]?.runId);
    rewriteCatalogRun(
      context,
      harness,
      oldestRunId,
      (run) => {
        const generations = run.readerGenerations as Record<string, unknown>[];
        generations[0] = { ...generations[0], modelRevision: 'stale-model-revision' };
      },
      { refreshSummary: true },
    );

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'contains stale reader identity evidence',
    );
  });
};

const registerCatalogGenerationRunCountTests = (context: CentralTestContext): void => {
  const { join, verifyRouting } = context;
  test.each([3, 4])('default stability threshold rejects %i of 5 fresh runs', async (count) => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      tempDirs: ['/work/reader-one', '/work/reader-two', '/work/reader-three', '/work/reader-four'],
    });
    for (let index = 0; index < count; index += 1) {
      expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    }

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      `Catalog activation stability needs 5 fresh runs; found ${count}/5.`,
    );
  });

  test('five fresh current runs pass with distinct invocation ids and identical per-skill answers', async () => {
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

    expect(catalogLedgerRows(context, harness)).toHaveLength(5);
    expect(await verifyRouting(harness.deps)).toEqual([]);
  });

  test('verification rejects a latest activation entry without portable evidence', async () => {
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
    const ledgerPath = join(context.globalRoot, CATALOG_LEDGER_PATH);
    const rows = catalogLedgerRows(context, harness);
    const latest = rows.at(-1);
    if (latest !== undefined) {
      delete latest.portableRunEvidence;
      delete latest.portableRunEvidenceSha256;
    }
    harness.files.set(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'must all have portable schema-2 run evidence',
    );
  });

  test('explicit activationRuns 3 accepts three matching fresh runs', async () => {
    const harness = catalogHarness(
      context,
      catalogManifestJson(CATALOG_TRIGGER_PATH, { activationRuns: 3 }),
      {
        measure: EQUAL_WITH_FAILURE_MEASUREMENT,
        tempDirs: ['/work/reader-one', '/work/reader-two', '/work/reader-three'],
      },
    );
    for (let index = 0; index < 3; index += 1) {
      expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    }

    expect(catalogLedgerRows(context, harness)).toHaveLength(3);
    expect(await verifyRouting(harness.deps)).toEqual([]);
  });

  test('activationRuns has no arbitrary upper limit', async () => {
    const harness = catalogHarness(
      context,
      catalogManifestJson(CATALOG_TRIGGER_PATH, { activationRuns: 6 }),
      {
        measure: EQUAL_WITH_FAILURE_MEASUREMENT,
        tempDirs: [
          '/work/reader-one',
          '/work/reader-two',
          '/work/reader-three',
          '/work/reader-four',
          '/work/reader-five',
          '/work/reader-six',
        ],
      },
    );
    for (let index = 0; index < 6; index += 1) {
      expect(await recordFreshCatalogRun(context, harness)).toBe(0);
    }

    expect(catalogLedgerRows(context, harness)).toHaveLength(6);
    expect(await verifyRouting(harness.deps)).toEqual([]);
  });

  test('recordFreshCatalogRun reports a rejected record output', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    harness.output.push('reader record failed');
    const failingContext = { ...context, record: async () => 1 };

    await expect(recordFreshCatalogRun(failingContext, harness)).rejects.toThrow(
      'reader record failed',
    );
  });

  test('rewriteCatalogRun rejects an id without a ledger row', () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));

    expect(() => rewriteCatalogRun(context, harness, 'missing-run-id', () => {})).toThrow(
      'No catalog ledger row for missing-run-id',
    );
  });
};

const registerCatalogGenerationSourceFingerprintTests = (context: CentralTestContext): void => {
  const { verifyRouting } = context;
  test('verification rejects stale trigger-set or manifest fingerprints', async () => {
    const scenarios = [
      [
        'manifest',
        (context: CentralTestContext, harness: CentralTestHarness) => {
          const manifestPath = context.join(context.globalRoot, CATALOG_MANIFEST_PATH);
          harness.files.set(manifestPath, `${harness.files.get(manifestPath) ?? ''} `);
        },
        'does not match the current catalog manifest',
      ],
      [
        'set',
        (context: CentralTestContext, harness: CentralTestHarness) => {
          const setPath = context.join(context.globalRoot, CATALOG_TRIGGER_PATH);
          harness.files.set(setPath, `${harness.files.get(setPath) ?? ''} `);
        },
        'trigger query set changed after the routing receipt was recorded',
      ],
    ] as const;
    for (const [label, stale, expected] of scenarios) {
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
      stale(context, harness);
      expect((await verifyRouting(harness.deps)).join('\n'), `${label} fingerprint`).toContain(
        expected,
      );
    }
  });

  test('verification rejects a changed catalog description source', async () => {
    let changed = false;
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      measure: EQUAL_WITH_FAILURE_MEASUREMENT,
      overrides: (spec) =>
        changed && spec.args.includes('bundle')
          ? {
              code: 0,
              stderr: '',
              stdout: JSON.stringify({ catalog: [{ description: 'changed', name: 'aidp' }] }),
            }
          : undefined,
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
    changed = true;

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'skill description changed after the routing receipt was recorded',
    );
  });
};

const registerCatalogReaderAndLedgerFailures = (context: CentralTestContext): void => {
  const { globalRoot, join, record, verifyRouting } = context;
  test.each([
    ['failed command', { code: 1, stderr: 'bundle failed', stdout: '' }],
    ['malformed bundle', { code: 0, stderr: '', stdout: '{' }],
  ] as const)('blocks catalog routing when train bundle returns a %s', async (_label, result) => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      overrides: (spec) => (spec.args.includes('bundle') ? result : undefined),
    });

    expect(await record(['descriptions'], {}, harness.deps)).toBe(1);
    expect(harness.output.join('')).toContain('Could not read the skill catalog');
    expect(harness.files.has(join(globalRoot, CATALOG_RECEIPT_PATH))).toBe(false);
  });

  test.each([
    ['missing', undefined, 'Catalog ledger is missing'],
    ['invalid JSON', '{', 'Catalog ledger line 1 is malformed'],
    ['invalid row', '{}', 'Catalog ledger line 1 is malformed or duplicates a run id'],
  ] as const)('blocks routing when the catalog ledger is %s', async (_label, ledger, message) => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    const ledgerPath = join(globalRoot, CATALOG_LEDGER_PATH);
    if (ledger === undefined) {
      harness.files.delete(ledgerPath);
    } else {
      harness.files.set(ledgerPath, ledger);
    }

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(message);
    expect(harness.executorCalls()).toBe(0);
  });
};

const registerCatalogReceiptIntegrityTests = (context: CentralTestContext): void => {
  const { globalRoot, join, record, verifyRouting } = context;
  test.each([
    [
      'edited catalog hash',
      (receipt: Record<string, unknown>) => {
        receipt.catalogManifestSha256 = 'stale-manifest-hash';
      },
      'does not match the current catalog manifest',
    ],
    [
      'missing run reference',
      (receipt: Record<string, unknown>) => {
        delete receipt.runId;
        delete receipt.runReferenceSha256;
      },
      'has no run id or sealed run reference',
    ],
  ] as const)(
    'verification rejects a %s in the sealed catalog receipt',
    async (_label, edit, expected) => {
      const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
      expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
      const receiptPath = join(globalRoot, CATALOG_RECEIPT_PATH);
      const current = JSON.parse(harness.files.get(receiptPath) ?? '{}') as Record<string, unknown>;
      delete current.selfSha256;
      edit(current);
      harness.files.set(
        receiptPath,
        context.formatReceipt(
          context.sealReceipt(current as unknown as Omit<Receipt, 'selfSha256'>),
        ),
      );

      expect((await verifyRouting(harness.deps)).join('\n')).toContain(expected);
    },
  );

  test('verification requires the receipt to reference the latest catalog ledger entry', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    harness.files.set(join(globalRoot, CATALOG_LEDGER_PATH), '');

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'no matching latest ledger and run-reference entry',
    );
  });

  test('verification identifies a changed central trigger set', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    harness.files.set(join(globalRoot, CATALOG_TRIGGER_PATH), `${context.triggerSet} `);
    expect((await verifyRouting(harness.deps)).join('\n')).toContain('trigger query set changed');
  });

  test('verification identifies a changed skill catalog description hash', async () => {
    let bundle = JSON.stringify({
      catalog: [{ description: 'd', name: 'aidp' }],
      prompts: [
        { query: 'Plan it', query_id: 'a1', run: 1 },
        { query: 'Hello', query_id: 'a2', run: 1 },
        { query: 'Held out', query_id: 'av', run: 1 },
      ],
    });
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
      overrides: (spec) =>
        spec.args.includes('bundle') ? { code: 0, stderr: '', stdout: bundle } : undefined,
    });
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    bundle = JSON.stringify({
      catalog: [{ description: 'changed', name: 'aidp' }],
      prompts: [
        { query: 'Plan it', query_id: 'a1', run: 1 },
        { query: 'Hello', query_id: 'a2', run: 1 },
        { query: 'Held out', query_id: 'av', run: 1 },
      ],
    });

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'skill description changed after the routing receipt was recorded',
    );
  });

  test('verification ignores a changed machine-local raw run payload', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH), {
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
    const latestRunId = String(catalogLedgerRows(context, harness).at(-1)?.runId);
    const runPath = catalogRunPathFor(join, latestRunId);
    harness.files.set(runPath, `${harness.files.get(runPath) ?? ''} `);

    expect(await verifyRouting(harness.deps)).toEqual([]);
  });

  test('verification rejects when the ledger omits the receipt-bound run hash', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);
    const rows = catalogLedgerRows(context, harness);
    const row = rows[0];
    if (row !== undefined) {
      delete row.runReferenceSha256;
    }
    harness.files.set(
      join(globalRoot, CATALOG_LEDGER_PATH),
      `${rows.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    );

    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'no matching latest ledger and run-reference entry',
    );
  });
};

const registerCatalogTriggerSetTest = (context: CentralTestContext): void => {
  const { globalRoot, join, record, routingReceipt, verifyRouting } = context;
  test('global routing uses central trigger sets and the catalog receipt path', async () => {
    const harness = catalogHarness(context, catalogManifestJson(CATALOG_TRIGGER_PATH));
    const packageTriggerPath = join(globalRoot, 'skills', 'aidp', 'evals', 'trigger-queries.json');
    harness.files.set(packageTriggerPath, '{"queries":[]}');

    expect(await record(['descriptions'], {}, harness.deps)).toBe(0);

    expect(harness.readPaths).toContain(join(globalRoot, CATALOG_TRIGGER_PATH));
    expect(harness.readPaths).not.toContain(packageTriggerPath);
    expect(harness.files.has(join(globalRoot, CATALOG_RECEIPT_PATH))).toBe(true);
    expect(harness.files.has(join(globalRoot, routingReceipt))).toBe(false);
    expect((await verifyRouting(harness.deps)).join('\n')).toContain(
      'Catalog activation stability needs 5 fresh runs; found 1/5.',
    );
  });
};

const registerCentralDocumentRecordTest = (context: CentralTestContext): void => {
  const {
    centralReceipt,
    centralSet,
    document,
    globalRoot,
    join,
    makeHarness,
    receipt,
    record,
    set,
    setText,
  } = context;
  test('global skill recording consumes central comprehension and writes the owner receipt', async () => {
    const harness = makeHarness({ agentsRoot: globalRoot, toolsRoot: globalRoot });
    harness.files.set(join(globalRoot, document), 'central source');
    harness.files.set(join(globalRoot, centralSet), setText);
    harness.files.set(join(globalRoot, set), '{"queries":[]}');
    harness.files.set(
      join(globalRoot, centralSet.replace('/comprehension/', '/atoms/').replace(/\.json$/u, '.md')),
      '---\ntype: atom-map\ntitle: t\ndescription: d\ntags: [atoms]\nschemaVersion: 1\nsource: skills/aidp/SKILL.md\natoms: []\n---\nbody',
    );

    expect(await record([document], {}, harness.deps)).toBe(0);

    expect(harness.readPaths).toContain(join(globalRoot, centralSet));
    expect(harness.readPaths).not.toContain(join(globalRoot, set));
    expect(harness.files.has(join(globalRoot, centralReceipt))).toBe(true);
    expect(harness.files.has(join(globalRoot, receipt))).toBe(false);
    expect(JSON.parse(harness.files.get(join(globalRoot, centralReceipt)) ?? '{}')).toMatchObject({
      document,
      setPath: centralSet,
    });
  });
};

const registerCentralEnumerationTest = (context: CentralTestContext): void => {
  const { globalRoot, instructionDocuments, join, makeHarness } = context;
  test('global enumeration excludes package evals and includes the central skill rubric', async () => {
    const tree = {
      [globalRoot]: [
        { isDirectory: false, name: 'AGENTS.md' },
        { isDirectory: true, name: 'evals' },
        { isDirectory: true, name: 'skills' },
      ],
      [join(globalRoot, 'skills')]: [
        { isDirectory: true, name: 'aidp' },
        { isDirectory: true, name: 'no-skill-markdown' },
      ],
      [join(globalRoot, 'skills', 'aidp')]: [
        { isDirectory: false, name: 'SKILL.md' },
        { isDirectory: true, name: 'evals' },
        { isDirectory: true, name: 'references' },
      ],
      [join(globalRoot, 'skills', 'aidp', 'evals')]: [
        { isDirectory: false, name: 'rubric.md' },
        { isDirectory: true, name: 'comprehension' },
      ],
      [join(globalRoot, 'skills', 'aidp', 'evals', 'comprehension')]: [
        { isDirectory: false, name: 'SKILL.json' },
      ],
      [join(globalRoot, 'skills', 'aidp', 'references')]: [{ isDirectory: false, name: 'deep.md' }],
    };
    const harness = makeHarness({ agentsRoot: globalRoot, toolsRoot: globalRoot, tree });

    expect(await instructionDocuments(harness.deps)).toEqual([
      'AGENTS.md',
      'evals/skills/aidp/rubric.md',
      'skills/aidp/SKILL.md',
      'skills/aidp/references/deep.md',
    ]);
  });
};

export const registerCatalogGenerationTests = (context: CentralTestContext): void => {
  registerCatalogGenerationAnswerStabilityTests(context);
  registerCatalogGenerationCreationTests(context);
  registerCatalogGenerationInvocationUniquenessTests(context);
  registerCatalogGenerationLedgerIntegrityTests(context);
  registerCatalogGenerationReaderIdentityTests(context);
  registerCatalogGenerationRunCountTests(context);
  registerCatalogGenerationSourceFingerprintTests(context);
  registerCatalogTriggerSetTest(context);
  registerCentralDocumentRecordTest(context);
  registerCentralEnumerationTest(context);
  registerCatalogReaderAndLedgerFailures(context);
  registerCatalogReceiptIntegrityTests(context);
};
