import { expect, mock, test } from 'bun:test';

import {
  type AidlcCloseoutDependencies,
  closeoutDependenciesFor,
  defaultCloseoutDependencies,
  run,
} from '../../scripts/aidlc.js';
import type { AidlcGateExecutor } from '../../utils/aidlc/gate.js';
import {
  type AidlcIntent,
  completeAidlcStage,
  createAidlcIntent,
  type retireAidlcIntent,
} from '../../utils/aidlc/intent.js';

const atApprovalHandoff = (uiRequired = false) => {
  let intent = createAidlcIntent('repo', 'Combined approval', { uiRequired });
  while (intent.stage !== 'approval-handoff') {
    intent = completeAidlcStage(intent, 'Established evidence.');
  }
  return intent;
};

const atBuildAndTest = () => {
  const initial = createAidlcIntent('repo', 'Atomic terminal', {
    projectRoot: '/project-without-a-config',
  });
  return {
    ...initial,
    route: initial.route.map((record) => ({
      ...record,
      status:
        record.slug === 'build-and-test'
          ? ('active' as const)
          : ('completed' as const),
    })),
    stage: 'build-and-test' as const,
  };
};

const afterFinalGate = (): AidlcIntent => {
  const intent = atBuildAndTest();
  return {
    ...intent,
    route: intent.route.map((record) => ({
      ...record,
      status: 'completed' as const,
    })),
  };
};

const firstCompressionEntryFor = (intent: AidlcIntent) => {
  const session = intent.kbCompressionSession;
  if (!session) {
    return undefined;
  }
  return 'entries' in session ? session.entries[0] : session;
};

const missingFile = (): Error & { readonly code: 'ENOENT' } =>
  Object.assign(new Error('missing'), { code: 'ENOENT' as const });

const closeoutDependencies = (): {
  readonly dependencies: AidlcCloseoutDependencies;
  readonly files: Map<string, string>;
} => {
  const files = new Map<string, string>();
  return {
    dependencies: {
      clock: { now: () => 100 },
      digest: { sha256: () => 'hash' },
      fileSystem: {
        mkdir: mock(async () => undefined),
        readFile: mock(async (path: string) => {
          const content = files.get(path);
          if (content === undefined) {
            throw missingFile();
          }
          return content;
        }),
        rm: mock(async (path: string) => {
          files.delete(path);
        }),
        writeFile: mock(async (path: string, content: string) => {
          files.set(path, content);
        }),
      },
      readRequest: mock(async (_path: string) =>
        JSON.stringify({
          body: 'Keep the durable `token` while making this concise.',
          evidence: 'The completed workflow proved this durable practice.',
          metadata: {
            description: 'A tested closeout practice.',
            tags: ['aidlc', 'md-compress'],
            title: 'Typed closeout session',
            type: 'practice',
          },
          relativePath: 'Users-rhuang/project/typed-closeout-session.md',
        }),
      ),
    },
    files,
  };
};

test('approves and resolves already-known empty KB bindings in one command', async () => {
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  await run(
    [
      'approve',
      '/agents/aidlc/repo/intents/combined-approval.md',
      'The user explicitly approved the established plan.',
      '--context',
      '/private-kb',
      '-',
      '-',
      '-',
    ],
    undefined,
    write,
    mock(async () => atApprovalHandoff()),
    update,
    appendAudit,
  );
  expect(update).toHaveBeenCalledTimes(2);
  expect(appendAudit).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('reverse-engineering'),
  );
  expect(write).not.toHaveBeenCalledWith(
    expect.stringContaining('resolve-knowledge-context'),
  );
});

test('resolves context after approval without recording a second approval', async () => {
  const initial = atApprovalHandoff();
  const approved = {
    ...initial,
    approval: 'approved' as const,
    route: initial.route.map((record) => ({
      ...record,
      status:
        record.slug === 'approval-handoff'
          ? ('completed' as const)
          : record.slug === 'reverse-engineering'
            ? ('active' as const)
            : record.status,
    })),
    stage: 'reverse-engineering' as const,
  };
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  await run(
    [
      'approve',
      '/agents/aidlc/repo/intents/context-followup.md',
      '--context',
      '/private-kb',
      '-',
      '-',
      '-',
    ],
    undefined,
    write,
    mock(async () => approved),
    update,
    appendAudit,
  );
  expect(update).toHaveBeenCalledTimes(1);
  expect(appendAudit).toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/context-followup.md',
    expect.objectContaining({ type: 'context-resolved' }),
  );
  expect(appendAudit).not.toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/context-followup.md',
    expect.objectContaining({ type: 'approval-granted' }),
  );
  expect(write).not.toHaveBeenCalledWith(
    expect.stringContaining('resolve-knowledge-context'),
  );
});

test('rejects malformed post-approval context without changing lifecycle state', async () => {
  const update = mock(async () => undefined);
  await expect(
    run(
      [
        'approve',
        '/agents/aidlc/repo/intents/malformed-context-followup.md',
        'not-context',
        '/private-kb',
        '-',
        '-',
        '-',
        '-',
      ],
      undefined,
      mock(),
      mock(async () => atApprovalHandoff()),
      update,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('AIDLC command catalog');
  expect(update).not.toHaveBeenCalled();
});

test('validates combined approval context before changing lifecycle state', async () => {
  const update = mock(async () => undefined);
  await expect(
    run(
      [
        'approve',
        '/agents/aidlc/repo/intents/invalid-combined-approval.md',
        'The user explicitly approved the established plan.',
        '--context',
        '/private-kb',
        'not-a-concept.md',
        '-',
        '-',
      ],
      undefined,
      mock(),
      mock(async () => atApprovalHandoff()),
      update,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('Invalid AIDLC knowledge binding');
  expect(update).not.toHaveBeenCalled();
});

test('approves, resolves context, and records established post-approval evidence atomically', async () => {
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  await run(
    [
      'approve',
      '/agents/aidlc/repo/intents/combined-approval-record.md',
      'The user explicitly approved the established plan.',
      '--context',
      '/private-kb',
      '-',
      '-',
      '-',
      '--record',
      JSON.stringify([
        {
          evidence: 'Existing browser structure and behavior were verified.',
          outcome: 'complete',
          stage: 'reverse-engineering',
        },
        {
          evidence: 'UI behavior and preservation requirements are explicit.',
          outcome: 'complete',
          stage: 'requirements-analysis',
        },
      ]),
    ],
    undefined,
    write,
    mock(async () => atApprovalHandoff(true)),
    update,
    appendAudit,
  );
  expect(update).toHaveBeenCalledTimes(4);
  expect(appendAudit).toHaveBeenCalledTimes(4);
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('refined-mockups'),
  );
});

test('validates a combined post-approval record before changing lifecycle state', async () => {
  const update = mock(async () => undefined);
  await expect(
    run(
      [
        'approve',
        '/agents/aidlc/repo/intents/invalid-combined-approval-record.md',
        'The user explicitly approved the established plan.',
        '--context',
        '/private-kb',
        '-',
        '-',
        '-',
        '--record',
        JSON.stringify([
          {
            evidence: 'This does not start at Reverse Engineering.',
            outcome: 'complete',
            stage: 'requirements-analysis',
          },
        ]),
      ],
      undefined,
      mock(),
      mock(async () => atApprovalHandoff()),
      update,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('must be consecutive');
  expect(update).not.toHaveBeenCalled();
});

test('runs the final gate, persists an explicit no-capture closeout, and retires atomically', async () => {
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  const write = mock();
  const executeGate = mock(() => ({
    status: 0,
  })) as unknown as AidlcGateExecutor;
  await run(
    [
      'complete',
      '/agents/aidlc/repo/intents/atomic-terminal.md',
      '--closeout',
      '--no-durable-lesson',
      'Knowledge-base assessed this temporary task as having no durable lesson.',
    ],
    undefined,
    write,
    mock(async () => atBuildAndTest()),
    update,
    appendAudit,
    retire,
    undefined,
    undefined,
    executeGate,
  );
  expect(executeGate).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(2);
  expect(appendAudit).toHaveBeenCalledTimes(2);
  expect(retire).toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/atomic-terminal.md',
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"retired"'));
});

test('revalidates a previously passed final gate without reopening Build and Test', async () => {
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  const executeGate = mock(() => ({ status: 0 }));
  await run(
    ['complete', '/agents/aidlc/repo/intents/revalidated-terminal.md'],
    undefined,
    write,
    mock(async () => afterFinalGate()),
    update,
    appendAudit,
    undefined,
    undefined,
    undefined,
    executeGate as unknown as AidlcGateExecutor,
  );
  expect(executeGate).toHaveBeenCalledTimes(1);
  expect(update).not.toHaveBeenCalled();
  expect(appendAudit).toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/revalidated-terminal.md',
    expect.objectContaining({ type: 'final-gate-revalidated' }),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('knowledge-base-closeout-and-recover'),
  );
});

test('recovers an interrupted atomic retirement without exposing retire', async () => {
  const initial = atBuildAndTest();
  const intent = {
    ...initial,
    kbCloseout: {
      completedAt: '2026-08-01T00:00:00.000Z',
      disposition: 'no-durable-lesson' as const,
      evidence: 'Knowledge-base found no durable lesson.',
      references: [],
    },
    route: initial.route.map((record) => ({
      ...record,
      status: 'completed' as const,
    })),
  };
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  await run(
    [
      'recover',
      '/agents/aidlc/repo/intents/interrupted-retirement.md',
      '--retire-only',
    ],
    undefined,
    mock(),
    mock(async () => intent),
    update,
    appendAudit,
    retire,
  );
  expect(retire).toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/interrupted-retirement.md',
  );
  expect(update).not.toHaveBeenCalled();
  expect(appendAudit).not.toHaveBeenCalled();
});

test('rejects retire-only recovery without a persisted KB closeout', async () => {
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  await expect(
    run(
      [
        'recover',
        '/agents/aidlc/repo/intents/missing-closeout.md',
        '--retire-only',
      ],
      undefined,
      mock(),
      mock(async () => atBuildAndTest()),
      mock(async () => undefined),
      mock(async () => undefined),
      retire,
    ),
  ).rejects.toThrow('requires a persisted knowledge-base closeout');
  expect(retire).not.toHaveBeenCalled();
});

test('does not close out or retire when the atomic final gate fails', async () => {
  const update = mock(async () => undefined);
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  try {
    await run(
      [
        'complete',
        '/agents/aidlc/repo/intents/failed-atomic-terminal.md',
        '--closeout',
        '--no-durable-lesson',
        'Knowledge-base assessed this temporary task as having no durable lesson.',
      ],
      undefined,
      mock(),
      mock(async () => atBuildAndTest()),
      update,
      mock(async () => undefined),
      retire,
      undefined,
      undefined,
      mock(() => ({ status: 3 })) as unknown as AidlcGateExecutor,
    );
    expect(update).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(3);
  } finally {
    process.exitCode = 0;
  }
});

test('rejects an atomic closeout outside active Build and Test', async () => {
  await expect(
    run(
      [
        'complete',
        '/agents/aidlc/repo/intents/not-terminal.md',
        '--closeout',
        '--no-durable-lesson',
        'Knowledge-base assessed this temporary task as having no durable lesson.',
      ],
      undefined,
      mock(),
      mock(async () => createAidlcIntent('repo', 'Not terminal')),
      mock(async () => undefined),
      mock(async () => undefined),
    ),
  ).rejects.toThrow('only at active Build and Test');
});

test('records Code Generation, gates, and retires in one closeout batch', async () => {
  const initial = atBuildAndTest();
  const intent = {
    ...initial,
    route: initial.route.map((record) => ({
      ...record,
      status:
        record.slug === 'code-generation'
          ? ('active' as const)
          : record.slug === 'build-and-test'
            ? ('pending' as const)
            : ('completed' as const),
    })),
    stage: 'code-generation' as const,
  };
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  await run(
    [
      'record',
      '/agents/aidlc/repo/intents/atomic-record-terminal.md',
      JSON.stringify([
        {
          evidence: 'Implementation and acceptance checks are complete.',
          outcome: 'complete',
          stage: 'code-generation',
        },
      ]),
      '--final-gate',
      '--closeout',
      '--no-durable-lesson',
      'Knowledge-base assessed this temporary task as having no durable lesson.',
    ],
    undefined,
    mock(),
    mock(async () => intent),
    mock(async () => undefined),
    mock(async () => undefined),
    retire,
    undefined,
    undefined,
    mock(() => ({ status: 0 })) as unknown as AidlcGateExecutor,
  );
  expect(retire).toHaveBeenCalledTimes(1);
});

test('captures, guards, validates, persists closeout, and retires through one typed session', async () => {
  let persisted = afterFinalGate();
  const { dependencies, files } = closeoutDependencies();
  const update = mock(
    async (_fileSystem: unknown, _path: string, next: AidlcIntent) => {
      persisted = next;
    },
  );
  const appendAudit = mock(async () => undefined);
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  const write = mock();
  const intentPath = '/agents/aidlc/repo/intents/typed-closeout.md';

  await run(
    ['capture-and-begin', intentPath, '/private-kb', '/request/capture.json'],
    undefined,
    write,
    mock(async () => persisted),
    update,
    appendAudit,
    retire,
    undefined,
    undefined,
    undefined,
    '/project',
    dependencies,
  );

  const entry = firstCompressionEntryFor(persisted);
  expect(entry?.sourcePath).toBe(
    '/private-kb/Users-rhuang/project/typed-closeout-session.md',
  );
  expect(files.get(entry?.backupPath ?? '')).toContain('`token`');
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('edit-sources-then-finalize-and-recover'),
  );

  await expect(
    run(
      ['capture-and-begin', intentPath, '/private-kb', '/request/capture.json'],
      undefined,
      mock(),
      mock(async () => persisted),
      update,
      appendAudit,
      retire,
      undefined,
      undefined,
      undefined,
      '/project',
      dependencies,
    ),
  ).rejects.toThrow('knowledge compression is already active');

  await expect(
    run(
      ['recover', intentPath, '--retire-only'],
      undefined,
      mock(),
      mock(async () => persisted),
      update,
      appendAudit,
      retire,
      undefined,
      undefined,
      undefined,
      '/project',
      dependencies,
    ),
  ).rejects.toThrow('knowledge compression is active');

  files.set(
    entry?.sourcePath ?? '',
    `${files.get(entry?.sourcePath ?? '')}\n\nConcise durable result.`,
  );
  await run(
    ['finalize-and-recover', intentPath],
    undefined,
    write,
    mock(async () => persisted),
    update,
    appendAudit,
    retire,
    undefined,
    undefined,
    undefined,
    '/project',
    dependencies,
  );
  expect(persisted.kbCompressionSession).toBeUndefined();
  expect(persisted.kbCloseout?.references).toEqual([
    'Users-rhuang/project/typed-closeout-session.md',
  ]);
  expect(appendAudit).toHaveBeenCalledTimes(1);
  expect(retire).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"retired"'));
});

test('captures and guards every concept in one AIDLC reconciliation session', async () => {
  let persisted = afterFinalGate();
  const { dependencies, files } = closeoutDependencies();
  files.set(
    '/private-kb/Users-rhuang/testing/strategy.md',
    'Existing testing strategy with `preserved-token`.',
  );
  const reconciliation: AidlcCloseoutDependencies = {
    ...dependencies,
    digest: {
      sha256: (value: string) =>
        value.includes('strategy') ? 'strategy' : 'reconciliation',
    },
    readRequest: mock(async () =>
      JSON.stringify({
        canonicalPath: 'Users-rhuang/project/reconciliation.md',
        links: [
          {
            from: 'Users-rhuang/project/reconciliation.md',
            to: 'Users-rhuang/testing/strategy.md',
          },
        ],
        operations: [
          {
            body: '## Rule\n\nUse [testing strategy](/Users-rhuang/testing/strategy.md).',
            disposition: 'new-primary',
            evidence:
              'The implementation and its final gate verified the rule.',
            metadata: {
              description: 'Canonical reconciliation practice.',
              tags: ['aidlc', 'knowledge-base'],
              title: 'Reconciliation practice',
              type: 'practice',
            },
            relativePath: 'Users-rhuang/project/reconciliation.md',
          },
          {
            body: '## Related rule\n\nKeep `preserved-token`; see [reconciliation](/Users-rhuang/project/reconciliation.md).',
            disposition: 'link-related',
            evidence:
              'The implementation and its final gate verified the link.',
            metadata: {
              description: 'Related testing strategy.',
              tags: ['aidlc', 'testing'],
              title: 'Testing strategy',
              type: 'practice',
            },
            relativePath: 'Users-rhuang/testing/strategy.md',
          },
        ],
      }),
    ),
  };
  const update = mock(
    async (_fileSystem: unknown, _path: string, next: AidlcIntent) => {
      persisted = next;
    },
  );
  const appendAudit = mock(async () => undefined);
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  const write = mock();
  const intentPath = '/agents/aidlc/repo/intents/reconciliation-closeout.md';

  await run(
    ['capture-and-begin', intentPath, '/private-kb', '/request/reconcile.json'],
    undefined,
    write,
    mock(async () => persisted),
    update,
    appendAudit,
    retire,
    undefined,
    undefined,
    undefined,
    '/project',
    reconciliation,
  );

  const session = persisted.kbCompressionSession;
  const entries = session && 'entries' in session ? session.entries : [];
  const strategy = entries.find(
    (entry) => entry.reference === 'Users-rhuang/testing/strategy.md',
  );
  expect(entries).toHaveLength(2);
  expect(files.get(strategy?.backupPath ?? '')).toContain('`preserved-token`');
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('edit-sources-then-finalize-and-recover'),
  );

  await run(
    ['finalize-and-recover', intentPath],
    undefined,
    write,
    mock(async () => persisted),
    update,
    appendAudit,
    retire,
    undefined,
    undefined,
    undefined,
    '/project',
    reconciliation,
  );

  expect(persisted.kbCloseout?.references).toEqual([
    'Users-rhuang/testing/strategy.md',
    'Users-rhuang/project/reconciliation.md',
  ]);
  expect(retire).toHaveBeenCalledTimes(1);
  expect(files.has(strategy?.backupPath ?? '')).toBeFalse();
});

test('rejects malformed capture request before writing lifecycle state', async () => {
  const { dependencies } = closeoutDependencies();
  const malformed: AidlcCloseoutDependencies = {
    ...dependencies,
    readRequest: mock(async () => '{}'),
  };
  const update = mock(async () => undefined);
  await expect(
    run(
      [
        'capture-and-begin',
        '/agents/aidlc/repo/intents/malformed-capture.md',
        '/private-kb',
        '/request/capture.json',
      ],
      undefined,
      mock(),
      mock(async () => afterFinalGate()),
      update,
      mock(async () => undefined),
      mock(async () => undefined) as typeof retireAidlcIntent,
      undefined,
      undefined,
      undefined,
      '/project',
      malformed,
    ),
  ).rejects.toThrow('capture request requires');
  expect(update).not.toHaveBeenCalled();

  const malformedReconciliation: AidlcCloseoutDependencies = {
    ...dependencies,
    readRequest: mock(async () =>
      JSON.stringify({
        canonicalPath: 'Users-rhuang/project/reconciliation.md',
      }),
    ),
  };
  await expect(
    run(
      [
        'capture-and-begin',
        '/agents/aidlc/repo/intents/malformed-reconciliation.md',
        '/private-kb',
        '/request/reconcile.json',
      ],
      undefined,
      mock(),
      mock(async () => afterFinalGate()),
      update,
      mock(async () => undefined),
      mock(async () => undefined) as typeof retireAidlcIntent,
      undefined,
      undefined,
      undefined,
      '/project',
      malformedReconciliation,
    ),
  ).rejects.toThrow('reconciliation request requires');
  expect(update).not.toHaveBeenCalled();
});

test('rejects capture before the final gate and finalization without its session', async () => {
  const { dependencies } = closeoutDependencies();
  const update = mock(async () => undefined);
  const load = mock(async () => atBuildAndTest());
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  await expect(
    run(
      [
        'capture-and-begin',
        '/agents/aidlc/repo/intents/not-complete.md',
        '/private-kb',
        '/request/capture.json',
      ],
      undefined,
      mock(),
      load,
      update,
      mock(async () => undefined),
      retire,
      undefined,
      undefined,
      undefined,
      '/project',
      dependencies,
    ),
  ).rejects.toThrow('passed final gate');
  await expect(
    run(
      ['finalize-and-recover', '/agents/aidlc/repo/intents/no-session.md'],
      undefined,
      mock(),
      mock(async () => afterFinalGate()),
      update,
      mock(async () => undefined),
      retire,
      undefined,
      undefined,
      undefined,
      '/project',
      dependencies,
    ),
  ).rejects.toThrow('requires an active AIDLC knowledge compression session');
});

test('builds default closeout dependencies without exercising an external request boundary', () => {
  const defaults = defaultCloseoutDependencies();
  expect(defaults.clock.now()).toBeGreaterThan(0);
  expect(defaults.digest.sha256('typed-closeout')).toMatch(/^[a-f0-9]{64}$/u);
  const injected = closeoutDependenciesFor(
    { now: () => 100 },
    { sha256: () => 'hash' },
    closeoutDependencies().dependencies.fileSystem,
    mock(async () => '{}'),
  );
  expect(injected.clock.now()).toBe(100);
});
