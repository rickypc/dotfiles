import { expect, mock, test } from 'bun:test';

import { runBatched } from '../../../utils/evidence-gated-workflow-controller/batch.js';

test('runs read-only tasks before exclusive tasks and preserves group order', async () => {
  const events: string[] = [];
  const read = mock(async () => {
    events.push('read');
    return 'read';
  });
  const write = mock(async () => {
    events.push('write');
    return 'write';
  });
  await expect(
    runBatched([
      { id: 'write', mode: 'exclusive', run: write },
      { id: 'read', mode: 'read-only', run: read },
    ]),
  ).resolves.toEqual([
    { id: 'read', value: 'read' },
    { id: 'write', value: 'write' },
  ]);
  expect(events).toEqual(['read', 'write']);
});

test('rejects duplicate or empty task IDs', async () => {
  await expect(
    runBatched([
      { id: 'same', mode: 'read-only', run: async () => 'a' },
      { id: 'same', mode: 'exclusive', run: async () => 'b' },
    ]),
  ).rejects.toThrow('unique');
  await expect(
    runBatched([{ id: '', mode: 'read-only', run: async () => 'a' }]),
  ).rejects.toThrow('unique');
});
