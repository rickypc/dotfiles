import { expect, test } from 'bun:test';
import { NO_ANSWER, optionTextFor, parseAnswer } from '../../../scripts/weak-reader/index.js';

const query = 'Q?\nA) alpha\nB) beta\nC) gamma\nD) delta';
const readerReply = (letter: string): string => `Answer: ${letter}`;

test('accepts only one exact answer line naming an available option', () => {
  for (const letter of ['A', 'B', 'C', 'D']) {
    expect(parseAnswer(readerReply(letter), query)).toBe(letter);
  }
  expect(parseAnswer(readerReply('NONE'), query)).toBe(NO_ANSWER);

  const invalid = [
    '',
    'A',
    'A)',
    'Answer: A.',
    'Answer: A because the source says so',
    'The answer is A',
    'answer: A',
    'Answer: E',
    'Answer: A\nAnswer: B',
    'Evidence: Rule one\nAnswer: A',
    '```\nAnswer: A\n```',
  ];
  for (const reply of invalid) {
    expect(parseAnswer(reply, query)).toBe('');
  }
});

test('accepts standard line endings and surrounding whitespace', () => {
  expect(parseAnswer('\r\nAnswer: B\r\n', query)).toBe('B');
});

test('requires at least two distinct option labels', () => {
  expect(parseAnswer(readerReply('A'), 'Q?')).toBe('');
  expect(parseAnswer(readerReply('A'), 'Q?\nA) alpha')).toBe('');
  expect(parseAnswer(readerReply('A'), 'Q?\nA) alpha\nA) duplicate\nB) beta')).toBe('');
  expect(optionTextFor('Q?\nA) alpha\nA) duplicate\nB) beta', 'A')).toBeUndefined();
});

test('returns the exact text for a unique available option label', () => {
  expect(optionTextFor(query, 'B')).toBe('beta');
  expect(optionTextFor(query, 'NONE')).toBeUndefined();
  expect(optionTextFor(query, 'E')).toBeUndefined();
});
