import { expect, mock, test } from 'bun:test';
import type { Intent, IntentOp } from '../../../scripts/instruction-gate/intent.js';
import * as realTrain from '../../../utils/quality-engine/train/index.js';

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('../utils/quality-engine/train.js', () => realTrain);

const {
  INTENT_OPS,
  MAX_INTENTS,
  SENTINEL_ID,
  intentQuerySet,
  intentSetText,
  isIntent,
  scoreIntents,
} = await import('../../../scripts/instruction-gate/intent.js');

const answers = (rows: Record<string, string>): string =>
  Object.entries({ ...rows, sentinel: 'A' })
    .flatMap(([id, letter]) =>
      [1, 2, 3].map((run) => JSON.stringify({ answer: letter, query_id: id, run })),
    )
    .join('\n');

const base: Intent = {
  expected: 'B',
  id: 'i1',
  op: 'add',
  options: ['old rule', 'new rule'],
  prompt: 'What must the agent do now?',
};
const intent = (overrides: Partial<Intent> = {}): Intent => ({ ...base, ...overrides });
const raw = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  ...base,
  ...overrides,
});

test('exposes the four delta operations and a cap on intents', () => {
  expect(INTENT_OPS).toEqual(['add', 'modify', 'move', 'retire']);
  expect(MAX_INTENTS).toBe(10);
});

test.each([
  ['a complete intent', raw({}), true],
  ['six options', raw({ expected: 'F', options: ['a', 'b', 'c', 'd', 'e', 'f'] }), true],
  ['null', null, false],
  ['a blank id', raw({ id: ' ' }), false],
  ['a blank prompt', raw({ prompt: '' }), false],
  ['an unknown operation', raw({ op: 'rename' }), false],
  ['a missing options list', raw({ options: undefined }), false],
  ['one option', raw({ expected: 'A', options: ['a'] }), false],
  ['seven options', raw({ options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), false],
  ['a blank option', raw({ options: ['a', ' '] }), false],
  ['a non-string expected letter', raw({ expected: 2 }), false],
  ['a multi-letter expected value', raw({ expected: 'AB' }), false],
  ['an expected letter beyond the options', raw({ expected: 'C' }), false],
])('isIntent accepts only complete intents: %s', (_name, value, accepted) => {
  expect(isIntent(value)).toBe(accepted);
});

test('builds a comprehension set with lettered options and the expected letter', () => {
  const set = JSON.parse(
    intentSetText([intent(), intent({ expected: 'A', id: 'i2', op: 'retire' })]),
  );
  expect(
    set.queries.map((q: { id: string; expected: string; query: string }) => [
      q.id,
      q.expected,
      q.query,
    ]),
  ).toEqual([
    ['i1', 'B', 'What must the agent do now?\nA) old rule\nB) new rule'],
    ['i2', 'A', 'What must the agent do now?\nA) old rule\nB) new rule'],
    [SENTINEL_ID, 'A', 'Which letter comes first?\nA) A\nB) B'],
  ]);
  expect(intentQuerySet([intent()]).queries.map((q) => [q.id, q.expected, q.split])).toEqual([
    ['i1', 'B', 'train'],
    [SENTINEL_ID, 'A', 'validation'],
  ]);
});

test.each([
  ['add', { after: 'B', before: 'A' }, { after: true, before: false, proven: true }],
  ['add', { after: 'B', before: 'B' }, { after: true, before: true, proven: false }],
  ['add', { after: 'A', before: 'A' }, { after: false, before: false, proven: false }],
  ['modify', { after: 'B', before: 'A' }, { after: true, before: false, proven: true }],
  ['modify', { after: 'A', before: 'A' }, { after: false, before: false, proven: false }],
  ['retire', { after: 'A', before: 'B' }, { after: false, before: true, proven: true }],
  ['retire', { after: 'B', before: 'B' }, { after: true, before: true, proven: false }],
  ['move', { after: 'B', before: 'B' }, { after: true, before: true, proven: true }],
  ['move', { after: 'B', before: 'A' }, { after: true, before: false, proven: false }],
])(
  'scoreIntents proves a %s delta from the answers before and after: %j',
  (op, letters, expected) => {
    const [result] = scoreIntents([intent({ op: op as IntentOp })], {
      after: answers({ i1: letters.after }),
      before: answers({ i1: letters.before }),
    });
    expect(result).toEqual({ id: 'i1', op: op as IntentOp, ...expected });
  },
);

test('scoreIntents scores every intent separately and rejects incomplete answers', () => {
  const results = scoreIntents([intent(), intent({ id: 'i2' })], {
    after: answers({ i1: 'B', i2: 'A' }),
    before: answers({ i1: 'A', i2: 'A' }),
  });
  expect(results.map((r) => [r.id, r.before, r.after, r.proven])).toEqual([
    ['i1', false, true, true],
    ['i2', false, false, false],
  ]);
  expect(() =>
    scoreIntents([intent(), intent({ id: 'i2' })], {
      after: answers({ i1: 'B' }),
      before: answers({ i1: 'A', i2: 'A' }),
    }),
  ).toThrow('Incomplete router answers: i2 has 0 of 3 runs.');
});
