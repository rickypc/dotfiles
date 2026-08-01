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
  fingerprint,
} from './evidence-gated-workflow-controller/packet.js';
import type { EvidenceReceipt } from './evidence-gated-workflow-controller/receipt.js';
import {
  createReceipt,
  failedCheckNames,
  receiptPasses,
} from './evidence-gated-workflow-controller/receipt.js';
import type { WorkflowState } from './evidence-gated-workflow-controller/state.js';

export interface SkillManagerBatchEvaluation {
  readonly phase: 'baseline' | 'candidate';
  readonly results: readonly SkillManagerBatchResult[];
}

export interface SkillManagerBatchResult {
  readonly candidate: EvidenceReceipt;
  readonly challenge?: EvidenceReceipt;
  readonly matrixPath: string;
  readonly repair?: ActionPacket;
  readonly targetSkillPath: string;
}

export interface SkillManagerBatchTarget {
  readonly matrix: readonly MatrixCase[];
  readonly matrixPath: string;
  readonly sourceText: string;
  readonly targetSkillPath: string;
}

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

const failedAssertionIdsFor = (receipt: EvidenceReceipt): string[] => [
  ...new Set(
    failedCheckNames(receipt).map((name) => name.split(':', 1)[0] ?? name),
  ),
];

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

const receiptFor = (
  target: SkillManagerBatchTarget,
  phase: 'baseline_recorded' | 'candidate_checked' | 'challenge_checked',
): EvidenceReceipt =>
  evaluateSkillMatrix(
    target.matrix,
    { delegatedChecks: {}, ownedFiles: new Set(), text: target.sourceText },
    fingerprint(target.sourceText),
    phase,
  );

const repairFor = (
  intentId: string,
  target: SkillManagerBatchTarget,
  receipt: EvidenceReceipt,
): ActionPacket | undefined => {
  const failedAssertionIds = failedAssertionIdsFor(receipt);
  return failedAssertionIds.length === 0
    ? undefined
    : createSkillManagerPacket({
        failedAssertionIds,
        intentId,
        state: 'candidate_requested',
        targetSkillPath: target.targetSkillPath,
      });
};

export const evaluateSkillManagerBatch = (
  intentId: string,
  phase: 'baseline' | 'candidate',
  targets: readonly SkillManagerBatchTarget[],
): SkillManagerBatchEvaluation => {
  if (targets.length === 0) {
    throw new Error('At least one skill matrix and target pair is required.');
  }
  const candidates = targets.map((target) => ({
    candidate: receiptFor(
      target,
      phase === 'baseline' ? 'baseline_recorded' : 'candidate_checked',
    ),
    target,
  }));
  const allCandidatesPass = candidates.every(({ candidate }) =>
    receiptPasses(candidate),
  );
  return {
    phase,
    results: candidates.map(({ candidate, target }) => {
      const challenge =
        phase === 'candidate' &&
        allCandidatesPass &&
        target.matrix.some(({ visibility }) => visibility === 'challenge')
          ? receiptFor(target, 'challenge_checked')
          : undefined;
      const repair =
        phase === 'candidate'
          ? repairFor(intentId, target, challenge ?? candidate)
          : undefined;
      return {
        candidate,
        ...(challenge ? { challenge } : {}),
        ...(repair ? { repair } : {}),
        matrixPath: target.matrixPath,
        targetSkillPath: target.targetSkillPath,
      };
    }),
  };
};
