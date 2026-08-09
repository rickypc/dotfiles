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
  readonly baselineSourceFingerprint: string;
  readonly matrixFingerprint: string;
  readonly receipt: EvidenceReceipt;
  readonly state: 'candidate_submitted';
}

export interface ChallengeDecision {
  readonly nextState: WorkflowState;
  readonly nextStep: 'accept' | 'block';
}

export interface ChallengeDecisionInput {
  readonly expectedMatrixFingerprint: string;
  readonly expectedSourceFingerprint: string;
  readonly receipt: EvidenceReceipt;
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
  if (input.receipt.matrixFingerprint !== input.matrixFingerprint) {
    throw new Error(
      'Candidate receipt matrix fingerprint does not match the frozen matrix.',
    );
  }
  if (input.receipt.sourceFingerprint === input.baselineSourceFingerprint) {
    throw new Error('Candidate source must differ from the baseline source.');
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
  input: ChallengeDecisionInput,
): ChallengeDecision => {
  const { receipt } = input;
  if (receipt.state !== 'challenge_checked') {
    throw new Error('A challenge decision requires a challenge receipt.');
  }
  if (
    receipt.matrixFingerprint !== input.expectedMatrixFingerprint ||
    receipt.sourceFingerprint !== input.expectedSourceFingerprint
  ) {
    throw new Error('Challenge receipt does not match the candidate evidence.');
  }
  return receiptPasses(receipt)
    ? {
        nextState: transition('challenge_checked', 'challenge_passed'),
        nextStep: 'accept',
      }
    : { nextState: 'blocked', nextStep: 'block' };
};
