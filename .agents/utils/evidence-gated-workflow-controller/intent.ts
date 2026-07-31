import matter = require('gray-matter');

import type { WorkflowState } from './state.js';

export interface WorkflowIntent {
  readonly attempt: number;
  readonly attemptBudget: number;
  readonly intentId: string;
  readonly matrixFingerprint: string;
  readonly state: WorkflowState;
  readonly target: string;
}

const frontmatter = (intent: WorkflowIntent): string =>
  matter
    .stringify('', {
      attempt: intent.attempt,
      attempt_budget: intent.attemptBudget,
      intent_id: intent.intentId,
      matrix_fingerprint: intent.matrixFingerprint,
      state: intent.state,
      target: intent.target,
    })
    .trimEnd();

const integerMetadata = (
  data: Record<string, unknown>,
  name: string,
): number => {
  const value = data[name];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Intent frontmatter is invalid.');
  }
  return value;
};

export const renderIntent = (intent: WorkflowIntent): string =>
  `${frontmatter(intent)}\n\n# ${intent.intentId}\n`;

const stringMetadata = (
  data: Record<string, unknown>,
  name: string,
): string => {
  const value = data[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Intent frontmatter is invalid.');
  }
  return value;
};

export const parseIntent = (content: string): WorkflowIntent => {
  const parsed = matter(content);
  if (!matter.test(content) || content.indexOf('\n---', 4) < 0) {
    throw new Error('Intent frontmatter is invalid.');
  }
  const attempt = integerMetadata(parsed.data, 'attempt');
  const attemptBudget = integerMetadata(parsed.data, 'attempt_budget');
  if (attempt < 0 || attemptBudget < 1 || attempt > attemptBudget) {
    throw new Error('Intent attempt metadata is invalid.');
  }
  return {
    attempt,
    attemptBudget,
    intentId: stringMetadata(parsed.data, 'intent_id'),
    matrixFingerprint: stringMetadata(parsed.data, 'matrix_fingerprint'),
    state: stringMetadata(parsed.data, 'state') as WorkflowState,
    target: stringMetadata(parsed.data, 'target'),
  };
};
