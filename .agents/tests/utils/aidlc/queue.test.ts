import { expect, test } from 'bun:test';
import {
  createAidlcIntent,
  renderAidlcIntent,
  supersedeAidlcIntent,
  withAidlcKnowledgeCloseout,
} from '../../../utils/aidlc/intent.js';
import { inventoryAidlcIntents } from '../../../utils/aidlc/queue.js';

const fileSystemFor = (files: Map<string, string>, entries: string[]) => ({
  mkdir: async () => undefined,
  readdir: async () =>
    entries.map((name) => ({
      isDirectory: () => false,
      name,
    })),
  readFile: async (path: string) => files.get(path) ?? '',
  rm: async () => undefined,
  writeFile: async () => undefined,
});

test('inventories valid intents, malformed records, and stable categories', async () => {
  const root = '/agents/aidlc/repo/intents';
  const active = createAidlcIntent('repo', 'Active');
  const complete = createAidlcIntent('repo', 'Completed', { uiRequired: true });
  const completedRoute = {
    ...complete,
    route: complete.route.map((record) => ({
      ...record,
      status: 'completed' as const,
    })),
  };
  const closed = withAidlcKnowledgeCloseout(completedRoute, {
    completedAt: '2026-08-01T00:00:00.000Z',
    disposition: 'no-durable-lesson',
    evidence: 'No durable lesson was identified.',
    references: [],
  });
  const initialApproval = createAidlcIntent('repo', 'Awaiting approval');
  const approvalIndex = initialApproval.route.findIndex(
    (record) => record.slug === 'approval-handoff',
  );
  const approval = {
    ...initialApproval,
    route: initialApproval.route.map((record, index) =>
      record.slug === 'refined-mockups'
        ? record
        : {
            ...record,
            status:
              index < approvalIndex
                ? ('completed' as const)
                : index === approvalIndex
                  ? ('active' as const)
                  : ('pending' as const),
          },
    ),
    stage: 'approval-handoff' as const,
  };
  const superseded = supersedeAidlcIntent(
    createAidlcIntent('repo', 'Superseded'),
    'replacement',
  );
  const files = new Map([
    [`${root}/active.md`, renderAidlcIntent(active)],
    [`${root}/broken.md`, 'not an intent'],
    [`${root}/completed.md`, renderAidlcIntent(completedRoute)],
    [`${root}/closed.md`, renderAidlcIntent(closed)],
    [`${root}/approval.md`, renderAidlcIntent(approval)],
    [`${root}/superseded.md`, renderAidlcIntent(superseded)],
  ]);
  const report = await inventoryAidlcIntents(
    fileSystemFor(files, [
      'broken.md',
      'active.md',
      'completed.md',
      'closed.md',
      'approval.md',
      'superseded.md',
    ]),
    '/agents',
    'repo',
  );
  expect(report.leftoverCount).toBe(4);
  expect(report.items.map((item) => item.category)).toEqual([
    'active',
    'awaiting-approval',
    'invalid',
    'needs-knowledge-closeout',
    'superseded',
    'retirable',
  ]);
  expect(report.items[0]?.summary).toBe('Active');
  expect(
    report.items.find((item) => item.category === 'invalid')?.error,
  ).toContain('frontmatter');
});

test('returns an empty report when the intent directory is absent', async () => {
  const fileSystem = {
    mkdir: async () => undefined,
    readdir: async () => {
      const error = new Error('missing') as Error & { code: string };
      error.code = 'ENOENT';
      throw error;
    },
    readFile: async () => '',
    rm: async () => undefined,
    writeFile: async () => undefined,
  };
  await expect(
    inventoryAidlcIntents(fileSystem, '/agents', 'repo'),
  ).resolves.toEqual({
    items: [],
    leftoverCount: 0,
  });
});

test('rejects a relative root', async () => {
  await expect(
    inventoryAidlcIntents(fileSystemFor(new Map(), []), 'agents', 'repo'),
  ).rejects.toThrow('temporary intent');
});

test('propagates unexpected directory errors', async () => {
  const fileSystem = fileSystemFor(new Map(), []);
  fileSystem.readdir = async () => {
    const error = new Error('permission') as Error & { code: string };
    error.code = 'EACCES';
    throw error;
  };
  await expect(
    inventoryAidlcIntents(fileSystem, '/agents', 'repo'),
  ).rejects.toThrow('permission');
});

test('rejects a queue filesystem without directory listing support', async () => {
  await expect(
    inventoryAidlcIntents(
      {
        mkdir: async () => undefined,
        readFile: async () => '',
        rm: async () => undefined,
        writeFile: async () => undefined,
      },
      '/agents',
      'repo',
    ),
  ).rejects.toThrow('directory listing support');
});
