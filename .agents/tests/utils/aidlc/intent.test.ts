import { expect, mock, test } from 'bun:test';

import {
  advanceAidlcIntent,
  aidlcIntentStatusFor,
  appendAidlcAuditEvent,
  approveAidlcIntent,
  assertNoIntentCollision,
  canAdvanceAidlcIntent,
  completeAidlcStage,
  createAidlcIntent,
  intentIdFor,
  intentPathFor,
  loadAidlcIntent,
  parseAidlcIntent,
  renderAidlcFrontmatter,
  renderAidlcIntent,
  retireAidlcIntent,
  saveAidlcIntent,
  skipAidlcStage,
  supersedeAidlcIntent,
  updateAidlcIntent,
  workspacePathFor,
} from '../../../utils/aidlc/intent.js';
import { renderOkfConcept } from '../../../utils/knowledge-base.js';

test.each([
  ['Build KB!', 'build-kb'],
  ['  A  B  ', 'a-b'],
])('slugifies %s', (input, expected) =>
  expect(intentIdFor(input)).toBe(expected),
);

test('rejects empty summaries and reports deterministic paths', () => {
  expect(() => intentIdFor('---')).toThrow('summary');
  expect(intentPathFor('/agents', 'repo', 'build-kb')).toBe(
    '/agents/aidlc/repo/intents/build-kb.md',
  );
  expect(workspacePathFor('/agents/', 'repo')).toBe(
    '/agents/aidlc/repo/workspace.md',
  );
});

test('creates an upstream-aligned route and holds at the plan gate', () => {
  let intent = createAidlcIntent('repo', 'Build KB');
  expect(intent.stage).toBe('workspace-scaffold');
  expect(renderAidlcIntent(intent)).toContain('## Adopted AI-DLC stages');
  expect(renderAidlcIntent(intent)).toContain(
    '| 1.7 | ideation | approval-handoff |',
  );
  intent = completeAidlcStage(intent, 'intent record created');
  expect(intent.stage).toBe('workspace-detection');
  expect(() => completeAidlcStage(intent, '')).toThrow('evidence');
  expect(() => skipAidlcStage(intent, '')).toThrow('reason');
  expect(() => advanceAidlcIntent(intent)).toThrow('completed stage');
});

test('requires evidence or a skip reason for every non-gated stage', () => {
  const intent = createAidlcIntent('repo', 'Build KB');
  expect(() => skipAidlcStage(intent, ' ')).toThrow('reason');
  const next = skipAidlcStage(intent, 'the record already exists');
  expect(next.stage).toBe('workspace-detection');
  expect(next.route[0]).toEqual({
    evidence: 'the record already exists',
    slug: 'workspace-scaffold',
    status: 'skipped',
  });
});

test('only allows approval after the completed approval-handoff stage', () => {
  let intent = createAidlcIntent('repo', 'Build KB');
  const untilGate = intent.route.findIndex(
    (record) => record.slug === 'approval-handoff',
  );
  for (let index = 0; index < untilGate; index += 1) {
    intent = completeAidlcStage(intent, `stage ${index} evidence`);
  }
  expect(intent.stage).toBe('approval-handoff');
  expect(() => skipAidlcStage(intent, 'no')).toThrow('non-gated');
  expect(() => approveAidlcIntent(intent)).toThrow('awaiting approval');
  intent = completeAidlcStage(intent, 'intent and plan review ready');
  expect(
    intent.route.find((record) => record.slug === intent.stage)?.status,
  ).toBe('awaiting-approval');
  expect(canAdvanceAidlcIntent(intent)).toBeFalse();
  intent = approveAidlcIntent(intent);
  expect(intent.approval).toBe('approved');
  expect(intent.stage).toBe('reverse-engineering');
});

test('records every stage through local knowledge-distillation closure', () => {
  let intent = createAidlcIntent('repo', 'Close the route');
  while (intent.stage !== 'knowledge-distillation') {
    intent = completeAidlcStage(intent, `evidence for ${intent.stage}`);
    if (
      intent.route.find((record) => record.slug === intent.stage)?.status ===
      'awaiting-approval'
    ) {
      intent = approveAidlcIntent(intent);
    }
  }
  intent = completeAidlcStage(intent, 'durable KB entry validated');
  expect(intent.route.every((record) => record.status === 'completed')).toBe(
    true,
  );
  expect(canAdvanceAidlcIntent(intent)).toBeTrue();
  expect(aidlcIntentStatusFor(intent)).toBe('completed');
  expect(renderAidlcIntent(intent)).toContain('status: completed');
  expect(renderAidlcIntent(intent)).toContain('distillation_status: completed');
  expect(advanceAidlcIntent(intent)).toEqual(intent);
});

test('retires only an intent with completed knowledge distillation', async () => {
  let complete = createAidlcIntent('repo', 'Close the route');
  while (complete.stage !== 'knowledge-distillation') {
    complete = completeAidlcStage(complete, `evidence for ${complete.stage}`);
    if (
      complete.route.find((record) => record.slug === complete.stage)
        ?.status === 'awaiting-approval'
    ) {
      complete = approveAidlcIntent(complete);
    }
  }
  complete = completeAidlcStage(complete, 'durable KB entry validated');
  const files = new Map([
    ['/agents/complete.md', renderAidlcIntent(complete)],
    [
      '/kb/repo/agent/lesson.md',
      renderOkfConcept(
        {
          description: 'Verified lesson.',
          tags: ['lesson'],
          title: 'Lesson',
          type: 'lesson',
        },
        'Verified body.',
      ),
    ],
    ['/kb/repo/agent/index.md', '[lesson](lesson.md)\n'],
    ['/kb/repo/index.md', '[agent/index](agent/index.md)\n'],
    ['/kb/index.md', '[repo/index](repo/index.md)\n'],
  ]);
  const rm = mock(async (path: string) => {
    files.delete(path);
  });
  const fileSystem = {
    mkdir: mock(async () => undefined),
    readFile: mock(async (path: string) => files.get(path) ?? ''),
    rm,
    writeFile: mock(async () => undefined),
  };
  await retireAidlcIntent(fileSystem, '/agents/complete.md', '/kb', [
    'repo/agent/lesson.md',
  ]);
  expect(rm).toHaveBeenCalledWith('/agents/complete.md', { force: true });
  await expect(
    retireAidlcIntent(fileSystem, '/agents/missing.md'),
  ).rejects.toThrow('frontmatter');
  const active = createAidlcIntent('repo', 'Active');
  files.set('/agents/active.md', renderAidlcIntent(active));
  await expect(
    retireAidlcIntent(fileSystem, '/agents/active.md'),
  ).rejects.toThrow('terminal knowledge distillation');
  files.set('/agents/complete.md', renderAidlcIntent(complete));
  await expect(
    retireAidlcIntent(fileSystem, '/agents/complete.md'),
  ).rejects.toThrow('verified KB concept');
});

test('preserves the intent body while updating the route frontmatter', async () => {
  const intent = createAidlcIntent('repo', 'X');
  const content = `${renderAidlcIntent(intent)}Keep this evidence.\n`;
  expect(parseAidlcIntent(content)).toEqual(intent);
  const files = new Map([['/agents/intent.md', content]]);
  const writeFile = mock(async (path: string, value: string) => {
    files.set(path, value);
  });
  const filesystem = {
    mkdir: mock(async () => undefined),
    readFile: mock(async (path: string) => files.get(path) ?? ''),
    rm: mock(),
    writeFile,
  };
  await saveAidlcIntent(filesystem, '/agents/saved.md', intent);
  expect(files.get('/agents/saved.md')).toContain('# X');
  await updateAidlcIntent(
    filesystem,
    '/agents/intent.md',
    completeAidlcStage(intent, 'created'),
  );
  expect(writeFile).toHaveBeenLastCalledWith(
    '/agents/intent.md',
    expect.stringContaining('Keep this evidence.'),
    'utf8',
  );
  expect(files.get('/agents/intent.md')).toContain(
    '| 0.1 | initialization | workspace-scaffold | completed | created |',
  );
  expect(files.get('/agents/intent.md')).toContain(
    '| local.1 | closure | knowledge-distillation | pending |  |\n\n## Research',
  );
  expect(files.get('/agents/intent.md')).toContain(
    '## Audit trail\nKeep this evidence.',
  );
  await expect(
    loadAidlcIntent(filesystem, '/agents/intent.md'),
  ).resolves.toEqual(completeAidlcStage(intent, 'created'));
  const ledgerless = renderAidlcFrontmatter(intent);
  files.set('/agents/intent.md', ledgerless);
  await expect(
    updateAidlcIntent(
      filesystem,
      '/agents/intent.md',
      completeAidlcStage(intent, 'created'),
    ),
  ).rejects.toThrow('stage ledger is missing');
});

test('updates frontmatter when the rendered stage ledger is unchanged', async () => {
  const intent = createAidlcIntent('repo', 'Context update');
  const content = renderAidlcIntent(intent);
  const files = new Map([['/agents/intent.md', content]]);
  const filesystem = {
    mkdir: mock(async () => undefined),
    readFile: mock(async (path: string) => files.get(path) ?? ''),
    rm: mock(),
    writeFile: mock(async (path: string, value: string) => {
      files.set(path, value);
    }),
  };
  await updateAidlcIntent(filesystem, '/agents/intent.md', intent);
  expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
  expect(files.get('/agents/intent.md')).toContain('kb_context:');
});

test('appends a deterministic audit record without changing intent state', async () => {
  const intent = createAidlcIntent('repo', 'X');
  const files = new Map([['/agents/intent.md', renderAidlcIntent(intent)]]);
  const filesystem = {
    mkdir: async () => undefined,
    readFile: async (path: string) => files.get(path) ?? '',
    rm: async () => undefined,
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
    },
  };
  await appendAidlcAuditEvent(filesystem, '/agents/intent.md', {
    at: '2026-07-30T00:00:00.000Z',
    detail: 'stage evidence written',
    stage: intent.stage,
    type: 'stage-completed',
  });
  expect(files.get('/agents/intent.md')).toContain('## Audit trail');
  expect(files.get('/agents/intent.md')).toContain('stage-completed');
  await expect(
    appendAidlcAuditEvent(filesystem, '/agents/intent.md', {
      at: '',
      detail: '',
      stage: intent.stage,
      type: 'stage-completed',
    }),
  ).rejects.toThrow('timestamp');
});

test('rejects malformed routes and conflicting intent IDs', () => {
  const intent = createAidlcIntent('repo', 'X');
  expect(() => parseAidlcIntent('not an intent')).toThrow('frontmatter');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace(
        'approval: pending',
        'approval: invalid',
      ),
    ),
  ).toThrow('approval');
  expect(() =>
    parseAidlcIntent(renderAidlcIntent(intent).replace('"active"', '"bad"')),
  ).toThrow('route');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace('"active"', '"pending"'),
    ),
  ).toThrow('current stage is pending');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace('"rules":[]', '"rules":[""]'),
    ),
  ).toThrow('knowledge context');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace('"sources":[]', '"sources":[""]'),
    ),
  ).toThrow('knowledge context');
  expect(
    parseAidlcIntent(
      renderAidlcIntent(intent).replace(/^kb_context: .+\n/mu, ''),
    ).kbContext,
  ).toEqual({ bindings: {}, rules: [], sources: [] });
  expect(() =>
    assertNoIntentCollision({ ...intent, summary: 'Other' }, 'X'),
  ).toThrow('collision');
  expect(() => assertNoIntentCollision(intent, 'X')).not.toThrow();
});

test('preserves identity while marking an intent superseded', () => {
  const intent = createAidlcIntent('repo', 'Old');
  expect(supersedeAidlcIntent(intent, 'new-id')).toMatchObject({
    id: intent.id,
    lifecycle: 'superseded',
    supersededBy: 'new-id',
  });
  expect(() => supersedeAidlcIntent(intent, '')).toThrow('required');
  expect(() => supersedeAidlcIntent(intent, intent.id)).toThrow('itself');
  const superseded = supersedeAidlcIntent(intent, 'new-id');
  expect(() => supersedeAidlcIntent(superseded, 'other-id')).toThrow('already');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace(
        'lifecycle: active',
        'lifecycle: invalid',
      ),
    ),
  ).toThrow('lifecycle');
  expect(() =>
    parseAidlcIntent(
      renderAidlcFrontmatter({
        ...intent,
        lifecycle: 'superseded',
      } as typeof intent),
    ),
  ).toThrow('replacement');
});
