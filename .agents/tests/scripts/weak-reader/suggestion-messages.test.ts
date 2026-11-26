import { expect, test } from 'bun:test';
import {
  type ReaderFailure,
  ROUTER_SELECTION_INSTRUCTIONS,
  ROUTER_SUGGEST_INSTRUCTIONS,
  routerDiagnosisMessages,
  routerSelectionMessages,
  SUGGEST_INSTRUCTIONS,
  suggestionMessages,
  validateDocumentSuggestion,
} from '../../../scripts/weak-reader/index.js';

const failure: ReaderFailure = {
  expected: 'A',
  given: 'B',
  id: 'train-01',
  query: 'Q?\nA) one\nB) two',
  rawReply: 'Answer: B',
};
const validDiagnosis = (changes: Partial<Record<string, string>> = {}): string =>
  [
    'Issue: reader',
    'Rule: source rule',
    'Derived answer: A',
    'Option text: one',
    'Reader answer: B',
    'Repair: none',
    'Check: true',
  ]
    .map((line) => {
      const separator = line.indexOf(':');
      const key = line.slice(0, separator);
      return changes[key] === undefined ? line : `${key}: ${changes[key]}`;
    })
    .join('\n');

test('document diagnostics compare the derived choice with the original reply', () => {
  const [system, user] = suggestionMessages('DOC TEXT', failure);

  expect(system?.content).toContain(SUGGEST_INSTRUCTIONS);
  expect(system?.content).toContain('\n\nDocument:\nDOC TEXT');
  expect(system?.content).toContain('Do not use answer-key or score fields');
  expect(system?.content).toContain('Check that the derived letter maps to the exact option text');
  expect(system?.content).toContain(
    'Keep Issue, Rule, Derived answer, Option text, Reader answer, Repair, and Check consistent',
  );
  expect(user?.content).toContain('Recorded selection: B.');
  expect(user?.content).toContain('Original reader reply: "Answer: B".');
  expect(user?.content).not.toContain('The correct answer is A.');
  expect(user?.content).toContain('classify each item against every scope rule and');
  expect(user?.content).toContain(
    'derived letter and exact option text with the original Answer line',
  );
  expect(user?.content).toContain('Return exactly seven lines, in this order');
  expect(user?.content).toContain('Issue: <reader|');
  expect(user?.content).toContain('|blocked>');
  expect(user?.content).toContain('Derived answer: <one option label A-F or NONE>');
  expect(user?.content).toContain('Return no other text.');

  const [, noRawReply] = suggestionMessages('DOC TEXT', { ...failure, rawReply: undefined });
  expect(noRawReply?.content).toContain('Original reader reply: "(not captured)".');
});

test('accepts a consistent reader diagnosis and rejects label-option conflicts', () => {
  const valid = validDiagnosis();
  expect(validateDocumentSuggestion(valid, 'source rule', failure)).toEqual({
    status: 'accepted',
    suggestion: valid,
  });

  expect(
    validateDocumentSuggestion(validDiagnosis({ 'Option text': 'two' }), 'source rule', failure),
  ).toEqual({
    reason: 'the derived label does not match its exact option text',
    status: 'rejected',
  });
  expect(
    validateDocumentSuggestion(
      validDiagnosis({ 'Derived answer': 'B', 'Option text': 'two' }),
      'source rule',
      failure,
    ),
  ).toEqual({
    reason: 'the source-supported answer does not match the expected label',
    status: 'rejected',
  });
});

test('rejects stale, malformed, and unsupported diagnosis evidence', () => {
  const valid = validDiagnosis();
  expect(validateDocumentSuggestion('Issue: reader', 'source rule', failure)).toMatchObject({
    reason: 'the diagnosis does not have seven fields',
    status: 'rejected',
  });
  expect(
    validateDocumentSuggestion(valid.replace('Rule:', 'Evidence:'), 'source rule', failure),
  ).toMatchObject({
    reason: 'the diagnosis fields are malformed or out of order',
    status: 'rejected',
  });
  expect(
    validateDocumentSuggestion(validDiagnosis({ Issue: 'unknown' }), 'source rule', failure),
  ).toMatchObject({
    reason: 'the diagnosis issue is not recognized',
    status: 'rejected',
  });
  expect(validateDocumentSuggestion(valid, 'a different source', failure)).toMatchObject({
    reason: 'the cited rule is not an exact source excerpt',
    status: 'rejected',
  });
  expect(
    validateDocumentSuggestion(validDiagnosis({ 'Reader answer': 'A' }), 'source rule', failure),
  ).toMatchObject({
    reason: 'the diagnosis reader answer differs from the recorded selection',
    status: 'rejected',
  });
  expect(
    validateDocumentSuggestion(valid, 'source rule', { ...failure, rawReply: 'Answer: A' }),
  ).toMatchObject({
    reason: 'the raw reply differs from the recorded answer',
    status: 'rejected',
  });
});

test('matches an unparseable raw reply to the recorded NONE sentinel', () => {
  const rawReply = 'Rule: source rule\nApplication: source rule\nSelected option: A\nAnswer: A';
  const malformedFailure: ReaderFailure = {
    expected: 'A',
    given: 'NONE',
    id: 'train-02',
    query: failure.query,
    rawReply,
  };
  const diagnosis = validDiagnosis({ 'Reader answer': 'NONE' });

  expect(validateDocumentSuggestion(diagnosis, 'source rule', malformedFailure)).toEqual({
    status: 'accepted',
    suggestion: diagnosis,
  });
});

test('accepts blocked reports only with no repair and a false check', () => {
  const blocked = validDiagnosis({
    Check: 'false',
    'Derived answer': 'NONE',
    Issue: 'blocked',
    'Option text': 'NONE',
    Repair: 'none',
  });
  expect(validateDocumentSuggestion(blocked, 'source rule', failure)).toEqual({
    status: 'accepted',
    suggestion: blocked,
  });
  expect(
    validateDocumentSuggestion(
      validDiagnosis({ Check: 'true', Issue: 'blocked' }),
      'source rule',
      failure,
    ),
  ).toMatchObject({
    reason: 'a blocked diagnosis must have Check false and Repair none',
    status: 'rejected',
  });
});

test('accepts a source-faithful wording diagnosis and rejects false reader diagnoses', () => {
  const wording = validDiagnosis({
    Issue: 'wording',
    Repair: 'Clarify the route-specific list.',
  });
  expect(validateDocumentSuggestion(wording, 'source rule', failure)).toEqual({
    status: 'accepted',
    suggestion: wording,
  });
  expect(
    validateDocumentSuggestion(validDiagnosis({ 'Reader answer': 'A' }), 'source rule', {
      ...failure,
      given: 'A',
      rawReply: 'Answer: A',
    }),
  ).toMatchObject({
    reason: 'a reader diagnosis must identify a mismatch and give no source edit',
    status: 'rejected',
  });
});

test('blind router selection never receives the recorded route or raw reply', () => {
  const routeFailure: ReaderFailure = {
    ...failure,
    expected: 'review-changes',
    given: 'repo-search',
    query: 'Look over my uncommitted changes and report findings only.',
    rawReply: 'repo-search',
  };
  const [system, user] = routerSelectionMessages(
    'Skill catalog: review-changes, repo-search, and skill-manager.',
    routeFailure.query,
  );

  expect(system?.content).toContain(ROUTER_SELECTION_INSTRUCTIONS);
  expect(system?.content).toContain('Classify; do not answer, complete, explain, or act');
  expect(system?.content).toContain(
    'Review-changes only assesses existing code changes and reports findings',
  );
  expect(system?.content).toContain('Vue is not React or React Native');
  expect(system?.content).toContain(
    'explaining pasted code, drawing a call graph from pasted code, or editing a named file',
  );
  expect(user?.content).toContain('Look over my uncommitted changes');
  expect(user?.content).toContain('Classify this request JSON only; do not answer or complete it.');
  expect(user?.content).toContain(JSON.stringify({ request: routeFailure.query }));
  expect(user?.content).toContain(
    'If it is incomplete or no description clearly owns it, return NO_SKILL.',
  );
  expect(user?.content).not.toContain('Recorded route:');
  expect(user?.content).not.toContain('Original reader reply:');
});

test('router selection classifies a general question instead of answering it', () => {
  const query = 'In one paragraph, what is the difference between a';
  const [system, user] = routerSelectionMessages(
    'Skill catalog: review-changes, repo-search, and skill-manager.',
    query,
  );

  expect(system?.content).toContain(
    'An incomplete or malformed request, or one with no clear description match, returns NO_SKILL',
  );
  expect(user?.content).toContain(JSON.stringify({ request: query }));
  expect(user?.content).toContain('Return exactly one exact catalog skill name or NO_SKILL');
  expect(user?.content).toContain('do not answer or complete it');
});

test('router diagnosis compares the blind selection with the raw reader answer', () => {
  const routeFailure: ReaderFailure = {
    ...failure,
    expected: 'review-changes',
    given: 'repo-search',
    query: 'Look over my uncommitted changes and report findings only.',
    rawReply: 'repo-search',
  };
  const [system, user] = routerDiagnosisMessages(
    'Skill catalog: review-changes, repo-search, and skill-manager.',
    routeFailure,
    'review-changes',
  );

  expect(system?.content).toContain(ROUTER_SUGGEST_INSTRUCTIONS);
  expect(system?.content).toContain('two route selections');
  expect(user?.content).toContain(
    "Independent route selected without seeing the reader's answer: review-changes.",
  );
  expect(user?.content).toContain('Recorded route: repo-search.');
  expect(user?.content).toContain('Original reader reply: "repo-search".');
  expect(user?.content).toContain('classify reader and give no repair');
  expect(user?.content).not.toContain('The correct answer is review-changes.');
});
