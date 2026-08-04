import { expect, mock, test } from 'bun:test';

import { run, usage } from '../../scripts/aidlc.js';
import { createAidlcIntent } from '../../utils/aidlc/intent.js';

test('rejects malformed option shapes before executing lifecycle commands', async () => {
  const intent = createAidlcIntent('repo', 'Option validation');
  for (const args of [
    ['record', '/agents/aidlc/repo/intents/x.md', 'evidence', '--unknown'],
    [
      'record',
      '/agents/aidlc/repo/intents/x.md',
      'evidence',
      '--final-gate',
      '--unknown',
    ],
    ['recover'],
    ['recover', '/agents/aidlc/repo/intents/x.md', '--retire-only', 'extra'],
    ['complete', '', '--closeout', '--no-durable-lesson', 'evidence'],
    ['start', 'Build KB', '--unknown'],
  ] as const) {
    await expect(
      run(
        args,
        undefined,
        mock(),
        mock(async () => intent),
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
    ).rejects.toThrow(usage());
  }
});

test('handles an inconsistent start-options read without bootstrapping', async () => {
  let sliceCalls = 0;
  const args = new Proxy(['start', 'Build KB', '--ui'], {
    get(target, property, receiver) {
      if (property === 'slice') {
        return () => {
          sliceCalls += 1;
          return sliceCalls === 1 ? ['--ui'] : ['--unknown'];
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  await expect(
    run(
      args,
      undefined,
      mock(),
      mock(async () => createAidlcIntent('repo', 'Inconsistent start')),
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
  ).rejects.toThrow(usage());
  expect(sliceCalls).toBe(2);
});
