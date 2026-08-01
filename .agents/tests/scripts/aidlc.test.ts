import { expect, mock, test } from 'bun:test';

import {
  run,
  runMain,
  runWhenMain,
  usage,
  verifyCbmIndex,
} from '../../scripts/aidlc.js';
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
  const runner = mock(async () => undefined);
  runWhenMain(
    true,
    ['prepare', '/agents', 'repo', '/project', 'Build KB'],
    runner,
  );
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
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

test('records stage evidence, skips with a reason, and approves only a gate', async () => {
  const intent = createAidlcIntent('repo', 'X');
  const save = mock(async () => undefined);
  const update = mock(async () => undefined);
  const write = mock();
  await run(
    ['complete', '/intent.md', 'created record'],
    save,
    write,
    mock(async () => intent),
    update,
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('workspace-detection'),
  );
  await run(
    ['skip', '/intent.md', 'already classified externally'],
    save,
    write,
    mock(async () => intent),
    update,
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('workspace-detection'),
  );
  await expect(
    run(
      ['approve', '/intent.md'],
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
    ['approve', '/intent.md'],
    save,
    write,
    mock(async () => awaitingApproval),
    update,
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('reverse-engineering'),
  );
  expect(update).toHaveBeenCalledTimes(3);
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
  expect(write).toHaveBeenCalledWith('Retired AIDLC intent: /intent.md');
});

test('reports the queue and records replan and supersession lifecycle events', async () => {
  const intent = createAidlcIntent('repo', 'Lifecycle');
  const load = mock(async () => intent);
  const update = mock(async () => undefined);
  const appendAudit = mock(async () => undefined);
  const write = mock();
  await run(['queue', '/agents-that-do-not-exist', 'repo'], undefined, write);
  await run(
    ['replan', '/intent.md', 'Scope was clarified.'],
    undefined,
    write,
    load,
    update,
    appendAudit,
  );
  await run(
    ['supersede', '/intent.md', 'replacement'],
    undefined,
    write,
    load,
    update,
    appendAudit,
  );
  expect(appendAudit).toHaveBeenCalledTimes(2);
  expect(update).toHaveBeenCalledTimes(1);
});

test('reports the remaining queue after terminal intent completion', async () => {
  const initial = createAidlcIntent('repo', 'Terminal');
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
  await run(
    [
      'complete',
      '/agents/aidlc/repo/intents/terminal.md',
      'final gate: bun run test passed (exit 0)',
    ],
    undefined,
    write,
    mock(async () => intent),
    mock(async () => undefined),
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledTimes(2);
});
