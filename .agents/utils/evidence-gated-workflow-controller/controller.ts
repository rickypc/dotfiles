import type { EvidenceReceipt } from './receipt.js';
import { receiptPasses } from './receipt.js';
import type { WorkflowState } from './state.js';
import { transition } from './state.js';

export interface BaselineDecision {
  readonly nextState: WorkflowState;
  readonly nextStep: 'candidate' | 'block';
}

export interface CandidateDecision {
  readonly nextState: WorkflowState;
  readonly nextStep: 'challenge' | 'repair' | 'reject';
}

export interface CandidateDecisionInput {
  readonly attempt: number;
  readonly attemptBudget: number;
  readonly receipt: EvidenceReceipt;
  readonly state: 'candidate_submitted';
}

export interface ChallengeDecision {
  readonly nextState: WorkflowState;
  readonly nextStep: 'accept' | 'block';
}

export const decideBaseline = (receipt: EvidenceReceipt): BaselineDecision => {
  if (receipt.state !== 'baseline_recorded') {
    throw new Error('A baseline decision requires a baseline receipt.');
  }
  return receiptPasses(receipt)
    ? {
        nextState: transition('baseline_recorded', 'candidate_requested'),
        nextStep: 'candidate',
      }
    : { nextState: 'blocked', nextStep: 'block' };
};

export const decideCandidate = (
  input: CandidateDecisionInput,
): CandidateDecision => {
  if (input.attempt < 1 || input.attemptBudget < input.attempt) {
    throw new Error('Candidate attempt is outside its approved budget.');
  }
  if (receiptPasses(input.receipt)) {
    return {
      nextState: transition(input.state, 'candidate_passed'),
      nextStep: 'challenge',
    };
  }
  if (input.attempt === input.attemptBudget) {
    return {
      nextState: transition('candidate_checked', 'candidate_failed_rejected'),
      nextStep: 'reject',
    };
  }
  return {
    nextState: transition(
      transition(input.state, 'candidate_failed_retry'),
      'candidate_requested',
    ),
    nextStep: 'repair',
  };
};

export const decideChallenge = (
  receipt: EvidenceReceipt,
): ChallengeDecision => {
  if (receipt.state !== 'challenge_checked') {
    throw new Error('A challenge decision requires a challenge receipt.');
  }
  return receiptPasses(receipt)
    ? {
        nextState: transition('challenge_checked', 'challenge_passed'),
        nextStep: 'accept',
      }
    : { nextState: 'blocked', nextStep: 'block' };
};
