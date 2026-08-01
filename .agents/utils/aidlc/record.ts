import {
  type AidlcIntent,
  completeAidlcStage,
  skipAidlcStage,
} from './intent.js';

export interface AidlcRecordInput {
  readonly evidence: string;
  readonly outcome: 'complete' | 'skip';
  readonly stage: string;
}

export const assertAidlcRecordCanContinue = (
  intent: AidlcIntent,
  remainingCount: number,
): void => {
  if (
    remainingCount > 0 &&
    (intent.stage === 'approval-handoff' ||
      (intent.stage === 'reverse-engineering' && !intent.kbContext.resolvedAt))
  ) {
    throw new Error(
      'AIDLC record cannot cross an approval or knowledge-context boundary.',
    );
  }
};

export const parseAidlcRecordInputs = (
  value: string,
): readonly AidlcRecordInput[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('AIDLC record inputs must be valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AIDLC record requires one or more stage outcomes.');
  }
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Each AIDLC record outcome must be an object.');
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.stage !== 'string' ||
      typeof record.evidence !== 'string' ||
      (record.outcome !== 'complete' && record.outcome !== 'skip')
    ) {
      throw new Error(
        'Each AIDLC record outcome requires string stage, evidence, and outcome (complete|skip).',
      );
    }
    return {
      evidence: record.evidence,
      outcome: record.outcome,
      stage: record.stage,
    };
  });
};

export const transitionForAidlcRecord = (
  intent: AidlcIntent,
  entry: AidlcRecordInput,
): AidlcIntent => {
  if (entry.stage !== intent.stage) {
    throw new Error(
      `AIDLC record outcomes must be consecutive; expected ${intent.stage}, received ${entry.stage}.`,
    );
  }
  return entry.outcome === 'complete'
    ? completeAidlcStage(intent, entry.evidence)
    : skipAidlcStage(intent, entry.evidence);
};

export const validateAidlcRecordTransitions = (
  intent: AidlcIntent,
  transitions: readonly AidlcRecordInput[],
): AidlcIntent => {
  if (
    transitions.some(
      (entry) =>
        entry.stage === 'approval-handoff' || entry.stage === 'build-and-test',
    )
  ) {
    throw new Error(
      'AIDLC record cannot complete Approval Handoff or Build and Test; use their dedicated atomic command.',
    );
  }
  let updated = intent;
  for (const [index, entry] of transitions.entries()) {
    updated = transitionForAidlcRecord(updated, entry);
    assertAidlcRecordCanContinue(updated, transitions.length - index - 1);
  }
  return updated;
};
