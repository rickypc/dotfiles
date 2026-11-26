import { expect, test } from 'bun:test';
import { buildMessages, type ChatMessage } from '../../../scripts/weak-reader/index.js';

test('puts instructions and document in a shared system prefix, with the query last', () => {
  const messages: readonly ChatMessage[] = buildMessages('Be brief.', 'DOC', 'Q?');
  expect(messages).toEqual([
    { content: 'Be brief.\n\nDocument:\nDOC', role: 'system' },
    { content: 'Q?', role: 'user' },
  ]);
});
