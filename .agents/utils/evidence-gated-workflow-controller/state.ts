export type WorkflowEvent =
  | 'matrix_ready'
  | 'baseline_recorded'
  | 'candidate_requested'
  | 'candidate_submitted'
  | 'candidate_passed'
  | 'candidate_failed_retry'
  | 'candidate_failed_rejected'
  | 'challenge_passed'
  | 'challenge_failed'
  | 'block'
  | 'resume';

export type WorkflowState =
  | 'draft'
  | 'matrix_ready'
  | 'baseline_recorded'
  | 'candidate_requested'
  | 'candidate_submitted'
  | 'candidate_checked'
  | 'challenge_checked'
  | 'accepted'
  | 'rejected'
  | 'blocked';

const transitions: Readonly<
  Record<WorkflowState, Readonly<Partial<Record<WorkflowEvent, WorkflowState>>>>
> = {
  accepted: {},
  baseline_recorded: {
    block: 'blocked',
    candidate_requested: 'candidate_requested',
  },
  blocked: { resume: 'draft' },
  candidate_checked: {
    block: 'blocked',
    candidate_failed_rejected: 'rejected',
    candidate_requested: 'candidate_requested',
    challenge_passed: 'challenge_checked',
  },
  candidate_requested: {
    block: 'blocked',
    candidate_submitted: 'candidate_submitted',
  },
  candidate_submitted: {
    block: 'blocked',
    candidate_failed_rejected: 'candidate_checked',
    candidate_failed_retry: 'candidate_checked',
    candidate_passed: 'candidate_checked',
  },
  challenge_checked: {
    block: 'blocked',
    challenge_failed: 'rejected',
    challenge_passed: 'accepted',
  },
  draft: { block: 'blocked', matrix_ready: 'matrix_ready' },
  matrix_ready: { baseline_recorded: 'baseline_recorded', block: 'blocked' },
  rejected: {},
};

export const isTerminal = (state: WorkflowState): boolean =>
  state === 'accepted' || state === 'rejected';

export const transition = (
  current: WorkflowState,
  event: WorkflowEvent,
  resumeTo?: WorkflowState,
): WorkflowState => {
  if (current === 'blocked' && event === 'resume') {
    if (!resumeTo || resumeTo === 'blocked' || isTerminal(resumeTo)) {
      throw new Error('A non-terminal resume state is required.');
    }
    return resumeTo;
  }
  const next = transitions[current][event];
  if (!next) {
    throw new Error(`Illegal workflow transition: ${current} -> ${event}.`);
  }
  return next;
};
