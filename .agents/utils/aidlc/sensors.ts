import type { CheckResult } from '../contracts.js';
import type { AidlcIntent } from './intent.js';
import { type AidlcStageSlug, sensorsForStage } from './stages.js';

const approvalRecorded = (
  intent: AidlcIntent,
  current: { readonly status: string },
): boolean =>
  current.status === 'awaiting-approval' || intent.approval === 'approved';

const failed = (name: string, detail: string): CheckResult => ({
  detail,
  name,
  status: 'failed',
});

const hasSuccessfulFullBunGate = (evidence: string | undefined): boolean =>
  /\bbun run test: passed \(exit 0\)(?:[.;,:!?]|\s|$)/u.test(evidence ?? '');

const passed = (name: string, detail: string): CheckResult => ({
  detail,
  name,
  status: 'passed',
});

const resultForSensor = (
  sensor: string,
  intent: AidlcIntent,
  current: { readonly evidence?: string; readonly status: string },
): CheckResult => {
  if (sensor === 'intent-evidence') {
    return current.evidence?.trim()
      ? passed(sensor, 'Current stage has evidence.')
      : failed(sensor, 'Current stage has no evidence.');
  }
  if (sensor === 'context-snapshot') {
    return intent.kbContext.resolvedAt
      ? passed(
          sensor,
          `Resolved ${intent.kbContext.sources.length} KB source(s).`,
        )
      : failed(sensor, 'Practice context has not been resolved.');
  }
  if (sensor === 'approval-gate') {
    return approvalRecorded(intent, current)
      ? passed(sensor, 'Approval gate is recorded.')
      : failed(sensor, 'Approval gate is not recorded.');
  }
  return hasSuccessfulFullBunGate(current.evidence)
    ? passed(sensor, 'Successful default full Bun gate is recorded.')
    : failed(
        sensor,
        'Validation evidence must record: bun run test: passed (exit 0).',
      );
};

export const runAidlcSensors = (
  intent: AidlcIntent,
  stage: AidlcStageSlug = intent.stage,
): CheckResult[] => {
  const current = intent.route.find((record) => record.slug === stage);
  if (!current)
    throw new Error('AIDLC current stage is missing from its route.');
  return sensorsForStage(stage).map((sensor) =>
    resultForSensor(sensor, intent, current),
  );
};
