import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/aidlc.js';
import {
  approveAidlcIntent,
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
  await run(['prepare', '/agents', 'repo', 'Build KB'], save, write);
  expect(saved[0]?.[1]).toBe('/agents/aidlc/repo/intents/build-kb.md');
  expect(write).toHaveBeenCalledWith('/agents/aidlc/repo/intents/build-kb.md');
});

test('rejects invalid commands and only runs the main boundary when requested', () => {
  expect(() => run([])).toThrow(usage());
  expect(() => run(['advance'])).toThrow('cannot bypass');
  const runner = mock(async () => undefined);
  runWhenMain(true, ['prepare', '/agents', 'repo', 'Build KB'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
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
  let intent = createAidlcIntent('repo', 'Terminal');
  while (intent.stage !== 'knowledge-distillation') {
    intent = completeAidlcStage(intent, 'evidence');
    if (
      intent.route.find((record) => record.slug === intent.stage)?.status ===
      'awaiting-approval'
    ) {
      intent = approveAidlcIntent(intent);
    }
  }
  const write = mock();
  await run(
    ['complete', '/agents/aidlc/repo/intents/terminal.md', 'KB verified'],
    undefined,
    write,
    mock(async () => intent),
    mock(async () => undefined),
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledTimes(2);
});
