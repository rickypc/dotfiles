import type {
  MatrixCase,
  MatrixEvidence,
} from './evidence-gated-workflow-controller/matrix.js';
import {
  casesFor,
  evaluateMatrix,
  validateMatrix,
} from './evidence-gated-workflow-controller/matrix.js';
import {
  type ActionPacket,
  createActionPacket,
} from './evidence-gated-workflow-controller/packet.js';
import type { EvidenceReceipt } from './evidence-gated-workflow-controller/receipt.js';
import { createReceipt } from './evidence-gated-workflow-controller/receipt.js';
import type { WorkflowState } from './evidence-gated-workflow-controller/state.js';

export interface SkillManagerPacketInput {
  readonly failedAssertionIds: readonly string[];
  readonly intentId: string;
  readonly state: WorkflowState;
  readonly targetSkillPath: string;
}

const actionTitleFor = (state: WorkflowState): string => {
  if (state === 'draft') {
    return 'Define and validate the skill quality matrix';
  }
  if (state === 'candidate_requested' || state === 'candidate_checked') {
    return 'Repair every compatible failed assertion in one candidate batch';
  }
  throw new Error(`No Skill Manager action packet is available for ${state}.`);
};

export const createSkillManagerPacket = (
  input: SkillManagerPacketInput,
): ActionPacket => {
  const assertionIds =
    input.state === 'draft' ? ['matrix-definition'] : input.failedAssertionIds;
  if (assertionIds.length === 0) {
    throw new Error(
      'At least one failed assertion is required for a candidate packet.',
    );
  }
  return createActionPacket({
    forbiddenActions: [
      'Change the frozen quality matrix.',
      'Edit paths outside the target skill.',
      'Claim completion without script-produced evidence.',
    ],
    intentId: input.intentId,
    knownUserQuestions: [],
    nextPhase: input.state === 'draft' ? 'baseline' : 'evaluate',
    packetId: `${input.intentId}-${input.state}`,
    requiredActionGroups: [
      {
        allowedPaths: [input.targetSkillPath],
        id: `${input.state}-action`,
        requiredAssertionIds: assertionIds,
        title: actionTitleFor(input.state),
      },
    ],
    state: input.state,
  });
};

export const evaluateSkillMatrix = (
  cases: readonly MatrixCase[],
  evidence: MatrixEvidence,
  sourceFingerprint: string,
  phase: 'baseline_recorded' | 'candidate_checked' | 'challenge_checked',
): EvidenceReceipt => {
  const visibility = phase === 'challenge_checked' ? 'challenge' : 'candidate';
  return createReceipt({
    checks: evaluateMatrix(casesFor(cases, visibility), evidence),
    sourceFingerprint,
    state: phase,
  });
};

export const parseMatrixJsonl = (content: string): MatrixCase[] => {
  const lines = content.split('\n').filter((line) => line.trim());
  const cases = lines.map((line, index) => {
    try {
      return JSON.parse(line) as MatrixCase;
    } catch {
      throw new Error(`Matrix line ${index + 1} is not valid JSON.`);
    }
  });
  validateMatrix(cases);
  return cases;
};
