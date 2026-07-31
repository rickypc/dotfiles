import { expect, test } from 'bun:test';

import {
  completeAidlcStage,
  createAidlcIntent,
} from '../../../utils/aidlc/intent.js';
import { runAidlcSensors } from '../../../utils/aidlc/sensors.js';

test('requires evidence for a completed stage', () => {
  const intent = completeAidlcStage(createAidlcIntent('repo', 'X'), 'created');
  expect(runAidlcSensors(intent, 'workspace-scaffold')).toEqual([
    {
      detail: 'Current stage has evidence.',
      name: 'intent-evidence',
      status: 'passed',
    },
  ]);
});

test('reports missing practice context and missing validation keywords', () => {
  const intent = createAidlcIntent('repo', 'X');
  expect(runAidlcSensors(intent)).toEqual([
    {
      detail: 'Current stage has no evidence.',
      name: 'intent-evidence',
      status: 'failed',
    },
  ]);
  expect(() => runAidlcSensors({ ...intent, route: [] })).toThrow('missing');
  const build = {
    ...intent,
    route: intent.route.map((record) =>
      record.slug === 'build-and-test'
        ? { ...record, evidence: 'implemented', status: 'completed' as const }
        : record,
    ),
    stage: 'build-and-test' as const,
  };
  expect(runAidlcSensors(build)).toEqual([
    {
      detail: 'Current stage has evidence.',
      name: 'intent-evidence',
      status: 'passed',
    },
    {
      detail: 'Validation evidence must record: bun run test: passed (exit 0).',
      name: 'validation-evidence',
      status: 'failed',
    },
  ]);
  const validationPass = {
    ...build,
    route: build.route.map((record) =>
      record.slug === 'build-and-test'
        ? { ...record, evidence: 'bun run test: passed (exit 0)' }
        : record,
    ),
  };
  expect(runAidlcSensors(validationPass)[1]?.status).toBe('passed');
  const validationPassWithPunctuation = {
    ...validationPass,
    route: validationPass.route.map((record) =>
      record.slug === 'build-and-test'
        ? { ...record, evidence: 'bun run test: passed (exit 0).' }
        : record,
    ),
  };
  expect(runAidlcSensors(validationPassWithPunctuation)[1]?.status).toBe(
    'passed',
  );
  const validationPassInSentence = {
    ...validationPass,
    route: validationPass.route.map((record) =>
      record.slug === 'build-and-test'
        ? {
            ...record,
            evidence:
              'Validation evidence: bun run test: passed (exit 0). Aggregate gate passed.',
          }
        : record,
    ),
  };
  expect(runAidlcSensors(validationPassInSentence)[1]?.status).toBe('passed');
  const validationPassWithSemicolon = {
    ...validationPass,
    route: validationPass.route.map((record) =>
      record.slug === 'build-and-test'
        ? {
            ...record,
            evidence: 'Full bun run test: passed (exit 0); coverage passed.',
          }
        : record,
    ),
  };
  expect(runAidlcSensors(validationPassWithSemicolon)[1]?.status).toBe(
    'passed',
  );
  const practice = {
    ...intent,
    route: intent.route.map((record) =>
      record.slug === 'practices-discovery'
        ? { ...record, evidence: 'resolved', status: 'active' as const }
        : record,
    ),
    stage: 'practices-discovery' as const,
  };
  expect(runAidlcSensors(practice)[1]?.status).toBe('failed');
  const contextPractice = {
    ...practice,
    kbContext: { bindings: {}, resolvedAt: 'now', rules: [], sources: [] },
  };
  expect(runAidlcSensors(contextPractice)[1]?.status).toBe('passed');
  const approval = {
    ...intent,
    route: intent.route.map((record) =>
      record.slug === 'approval-handoff'
        ? { ...record, evidence: 'plan', status: 'active' as const }
        : record,
    ),
    stage: 'approval-handoff' as const,
  };
  expect(runAidlcSensors(approval)[1]?.status).toBe('failed');
  expect(
    runAidlcSensors({
      ...approval,
      approval: 'approved' as const,
    })[1]?.status,
  ).toBe('passed');
});
