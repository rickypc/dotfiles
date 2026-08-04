import { expect, mock, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  projectRootForRuntime,
  resolveCbmIndexForStart,
  run,
  runMain,
  runWhenMain,
  usage,
} from '../../scripts/aidlc.js';
import type { AidlcGateExecutor } from '../../utils/aidlc/gate.js';
import {
  completeAidlcStage,
  createAidlcIntent,
  type retireAidlcIntent,
  type saveAidlcIntent,
} from '../../utils/aidlc/intent.js';
import { renderOkfConcept } from '../../utils/knowledge-base.js';

test('starts one temporary AIDLC intent from the selected working directory', async () => {
  const saved: unknown[][] = [];
  const save: typeof saveAidlcIntent = async (fileSystem, path, intent) => {
    saved.push([fileSystem, path, intent]);
  };
  const write = mock();
  await run(
    ['start', 'Build KB'],
    save,
    write,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mock(async (projectRoot: string) => {
      expect(projectRoot).toBe('/project');
      return 'repo';
    }),
    undefined,
    '/project',
    undefined,
    '/agents',
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
});

test('starts in one call by resolving the CBM index from the project root', async () => {
  const saved: unknown[][] = [];
  const save: typeof saveAidlcIntent = async (fileSystem, path, intent) => {
    saved.push([fileSystem, path, intent]);
  };
  const write = mock();
  await run(
    ['start', 'Build KB'],
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
    undefined,
    '/project',
    undefined,
    '/agents',
  );
  expect(saved[0]?.[1]).toBe('/agents/aidlc/resolved-repo/intents/build-kb.md');
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"cbmIndex":"resolved-repo"'),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"acceptanceChecklist"'),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"configPath":"/project/aidlc.config.json"'),
  );
});

test('rejects a start command when no CBM resolver is configured', async () => {
  await expect(run(['start', 'Build KB'])).rejects.toThrow(
    'requires CBM project resolution',
  );
});

test('marks only the UI stage as applicable from start metadata', async () => {
  const saved: unknown[][] = [];
  const save: typeof saveAidlcIntent = async (fileSystem, path, intent) => {
    saved.push([fileSystem, path, intent]);
  };
  await run(
    ['start', 'Build UI', '--ui'],
    save,
    mock(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mock(async () => 'repo'),
    undefined,
    '/project',
    undefined,
    '/agents',
  );
  expect(saved[0]?.[2]).toMatchObject({ uiRequired: true });
  expect(saved[0]?.[2]).toMatchObject({ stage: 'intent-capture' });
});

test('refuses to overwrite an active intent with the same deterministic id', async () => {
  const existing = createAidlcIntent('repo', 'Build KB');
  await expect(
    run(
      ['start', 'Build KB'],
      mock(async () => undefined),
      mock(),
      mock(async () => existing),
      undefined,
      undefined,
      undefined,
      undefined,
      mock(async () => 'repo'),
      undefined,
      '/project',
      undefined,
      '/agents',
    ),
  ).rejects.toThrow('ID collision');
});

test('surfaces a malformed existing intent instead of treating it as absent', async () => {
  await expect(
    run(
      ['start', 'Build KB'],
      mock(async () => undefined),
      mock(),
      mock(async () => {
        throw new Error('AIDLC intent frontmatter is invalid.');
      }),
      undefined,
      undefined,
      undefined,
      undefined,
      mock(async () => 'repo'),
      undefined,
      '/project',
      undefined,
      '/agents',
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
  runWhenMain(true, ['start', 'Build KB'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});

test('returns the command contract without a failing help probe', async () => {
  const write = mock();
  await run(['complete', '--help'], undefined, write);
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('AIDLC command catalog'),
  );
  expect(usage()).toContain('Priority 1');
});

test('main runner keeps CBM resolution inside start rather than queue', async () => {
  const originalLog = console.log;
  const log = mock();
  console.log = log;
  try {
    await runMain(['queue', 'repo']);
  } finally {
    console.log = originalLog;
  }
  expect(log).toHaveBeenCalledWith(expect.stringContaining('leftoverCount'));
});

test('resolves the startup CBM index through an injected project-list boundary', async () => {
  const projectList = JSON.stringify({
    projects: [{ name: 'project', repository_path: '/project' }],
  });
  await expect(
    resolveCbmIndexForStart('/project', async (cmd) =>
      cmd.args.includes('index_status')
        ? { code: 0, stderr: '', stdout: 'status: ready' }
        : { code: 0, stderr: '', stdout: projectList },
    ),
  ).resolves.toBe('project');
});

test('uses the home project for global runtime maintenance and the parent for a copied runtime', () => {
  expect(
    projectRootForRuntime(
      '/Users/rhuang/.agents',
      '/Users/rhuang/.agents',
      '/Users/rhuang',
    ),
  ).toBe('/Users/rhuang');
  expect(
    projectRootForRuntime('/Users/rhuang/.agents', '/repo', '/Users/rhuang'),
  ).toBe('/repo');
  expect(
    projectRootForRuntime('/repo/.agents', '/repo/.agents', '/Users/rhuang'),
  ).toBe('/repo');
});

test('records stage evidence, skips with a reason, and approves atomically', async () => {
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
  await expect(
    run(
      [
        'approve',
        '/agents/aidlc/repo/intents/x.md',
        'fabricated approval evidence',
      ],
      save,
      write,
      mock(async () => intent),
      update,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('accepted only while Approval Handoff is active');
  let activeApproval = createAidlcIntent('repo', 'Approved');
  while (activeApproval.stage !== 'approval-handoff') {
    activeApproval = completeAidlcStage(activeApproval, 'evidence');
  }
  await expect(
    run(
      ['approve', '/agents/aidlc/repo/intents/x.md'],
      save,
      write,
      mock(async () => activeApproval),
      update,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('Approval Handoff is active');
  await run(
    [
      'approve',
      '/agents/aidlc/repo/intents/x.md',
      'Plan is ready and the user explicitly approved it.',
    ],
    save,
    write,
    mock(async () => activeApproval),
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

test('returns an explicit user-approval action at Approval Handoff', async () => {
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
  ).rejects.toThrow('dedicated atomic command');
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
            evidence: 'must not cross the approval boundary',
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
  ).rejects.toThrow('cannot cross an approval');
});

test('refuses a final-gate batch that does not end before Build and Test', async () => {
  const intent = createAidlcIntent('repo', 'Invalid final-gate batch');
  const update = mock(async () => undefined);
  await expect(
    run(
      [
        'record',
        '/agents/aidlc/repo/intents/batch.md',
        JSON.stringify([
          {
            evidence: 'workspace is ready',
            outcome: 'complete',
            stage: 'workspace-scaffold',
          },
        ]),
        '--final-gate',
      ],
      undefined,
      mock(),
      mock(async () => intent),
      update,
      mock(async () => undefined),
    ),
  ).rejects.toThrow('must end immediately before Build and Test');
  expect(update).not.toHaveBeenCalled();
});

test('returns an awaiting-approval action for a legacy persisted handoff', async () => {
  let legacy = createAidlcIntent('repo', 'Legacy approval');
  while (legacy.stage !== 'approval-handoff') {
    legacy = completeAidlcStage(legacy, 'evidence');
  }
  legacy = completeAidlcStage(legacy, 'legacy handoff evidence');
  const write = mock();
  await run(
    [
      'replan',
      '/agents/aidlc/repo/intents/legacy-approval.md',
      'User is reviewing the unchanged plan.',
    ],
    undefined,
    write,
    mock(async () => legacy),
    mock(async () => undefined),
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('await-user-approval'),
  );
});

test('returns approval and path-repair actions without a separate next call', async () => {
  let atApproval = createAidlcIntent('repo', 'Approval');
  while (atApproval.stage !== 'approval-handoff') {
    atApproval = completeAidlcStage(atApproval, 'evidence');
  }
  const write = mock();
  await expect(
    run(
      ['complete', '/agents/aidlc/repo/intents/approval.md', 'plan ready'],
      undefined,
      write,
      mock(async () => atApproval),
      mock(async () => undefined),
      mock(async () => undefined),
    ),
  ).rejects.toThrow('completed atomically by approve');
  await run(
    [
      'approve',
      '/agents/aidlc/repo/intents/approval.md',
      'Plan ready; user explicitly approved.',
    ],
    undefined,
    write,
    mock(async () => atApproval),
    mock(async () => undefined),
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('resolve-knowledge-context'),
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

test('rejects removed closeout and retire commands instead of exposing a multi-call route', async () => {
  const retire = mock(async () => undefined);
  await expect(
    run(
      ['retire', '/intent.md'],
      undefined,
      mock(),
      undefined,
      undefined,
      undefined,
      retire as typeof retireAidlcIntent,
    ),
  ).rejects.toThrow('AIDLC command catalog');
  await expect(
    run(['closeout', '/intent.md'], undefined, mock()),
  ).rejects.toThrow('AIDLC command catalog');
  expect(retire).not.toHaveBeenCalled();
});

test('reports the queue and records replan and supersession lifecycle events', async () => {
  const intent = createAidlcIntent('repo', 'Lifecycle');
  const load = mock(async () => intent);
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  await run(['queue', 'repo'], undefined, write);
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

test('records Code Generation and executes the final gate in one command', async () => {
  const initial = createAidlcIntent('repo', 'Atomic terminal', {
    projectRoot: '/a-project-without-a-config',
  });
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
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  const executeGate = mock(() => ({ status: 0 }));
  await run(
    [
      'record',
      '/agents/aidlc/repo/intents/atomic-terminal.md',
      JSON.stringify([
        {
          evidence: 'Implementation and focused tests are complete.',
          outcome: 'complete',
          stage: 'code-generation',
        },
      ]),
      '--final-gate',
    ],
    undefined,
    write,
    mock(async () => intent),
    update,
    appendAudit,
    undefined,
    undefined,
    undefined,
    executeGate as unknown as AidlcGateExecutor,
  );
  expect(executeGate).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(2);
  expect(appendAudit).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('knowledge-base-closeout-and-recover'),
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
    expect.stringContaining('knowledge-base-closeout-and-recover'),
  );
});

test('recovers a late no-capture KB disposition and retires in one command', async () => {
  const initial = createAidlcIntent('repo', 'Closeout');
  const intent = {
    ...initial,
    route: initial.route.map((record) => ({
      ...record,
      status: 'completed' as const,
    })),
    stage: 'build-and-test' as const,
  };
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const retire = mock(async () => undefined) as typeof retireAidlcIntent;
  const write = mock();
  await run(
    [
      'recover',
      '/agents/aidlc/repo/intents/closeout.md',
      '--no-durable-lesson',
      'Knowledge-base found no durable lesson beyond this temporary task.',
    ],
    undefined,
    write,
    mock(async () => intent),
    update,
    appendAudit,
    retire,
  );
  expect(update).toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/closeout.md',
    expect.objectContaining({
      kbCloseout: expect.objectContaining({ disposition: 'no-durable-lesson' }),
    }),
  );
  expect(appendAudit).toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/closeout.md',
    expect.objectContaining({ type: 'knowledge-closeout' }),
  );
  expect(retire).toHaveBeenCalledWith(
    expect.anything(),
    '/agents/aidlc/repo/intents/closeout.md',
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"retired"'));
});

test('validates captured knowledge closeout inputs before persisting them', async () => {
  const kbRoot = mkdtempSync(join(tmpdir(), 'aidlc-closeout-'));
  try {
    mkdirSync(join(kbRoot, 'repo', 'agent'), { recursive: true });
    writeFileSync(
      join(kbRoot, 'repo', 'agent', 'lesson.md'),
      renderOkfConcept(
        {
          description: 'Reusable validation practice.',
          tags: ['aidlc'],
          title: 'AIDLC closeout',
          type: 'lesson',
        },
        'Validate a durable closeout before retirement.',
      ),
    );
    writeFileSync(join(kbRoot, 'index.md'), '[repo](repo/index.md)\n');
    writeFileSync(
      join(kbRoot, 'repo', 'index.md'),
      '[agent](agent/index.md)\n',
    );
    writeFileSync(
      join(kbRoot, 'repo', 'agent', 'index.md'),
      '[lesson](lesson.md)\n',
    );
    const initial = createAidlcIntent('repo', 'Captured closeout');
    const intent = {
      ...initial,
      route: initial.route.map((record) => ({
        ...record,
        status: 'completed' as const,
      })),
      stage: 'build-and-test' as const,
    };
    const update = mock(async () => undefined);
    const retire = mock(async () => undefined) as typeof retireAidlcIntent;
    await run(
      [
        'recover',
        '/agents/aidlc/repo/intents/captured-closeout.md',
        '--captured',
        kbRoot,
        'repo/agent/lesson.md',
      ],
      undefined,
      mock(),
      mock(async () => intent),
      update,
      mock(async () => undefined),
      retire,
    );
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      '/agents/aidlc/repo/intents/captured-closeout.md',
      expect.objectContaining({
        kbCloseout: expect.objectContaining({ disposition: 'captured' }),
      }),
    );
    await expect(
      run(
        [
          'recover',
          '/agents/aidlc/repo/intents/captured-closeout.md',
          '--captured',
        ],
        undefined,
        mock(),
        mock(async () => intent),
        update,
        mock(async () => undefined),
      ),
    ).rejects.toThrow('Captured knowledge closeout requires');
    await expect(
      run(
        [
          'recover',
          '/agents/aidlc/repo/intents/captured-closeout.md',
          '--no-durable-lesson',
        ],
        undefined,
        mock(),
        mock(async () => intent),
        update,
        mock(async () => undefined),
      ),
    ).rejects.toThrow('No-capture knowledge closeout requires');
    await expect(
      run(
        [
          'recover',
          '/agents/aidlc/repo/intents/captured-closeout.md',
          '--unknown',
        ],
        undefined,
        mock(),
        mock(async () => intent),
        update,
        mock(async () => undefined),
      ),
    ).rejects.toThrow('must use --captured or --no-durable-lesson');
  } finally {
    rmSync(kbRoot, { force: true, recursive: true });
  }
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
  await expect(
    run(
      [
        'record',
        '/agents/aidlc/repo/intents/manual-terminal-evidence.md',
        JSON.stringify([
          {
            evidence: 'final gate: bun run test passed (exit 0)',
            outcome: 'complete',
            stage: 'build-and-test',
          },
        ]),
      ],
      undefined,
      mock(),
      mock(async () => intent),
      mock(async () => undefined),
      mock(async () => undefined),
    ),
  ).rejects.toThrow('dedicated atomic command');
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
