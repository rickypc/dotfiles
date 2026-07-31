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
  [
    '---',
    `intent_id: ${intent.intentId}`,
    `state: ${intent.state}`,
    `target: ${intent.target}`,
    `attempt: ${intent.attempt}`,
    `attempt_budget: ${intent.attemptBudget}`,
    `matrix_fingerprint: ${intent.matrixFingerprint}`,
    '---',
  ].join('\n');

export const parseIntent = (content: string): WorkflowIntent => {
  const match =
    /^---\nintent_id: (.+)\nstate: (.+)\ntarget: (.+)\nattempt: (\d+)\nattempt_budget: (\d+)\nmatrix_fingerprint: (.+)\n---/u.exec(
      content,
    );
  if (!match) {
    throw new Error('Intent frontmatter is invalid.');
  }
  const attempt = Number(match[4]);
  const attemptBudget = Number(match[5]);
  if (attempt < 0 || attemptBudget < 1 || attempt > attemptBudget) {
    throw new Error('Intent attempt metadata is invalid.');
  }
  return {
    attempt,
    attemptBudget,
    intentId: match[1],
    matrixFingerprint: match[6],
    state: match[2] as WorkflowState,
    target: match[3],
  };
};

export const renderIntent = (intent: WorkflowIntent): string =>
  `${frontmatter(intent)}\n\n# ${intent.intentId}\n`;
