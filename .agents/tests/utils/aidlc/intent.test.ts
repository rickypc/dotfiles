import { expect, mock, test } from 'bun:test';

import {
  acceptanceChecklistFor,
  advanceAidlcIntent,
  aidlcIntentStatusFor,
  appendAidlcAuditEvent,
  approveAidlcIntent,
  assertAidlcIntentPath,
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
  withAidlcKnowledgeContext,
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
  expect(() => createAidlcIntent('/Users/rhuang', 'Bad index')).toThrow(
    'project name returned by codebase-memory',
  );
  expect(() =>
    createAidlcIntent('repo', 'Relative project', { projectRoot: 'relative' }),
  ).toThrow('project root must be absolute');
  expect(intentPathFor('/agents', 'repo', 'build-kb')).toBe(
    '/agents/aidlc/repo/intents/build-kb.md',
  );
  expect(workspacePathFor('/agents/', 'repo')).toBe(
    '/agents/aidlc/repo/workspace.md',
  );
});

test('allows lifecycle I/O only for canonical temporary intent paths', () => {
  expect(() =>
    assertAidlcIntentPath('/agents/aidlc/repo/intents/build-kb.md'),
  ).not.toThrow();
  for (const path of [
    '/agents/aidlc/conductor.md',
    '/agents/aidlc/knowledge/shared/rule.md',
    '/agents/aidlc/prompts/sensors/intent-evidence.md',
    '/agents/aidlc/protocols/runtime.md',
    '/agents/aidlc/roles/developer.md',
    '/agents/aidlc/repo/workspace.md',
    '/agents/aidlc/knowledge/intents/escaped.md',
    '/agents/aidlc/prompts/intents/escaped.md',
    '/agents/aidlc/protocols/intents/escaped.md',
    '/agents/aidlc/roles/intents/escaped.md',
    '/agents/aidlc/repo/intents/../conductor.md',
    '/agents/aidlc/knowledge/aidlc/repo/intents/escaped.md',
    '/agents/aidlc/outer/aidlc/repo/intents/escaped.md',
    '/agents/aidlc/repo/intents/escaped.txt',
    '/agents/aidlc/repo/intents/escaped--id.md',
  ]) {
    expect(() => assertAidlcIntentPath(path)).toThrow();
  }
});

test('rejects protected AIDLC assets before lifecycle I/O', async () => {
  const intent = createAidlcIntent('repo', 'Protect runtime assets');
  const readFile = mock(async () => renderAidlcIntent(intent));
  const writeFile = mock(async () => undefined);
  const rm = mock(async () => undefined);
  const fileSystem = {
    mkdir: mock(async () => undefined),
    readFile,
    rm,
    writeFile,
  };
  const protectedPath = '/agents/aidlc/conductor.md';
  await expect(
    saveAidlcIntent(fileSystem, protectedPath, intent),
  ).rejects.toThrow('temporary intent');
  await expect(loadAidlcIntent(fileSystem, protectedPath)).rejects.toThrow(
    'temporary intent',
  );
  await expect(
    updateAidlcIntent(fileSystem, protectedPath, intent),
  ).rejects.toThrow('temporary intent');
  await expect(
    appendAidlcAuditEvent(fileSystem, protectedPath, {
      at: '2026-07-31T00:00:00.000Z',
      detail: 'attempted write',
      stage: intent.stage,
      type: 'stage-completed',
    }),
  ).rejects.toThrow('temporary intent');
  await expect(retireAidlcIntent(fileSystem, protectedPath)).rejects.toThrow(
    'temporary intent',
  );
  expect(readFile).not.toHaveBeenCalled();
  expect(writeFile).not.toHaveBeenCalled();
  expect(rm).not.toHaveBeenCalled();
});

test('creates a local route and holds at the plan gate', () => {
  let intent = createAidlcIntent('repo', 'Build KB');
  expect(intent.stage).toBe('workspace-scaffold');
  expect(intent.uiRequired).toBeFalse();
  expect(
    intent.route.find((record) => record.slug === 'refined-mockups'),
  ).toMatchObject({ status: 'skipped' });
  expect(renderAidlcIntent(intent)).toContain('## Adopted AI-DLC stages');
  expect(renderAidlcIntent(intent)).toContain('## Acceptance checklist');
  expect(acceptanceChecklistFor('Build KB', false)).toEqual([
    'Deliver the requested outcome: Build KB',
    'Pass the configured final acceptance gate.',
  ]);
  expect(renderAidlcIntent(intent)).toContain(
    '| 1.7 | ideation | approval-handoff |',
  );
  intent = completeAidlcStage(intent, 'intent record created');
  expect(intent.stage).toBe('workspace-detection');
  expect(() => completeAidlcStage(intent, '')).toThrow('evidence');
  expect(() => skipAidlcStage(intent, '')).toThrow('reason');
  expect(() => advanceAidlcIntent(intent)).toThrow('completed stage');
});

test('advances past the declared non-UI stage without emitting it', () => {
  let intent = createAidlcIntent('repo', 'No UI');
  while (intent.stage !== 'requirements-analysis') {
    if (intent.stage === 'reverse-engineering') {
      intent = withAidlcKnowledgeContext(intent, {
        bindings: {},
        resolvedAt: 'now',
        rules: [],
        sources: [],
      });
    }
    intent = completeAidlcStage(intent, `evidence for ${intent.stage}`);
    if (
      intent.route.find((record) => record.slug === intent.stage)?.status ===
      'awaiting-approval'
    ) {
      intent = approveAidlcIntent(intent);
    }
  }
  intent = completeAidlcStage(intent, 'requirements are complete');
  expect(intent.stage).toBe('application-design');
});

test('requires resolved knowledge context before Reverse Engineering completes', () => {
  let intent = createAidlcIntent('repo', 'Context boundary');
  while (intent.stage !== 'reverse-engineering') {
    intent = completeAidlcStage(intent, `evidence for ${intent.stage}`);
    if (
      intent.route.find((record) => record.slug === intent.stage)?.status ===
      'awaiting-approval'
    ) {
      intent = approveAidlcIntent(intent);
    }
  }
  expect(() => completeAidlcStage(intent, 'research complete')).toThrow(
    'requires a resolved knowledge context',
  );
  expect(
    completeAidlcStage(
      withAidlcKnowledgeContext(intent, {
        bindings: {},
        resolvedAt: 'now',
        rules: [],
        sources: [],
      }),
      'research complete',
    ).stage,
  ).toBe('requirements-analysis');
});

test('requires a passing final-gate receipt before Build and Test completes', () => {
  const initial = createAidlcIntent('repo', 'Gate receipt');
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
  expect(() => completeAidlcStage(intent, 'gate passed')).toThrow(
    'exact passing final-gate receipt',
  );
  expect(
    completeAidlcStage(intent, 'final gate: bun run test passed (exit 0)')
      .stage,
  ).toBe('build-and-test');
});

test('keeps Refined Mockups active only for an explicit UI intent', () => {
  const intent = createAidlcIntent('repo', 'Build UI', {
    projectRoot: '/project',
    uiRequired: true,
  });
  expect(intent.projectRoot).toBe('/project');
  expect(acceptanceChecklistFor('Build UI', true)).toContain(
    'Verify the user-facing UI through its requested observable behavior.',
  );
  expect(
    intent.route.find((record) => record.slug === 'refined-mockups'),
  ).toMatchObject({ status: 'pending' });
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(createAidlcIntent('repo', 'No UI')).replace(
        'status: skipped',
        'status: pending',
      ),
    ),
  ).toThrow('route');
});

test('preserves legacy UI intent behavior and rejects invalid UI metadata', () => {
  const uiIntent = createAidlcIntent('repo', 'Legacy UI', { uiRequired: true });
  expect(
    parseAidlcIntent(
      renderAidlcIntent(uiIntent).replace('ui_required: true\n', ''),
    ).uiRequired,
  ).toBeTrue();
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(uiIntent).replace(
        'ui_required: true',
        'ui_required: invalid',
      ),
    ),
  ).toThrow('frontmatter');
});

test('rejects invalid persisted lifecycle and project-root metadata', () => {
  const intent = createAidlcIntent('repo', 'Persisted metadata', {
    projectRoot: '/project',
  });
  const rendered = renderAidlcIntent(intent);
  expect(() =>
    parseAidlcIntent(
      rendered.replace('project_root: /project', 'project_root: relative'),
    ),
  ).toThrow('project root');
  expect(() =>
    parseAidlcIntent(rendered.replace('lifecycle: active', 'lifecycle: bad')),
  ).toThrow('lifecycle');
  expect(() =>
    parseAidlcIntent(
      rendered.replace('lifecycle: active', 'lifecycle: superseded'),
    ),
  ).toThrow('replacement');
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

test('completes the four-phase route before knowledge-base closeout', () => {
  let intent = createAidlcIntent('repo', 'Close the route');
  while (aidlcIntentStatusFor(intent) !== 'completed') {
    if (intent.stage === 'reverse-engineering') {
      intent = withAidlcKnowledgeContext(intent, {
        bindings: {},
        resolvedAt: 'now',
        rules: [],
        sources: [],
      });
    }
    intent = completeAidlcStage(
      intent,
      intent.stage === 'build-and-test'
        ? 'final gate: bun run test passed (exit 0)'
        : `evidence for ${intent.stage}`,
    );
    if (
      intent.route.find((record) => record.slug === intent.stage)?.status ===
      'awaiting-approval'
    ) {
      intent = approveAidlcIntent(intent);
    }
  }
  expect(
    intent.route.every(
      (record) => record.status === 'completed' || record.status === 'skipped',
    ),
  ).toBe(true);
  expect(canAdvanceAidlcIntent(intent)).toBeTrue();
  expect(aidlcIntentStatusFor(intent)).toBe('completed');
  expect(renderAidlcIntent(intent)).toContain('status: completed');
  expect(renderAidlcIntent(intent)).toContain(
    'knowledge-base owns durable capture',
  );
  expect(advanceAidlcIntent(intent)).toEqual(intent);
});

test('retires only a completed intent after verified KB capture', async () => {
  let complete = createAidlcIntent('repo', 'Close the route');
  while (aidlcIntentStatusFor(complete) !== 'completed') {
    if (complete.stage === 'reverse-engineering') {
      complete = withAidlcKnowledgeContext(complete, {
        bindings: {},
        resolvedAt: 'now',
        rules: [],
        sources: [],
      });
    }
    complete = completeAidlcStage(
      complete,
      complete.stage === 'build-and-test'
        ? 'final gate: bun run test passed (exit 0)'
        : `evidence for ${complete.stage}`,
    );
    if (
      complete.route.find((record) => record.slug === complete.stage)
        ?.status === 'awaiting-approval'
    ) {
      complete = approveAidlcIntent(complete);
    }
  }
  const files = new Map([
    ['/agents/aidlc/repo/intents/complete.md', renderAidlcIntent(complete)],
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
  await retireAidlcIntent(
    fileSystem,
    '/agents/aidlc/repo/intents/complete.md',
    '/kb',
    ['repo/agent/lesson.md'],
  );
  expect(rm).toHaveBeenCalledWith('/agents/aidlc/repo/intents/complete.md', {
    force: true,
  });
  await expect(
    retireAidlcIntent(fileSystem, '/agents/aidlc/repo/intents/missing.md'),
  ).rejects.toThrow('frontmatter');
  const active = createAidlcIntent('repo', 'Active');
  files.set('/agents/aidlc/repo/intents/active.md', renderAidlcIntent(active));
  await expect(
    retireAidlcIntent(fileSystem, '/agents/aidlc/repo/intents/active.md'),
  ).rejects.toThrow('completed AIDLC intent');
  files.set(
    '/agents/aidlc/repo/intents/complete.md',
    renderAidlcIntent(complete),
  );
  await expect(
    retireAidlcIntent(
      fileSystem,
      '/agents/aidlc/repo/intents/complete.md',
      undefined,
      ['not-a-kb-concept'],
    ),
  ).rejects.toThrow('verified KB concept references');
  await retireAidlcIntent(fileSystem, '/agents/aidlc/repo/intents/complete.md');
  expect(rm).toHaveBeenCalledWith('/agents/aidlc/repo/intents/complete.md', {
    force: true,
  });
});

test('preserves the intent body while updating the route frontmatter', async () => {
  const intent = createAidlcIntent('repo', 'X');
  const content = `${renderAidlcIntent(intent)}Keep this evidence.\n`;
  expect(parseAidlcIntent(content)).toEqual(intent);
  const files = new Map([['/agents/aidlc/repo/intents/intent.md', content]]);
  const writeFile = mock(async (path: string, value: string) => {
    files.set(path, value);
  });
  const filesystem = {
    mkdir: mock(async () => undefined),
    readFile: mock(async (path: string) => files.get(path) ?? ''),
    rm: mock(),
    writeFile,
  };
  await saveAidlcIntent(
    filesystem,
    '/agents/aidlc/repo/intents/saved.md',
    intent,
  );
  expect(files.get('/agents/aidlc/repo/intents/saved.md')).toContain('# X');
  await updateAidlcIntent(
    filesystem,
    '/agents/aidlc/repo/intents/intent.md',
    completeAidlcStage(intent, 'created'),
  );
  expect(writeFile).toHaveBeenLastCalledWith(
    '/agents/aidlc/repo/intents/intent.md',
    expect.stringContaining('Keep this evidence.'),
    'utf8',
  );
  expect(files.get('/agents/aidlc/repo/intents/intent.md')).toContain(
    '| 0.1 | initialization | workspace-scaffold | completed | created |',
  );
  expect(files.get('/agents/aidlc/repo/intents/intent.md')).toContain(
    '| 3.6 | construction | build-and-test | pending |  |\n\n## Research',
  );
  expect(files.get('/agents/aidlc/repo/intents/intent.md')).toContain(
    '## Audit trail\nKeep this evidence.',
  );
  expect(
    parseAidlcIntent(files.get('/agents/aidlc/repo/intents/intent.md') ?? ''),
  ).toEqual(completeAidlcStage(intent, 'created'));
  await expect(
    loadAidlcIntent(filesystem, '/agents/aidlc/repo/intents/intent.md'),
  ).resolves.toEqual(completeAidlcStage(intent, 'created'));
  const ledgerless = renderAidlcFrontmatter(intent);
  files.set('/agents/aidlc/repo/intents/intent.md', ledgerless);
  await expect(
    updateAidlcIntent(
      filesystem,
      '/agents/aidlc/repo/intents/intent.md',
      completeAidlcStage(intent, 'created'),
    ),
  ).rejects.toThrow('stage ledger is missing');
});

test('updates frontmatter when the rendered stage ledger is unchanged', async () => {
  const intent = createAidlcIntent('repo', 'Context update');
  const content = renderAidlcIntent(intent);
  const files = new Map([['/agents/aidlc/repo/intents/intent.md', content]]);
  const filesystem = {
    mkdir: mock(async () => undefined),
    readFile: mock(async (path: string) => files.get(path) ?? ''),
    rm: mock(),
    writeFile: mock(async (path: string, value: string) => {
      files.set(path, value);
    }),
  };
  await updateAidlcIntent(
    filesystem,
    '/agents/aidlc/repo/intents/intent.md',
    intent,
  );
  expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
  expect(files.get('/agents/aidlc/repo/intents/intent.md')).toContain(
    'kb_context:',
  );
});

test('appends a deterministic audit record without changing intent state', async () => {
  const intent = createAidlcIntent('repo', 'X');
  const files = new Map([
    ['/agents/aidlc/repo/intents/intent.md', renderAidlcIntent(intent)],
  ]);
  const filesystem = {
    mkdir: async () => undefined,
    readFile: async (path: string) => files.get(path) ?? '',
    rm: async () => undefined,
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
    },
  };
  await appendAidlcAuditEvent(
    filesystem,
    '/agents/aidlc/repo/intents/intent.md',
    {
      at: '2026-07-30T00:00:00.000Z',
      detail: 'stage evidence written',
      stage: intent.stage,
      type: 'stage-completed',
    },
  );
  expect(files.get('/agents/aidlc/repo/intents/intent.md')).toContain(
    '## Audit trail',
  );
  expect(files.get('/agents/aidlc/repo/intents/intent.md')).toContain(
    'stage-completed',
  );
  await expect(
    appendAidlcAuditEvent(filesystem, '/agents/aidlc/repo/intents/intent.md', {
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
    parseAidlcIntent(
      renderAidlcIntent(intent).replace('status: active', 'status: bad'),
    ),
  ).toThrow('route');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace(
        /route:\n[\s\S]*?\nstage:/u,
        'route: invalid\nstage:',
      ),
    ),
  ).toThrow('route');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace('status: active', 'status: pending'),
    ),
  ).toThrow('current stage is pending');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace('  rules: []', "  rules:\n    - ''"),
    ),
  ).toThrow('knowledge context');
  expect(() =>
    parseAidlcIntent(
      renderAidlcIntent(intent).replace(
        '  sources: []',
        "  sources:\n    - ''",
      ),
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
  expect(() => assertNoIntentCollision(intent, 'X')).toThrow('collision');
  expect(() =>
    assertNoIntentCollision(
      { ...intent, lifecycle: 'superseded', summary: 'Other' },
      'X',
    ),
  ).toThrow('different summary');
  expect(() =>
    assertNoIntentCollision({ ...intent, lifecycle: 'superseded' }, 'X'),
  ).not.toThrow();
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
  expect(() =>
    parseAidlcIntent(renderAidlcIntent(intent).replace('id: old', 'id: 1')),
  ).toThrow('frontmatter');
});
