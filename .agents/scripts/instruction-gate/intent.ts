import {
  measurementFromRecords,
  parseResponses,
  parseTriggerQuerySet,
  type TriggerQuerySet,
} from '../../utils/quality-engine/train/index.js';

export const MAX_INTENTS = 10;

// The query-set format requires both splits. This inert held-out probe satisfies it; its answer is
// never read and it is never part of the document's own held-out set.
export const SENTINEL_ID = 'sentinel';

export const INTENT_OPS = ['add', 'modify', 'move', 'retire'] as const;

// An intent probe is one question a delta must change: it states what the edited rule should now
// make the reader answer. Scoring it on the text before and after the edit proves the edit is
// visible to the reader, like a test that fails before a fix and passes after it.
export interface Intent {
  readonly expected: string;
  readonly id: string;
  readonly op: IntentOp;
  readonly options: readonly string[];
  readonly prompt: string;
}

export type IntentOp = (typeof INTENT_OPS)[number];

export interface IntentResult {
  readonly after: boolean;
  readonly before: boolean;
  readonly id: string;
  readonly op: IntentOp;
  readonly proven: boolean;
}

// What the reader must do on the text before and after each kind of delta.
const REQUIRED: Readonly<Record<IntentOp, { readonly after: boolean; readonly before: boolean }>> =
  {
    add: { after: true, before: false },
    modify: { after: true, before: false },
    move: { after: true, before: true },
    retire: { after: false, before: true },
  };

const LETTERS = 'ABCDEF';

export const intentSetText = (intents: readonly Intent[]): string =>
  JSON.stringify({
    kind: 'comprehension',
    queries: [
      ...intents.map((intent) => ({
        evidence: intent.op,
        expected: intent.expected,
        id: intent.id,
        query: [
          intent.prompt,
          ...intent.options.map((option, index) => `${LETTERS[index]}) ${option}`),
        ].join('\n'),
        split: 'train',
      })),
      {
        evidence: 'sentinel',
        expected: 'A',
        id: SENTINEL_ID,
        query: 'Which letter comes first?\nA) A\nB) B',
        split: 'validation',
      },
    ],
    runs_per_query: 3,
    skill_name: 'intent-probes',
    splits: { train: 'Intent probes of one candidate.', validation: 'Unused.' },
    target: '../intent.md',
  });

export const intentQuerySet = (intents: readonly Intent[]): TriggerQuerySet =>
  parseTriggerQuerySet(intentSetText(intents), 'intent-probes.json');

const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isIntent = (value: unknown): value is Intent => {
  const intent = value as Partial<Record<keyof Intent, unknown>> | null;
  return (
    typeof intent === 'object'
    && intent !== null
    && isNonBlank(intent.id)
    && isNonBlank(intent.prompt)
    && INTENT_OPS.includes(intent.op as IntentOp)
    && Array.isArray(intent.options)
    && intent.options.length >= 2
    && intent.options.length <= LETTERS.length
    && intent.options.every(isNonBlank)
    && typeof intent.expected === 'string'
    && intent.expected.length === 1
    && LETTERS.slice(0, intent.options.length).includes(intent.expected)
  );
};

const passedOf = (querySet: TriggerQuerySet, answers: string): Readonly<Record<string, boolean>> =>
  Object.fromEntries(
    measurementFromRecords(querySet, parseResponses(answers, 'intent-answers.jsonl')).perQuery.map(
      (query) => [query.id, query.passed],
    ),
  );

export const scoreIntents = (
  intents: readonly Intent[],
  answers: { readonly after: string; readonly before: string },
): readonly IntentResult[] => {
  const querySet = intentQuerySet(intents);
  const before = passedOf(querySet, answers.before);
  const after = passedOf(querySet, answers.after);
  return intents.map((intent) => {
    const required = REQUIRED[intent.op];
    const beforePassed = before[intent.id] === true;
    const afterPassed = after[intent.id] === true;
    return {
      after: afterPassed,
      before: beforePassed,
      id: intent.id,
      op: intent.op,
      proven: beforePassed === required.before && afterPassed === required.after,
    };
  });
};
