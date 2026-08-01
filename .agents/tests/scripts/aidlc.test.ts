import { expect, mock, test } from 'bun:test';

import {
  resolveCbmIndexForStart,
  run,
  runMain,
  runWhenMain,
  usage,
  verifyCbmIndex,
} from '../../scripts/aidlc.js';
import type { AidlcGateExecutor } from '../../utils/aidlc/gate.js';
import {
  completeAidlcStage,
  createAidlcIntent,
  type retireAidlcIntent,
  type saveAidlcIntent,
} from '../../utils/aidlc/intent.js';

test('prepares one temporary AIDLC intent', async () => {
  const saved: unknown[][] = [];
  const save: typeof saveAidlcIntent = async (fileSystem, path, intent) => {
    saved.push([fileSystem, path, intent]);
  };
  const write = mock();
  const verify = mock(async () => undefined);
  await run(
    ['prepare', '/agents', 'repo', '/project', 'Build KB'],
    save,
    write,
    undefined,
    undefined,
    undefined,
    undefined,
    verify,
  );
  expect(saved[0]?.[1]).toBe('/agents/aidlc/repo/intents/build-kb.md');
  expect(saved[0]?.[2]).toMatchObject({
    stage: 'intent-capture',
    uiRequired: false,
  });
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining(
      '"intentPath":"/agents/aidlc/repo/intents/build-kb.md"',
    ),
  );
  expect(verify).toHaveBeenCalledWith('repo');
});

test('starts in one call by resolving the CBM index from the project root', async () => {
  const saved: unknown[][] = [];
  const save: typeof saveAidlcIntent = async (fileSystem, path, intent) => {
    saved.push([fileSystem, path, intent]);
  };
  const write = mock();
  await run(
    ['start', '/agents', '/project', 'Build KB'],
    save,
    write,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mock(async (projectRoot: string) => {
      expect(projectRoot).toBe('/project');
      return 'resolved-repo';
    }),
  );
  expect(saved[0]?.[1]).toBe('/agents/aidlc/resolved-repo/intents/build-kb.md');
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"cbmIndex":"resolved-repo"'),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"acceptanceChecklist"'),
  );
});

test('rejects a start command when no CBM resolver is configured', async () => {
  await expect(
    run(['start', '/agents', '/project', 'Build KB']),
  ).rejects.toThrow('requires CBM project resolution');
});

test('marks only the UI stage as applicable from prepare metadata', async () => {
  const saved: unknown[][] = [];
  const save: typeof saveAidlcIntent = async (fileSystem, path, intent) => {
    saved.push([fileSystem, path, intent]);
  };
  await run(
    ['prepare', '/agents', 'repo', '/project', 'Build UI', '--ui'],
    save,
    mock(),
    undefined,
    undefined,
    undefined,
    undefined,
    mock(async () => undefined),
  );
  expect(saved[0]?.[2]).toMatchObject({ uiRequired: true });
  expect(saved[0]?.[2]).toMatchObject({ stage: 'intent-capture' });
});

test('refuses to overwrite an active intent with the same deterministic id', async () => {
  const existing = createAidlcIntent('repo', 'Build KB');
  await expect(
    run(
      ['prepare', '/agents', 'repo', '/project', 'Build KB'],
      mock(async () => undefined),
      mock(),
      mock(async () => existing),
      undefined,
      undefined,
      undefined,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('ID collision');
});

test('surfaces a malformed existing intent instead of treating it as absent', async () => {
  await expect(
    run(
      ['prepare', '/agents', 'repo', '/project', 'Build KB'],
      mock(async () => undefined),
      mock(),
      mock(async () => {
        throw new Error('AIDLC intent frontmatter is invalid.');
      }),
      undefined,
      undefined,
      undefined,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('frontmatter is invalid');
});

test('rejects invalid commands and only runs the main boundary when requested', async () => {
  await expect(run([])).rejects.toThrow(usage());
  await expect(run(['advance'])).rejects.toThrow('cannot bypass');
  await expect(
    run(
      ['complete', '/agents/aidlc/repo/intents/x.md'],
      undefined,
      mock(),
      mock(async () => createAidlcIntent('repo', 'X')),
    ),
  ).rejects.toThrow(usage());
  const runner = mock(async () => undefined);
  runWhenMain(
    true,
    ['prepare', '/agents', 'repo', '/project', 'Build KB'],
    runner,
  );
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});

test('returns the command contract without a failing help probe', async () => {
  const write = mock();
  await run(['complete', '--help'], undefined, write);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
  expect(usage()).toContain('start <agents-root>');
});

test('main runner keeps CBM validation at the prepare boundary', async () => {
  await runMain(['queue', '/agents-that-do-not-exist', 'repo']);
});

test('requires a listed CBM project before a temporary intent is created', async () => {
  await expect(
    verifyCbmIndex('missing', async () => ({
      code: 0,
      stderr: '',
      stdout: '{"projects":[{"name":"known"}]}',
    })),
  ).rejects.toThrow('not a listed project');
  await expect(
    verifyCbmIndex('known', async () => ({
      code: 1,
      stderr: 'offline',
      stdout: '',
    })),
  ).rejects.toThrow('project list is unavailable');
});

test('resolves the startup CBM index through an injected project-list boundary', async () => {
  await expect(
    resolveCbmIndexForStart('/project', async () => ({
      code: 0,
      stderr: '',
      stdout: JSON.stringify({
        projects: [{ name: 'project', repository_path: '/project' }],
      }),
    })),
  ).resolves.toBe('project');
});

test('records stage evidence, skips with a reason, and approves only a gate', async () => {
  const intent = createAidlcIntent('repo', 'X');
  const save = mock(async () => undefined);
  const update = mock(async () => undefined);
  const write = mock();
  await run(
    ['complete', '/agents/aidlc/repo/intents/x.md', 'created record'],
    save,
    write,
    mock(async () => intent),
    update,
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"stage": "workspace-detection"'),
  );
  await run(
    [
      'skip',
      '/agents/aidlc/repo/intents/x.md',
      'already classified externally',
    ],
    save,
    write,
    mock(async () => intent),
    update,
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"stage": "workspace-detection"'),
  );
  await expect(
    run(
      ['approve', '/agents/aidlc/repo/intents/x.md'],
      save,
      write,
      mock(async () => intent),
      update,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('awaiting approval');
  let awaitingApproval = createAidlcIntent('repo', 'Approved');
  while (awaitingApproval.stage !== 'approval-handoff') {
    awaitingApproval = completeAidlcStage(awaitingApproval, 'evidence');
  }
  awaitingApproval = completeAidlcStage(awaitingApproval, 'plan ready');
  await run(
    ['approve', '/agents/aidlc/repo/intents/x.md'],
    save,
    write,
    mock(async () => awaitingApproval),
    update,
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('resolve-knowledge-context'),
  );
  expect(update).toHaveBeenCalledTimes(3);
});

test('records consecutive explicit stage outcomes in one response without crossing gates', async () => {
  const intent = createAidlcIntent('repo', 'Batch');
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  await run(
    [
      'record',
      '/agents/aidlc/repo/intents/batch.md',
      JSON.stringify([
        {
          evidence: 'workspace path is valid',
          outcome: 'complete',
          stage: 'workspace-scaffold',
        },
        {
          evidence: 'project root is known',
          outcome: 'complete',
          stage: 'workspace-detection',
        },
      ]),
    ],
    undefined,
    write,
    mock(async () => intent),
    update,
    appendAudit,
  );
  expect(update).toHaveBeenCalledTimes(2);
  expect(appendAudit).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"stage": "state-init"'),
  );
});

test('returns the active approval-handoff packet before plan evidence is recorded', async () => {
  let atScope = createAidlcIntent('repo', 'Approval packet');
  while (atScope.stage !== 'scope-definition') {
    atScope = completeAidlcStage(atScope, 'evidence');
  }
  const write = mock();
  await run(
    [
      'record',
      '/agents/aidlc/repo/intents/approval-packet.md',
      JSON.stringify([
        {
          evidence: 'Scope and acceptance criteria are explicit.',
          outcome: 'complete',
          stage: 'scope-definition',
        },
      ]),
    ],
    undefined,
    write,
    mock(async () => atScope),
    mock(async () => undefined),
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"stage": "approval-handoff"'),
  );
  expect(write).not.toHaveBeenCalledWith(
    expect.stringContaining('await-user-approval'),
  );
});

test('records an explicit skip when a batch outcome is inapplicable', async () => {
  const intent = createAidlcIntent('repo', 'Skipped batch stage');
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  await run(
    [
      'record',
      '/agents/aidlc/repo/intents/skipped-batch-stage.md',
      JSON.stringify([
        {
          evidence: 'workspace was already scaffolded by the project template',
          outcome: 'skip',
          stage: 'workspace-scaffold',
        },
      ]),
    ],
    undefined,
    mock(),
    mock(async () => intent),
    update,
    appendAudit,
  );
  expect(update).toHaveBeenCalledTimes(1);
  expect(appendAudit).toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/skipped-batch-stage.md',
    expect.objectContaining({ type: 'stage-skipped' }),
  );
});

test('rejects malformed, nonconsecutive, and boundary-crossing record batches', async () => {
  const intent = createAidlcIntent('repo', 'Batch validation');
  const dependencies = [
    undefined,
    mock(),
    mock(async () => intent),
    mock(async () => undefined),
    mock(async () => undefined),
  ] as const;
  for (const [input, message] of [
    ['not json', 'valid JSON'],
    ['[]', 'one or more'],
    [JSON.stringify([null]), 'must be an object'],
    [
      JSON.stringify([{ evidence: 'x', stage: 'workspace-scaffold' }]),
      'requires string stage, evidence, and outcome',
    ],
    [
      JSON.stringify([{ evidence: 'x', outcome: 'bad', stage: 'x' }]),
      'requires string stage, evidence, and outcome',
    ],
    [
      JSON.stringify([
        { evidence: 'x', outcome: 'complete', stage: 'wrong-stage' },
      ]),
      'must be consecutive',
    ],
  ] as const) {
    await expect(
      run(
        ['record', '/agents/aidlc/repo/intents/batch.md', input],
        ...dependencies,
      ),
    ).rejects.toThrow(message);
  }
  let atScope = createAidlcIntent('repo', 'Boundary');
  while (atScope.stage !== 'scope-definition') {
    atScope = completeAidlcStage(atScope, 'evidence');
  }
  await expect(
    run(
      [
        'record',
        '/agents/aidlc/repo/intents/boundary.md',
        JSON.stringify([
          {
            evidence: 'scope complete',
            outcome: 'complete',
            stage: 'scope-definition',
          },
          {
            evidence: 'approval ready',
            outcome: 'complete',
            stage: 'approval-handoff',
          },
          {
            evidence: 'must not cross',
            outcome: 'complete',
            stage: 'reverse-engineering',
          },
        ]),
      ],
      undefined,
      mock(),
      mock(async () => atScope),
      mock(async () => undefined),
      mock(async () => undefined),
    ),
  ).rejects.toThrow('cannot cross');
});

test('returns approval and path-repair actions instead of a separate next call', async () => {
  let atApproval = createAidlcIntent('repo', 'Approval');
  while (atApproval.stage !== 'approval-handoff') {
    atApproval = completeAidlcStage(atApproval, 'evidence');
  }
  const write = mock();
  await run(
    ['complete', '/agents/aidlc/repo/intents/approval.md', 'plan ready'],
    undefined,
    write,
    mock(async () => atApproval),
    mock(async () => undefined),
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('await-user-approval'),
  );
  await expect(
    run(
      ['complete', '/invalid-intent.md', 'evidence'],
      undefined,
      mock(),
      mock(async () => createAidlcIntent('repo', 'X')),
      mock(async () => undefined),
      mock(async () => undefined),
    ),
  ).rejects.toThrow('must be under an absolute');
});

test('retires a terminal intent only through the explicit command', async () => {
  const retire = mock(async () => undefined);
  const write = mock();
  await run(
    ['retire', '/intent.md', '/kb', 'repo/agent/lesson.md'],
    undefined,
    write,
    undefined,
    undefined,
    undefined,
    retire as typeof retireAidlcIntent,
  );
  expect(retire).toHaveBeenCalledWith(expect.anything(), '/intent.md', '/kb', [
    'repo/agent/lesson.md',
  ]);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"done"'));
});

test('reports the queue and records replan and supersession lifecycle events', async () => {
  const intent = createAidlcIntent('repo', 'Lifecycle');
  const load = mock(async () => intent);
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  await run(['queue', '/agents-that-do-not-exist', 'repo'], undefined, write);
  await run(
    [
      'replan',
      '/agents/aidlc/repo/intents/lifecycle.md',
      'Scope was clarified.',
    ],
    undefined,
    write,
    load,
    update,
    appendAudit,
  );
  await run(
    ['supersede', '/agents/aidlc/repo/intents/lifecycle.md', 'replacement'],
    undefined,
    write,
    load,
    update,
    appendAudit,
  );
  expect(appendAudit).toHaveBeenCalledTimes(2);
  expect(update).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('start-replacement-intent'),
  );
});

test('runs the final gate within Build and Test and returns knowledge closeout', async () => {
  const initial = createAidlcIntent('repo', 'Terminal', {
    projectRoot: '/a-project-without-a-config',
  });
  const intent = {
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
  const write = mock();
  const executeGate = mock(() => ({ status: 0 }));
  await run(
    ['complete', '/agents/aidlc/repo/intents/terminal.md'],
    undefined,
    write,
    mock(async () => intent),
    mock(async () => undefined),
    mock(async () => undefined),
    undefined,
    undefined,
    undefined,
    executeGate as unknown as AidlcGateExecutor,
  );
  expect(executeGate).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('knowledge-base-closeout-and-retire'),
  );
});

test('reports and preserves Build and Test state when its automatic gate fails', async () => {
  const initial = createAidlcIntent('repo', 'Failed terminal', {
    projectRoot: '/a-project-without-a-config',
  });
  const intent = {
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
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  try {
    await run(
      ['complete', '/agents/aidlc/repo/intents/failed-terminal.md'],
      undefined,
      write,
      mock(async () => intent),
      update,
      appendAudit,
      undefined,
      undefined,
      undefined,
      mock(() => ({ status: 2 })) as unknown as AidlcGateExecutor,
    );
    expect(update).not.toHaveBeenCalled();
    expect(appendAudit).toHaveBeenCalledWith(
      expect.anything(),
      '/agents/aidlc/repo/intents/failed-terminal.md',
      expect.objectContaining({ type: 'final-gate-failed' }),
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('repair-and-rerun-final-gate'),
    );
    expect(process.exitCode).toBe(2);
  } finally {
    process.exitCode = 0;
  }
});

test('rejects model-written Build and Test evidence', async () => {
  const initial = createAidlcIntent('repo', 'Manual terminal evidence', {
    projectRoot: '/a-project-without-a-config',
  });
  const intent = {
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
  await expect(
    run(
      [
        'complete',
        '/agents/aidlc/repo/intents/manual-terminal-evidence.md',
        'final gate: bun run test passed (exit 0)',
      ],
      undefined,
      mock(),
      mock(async () => intent),
      mock(async () => undefined),
      mock(async () => undefined),
    ),
  ).rejects.toThrow('runs its configured final gate automatically');
});

test('requires a project root before Build and Test can run its gate', async () => {
  const initial = createAidlcIntent('repo', 'Missing final gate root');
  const intent = {
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
  await expect(
    run(
      ['complete', '/agents/aidlc/repo/intents/missing-final-gate-root.md'],
      undefined,
      mock(),
      mock(async () => intent),
      mock(async () => undefined),
      mock(async () => undefined),
    ),
  ).rejects.toThrow('requires an absolute project root');
});
