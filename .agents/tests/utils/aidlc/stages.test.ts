import { expect, test } from 'bun:test';

import {
  initialAidlcRoute,
  nextAidlcRouteStage,
  rolePromptPathFor,
  rolesForStage,
  sensorPromptPathFor,
  sensorsForStage,
  stageDefinitionFor,
  stagePromptPathFor,
  universalCodeChangeStages,
} from '../../../utils/aidlc/stages.js';

test('keeps selected upstream stages in deterministic upstream order', () => {
  expect(universalCodeChangeStages[0]).toMatchObject({
    name: 'Workspace Scaffold',
    number: '0.1',
    phase: 'initialization',
    slug: 'workspace-scaffold',
  });
  expect(stageDefinitionFor('approval-handoff')).toMatchObject({
    gate: true,
    number: '1.7',
    phase: 'ideation',
  });
  expect(stageDefinitionFor('knowledge-distillation')).toMatchObject({
    number: 'local.1',
    phase: 'closure',
  });
  expect(() => stageDefinitionFor('unknown')).toThrow('Unknown');
});

test('creates one active stage and resolves only its legal next stage', () => {
  const route = initialAidlcRoute();
  expect(route.filter((stage) => stage.status === 'active')).toEqual([
    { slug: 'workspace-scaffold', status: 'active' },
  ]);
  expect(nextAidlcRouteStage(route, 'workspace-scaffold')).toBe(
    'workspace-detection',
  );
  expect(nextAidlcRouteStage(route, 'knowledge-distillation')).toBeUndefined();
  expect(() => nextAidlcRouteStage(route, 'unknown')).toThrow(
    'not in this AIDLC route',
  );
});
test('maps every active stage to universal role, sensor, and prompt assets', () => {
  expect(rolesForStage('build-and-test')).toEqual(['quality', 'security']);
  expect(sensorsForStage('practices-discovery')).toEqual([
    'intent-evidence',
    'context-snapshot',
  ]);
  expect(stagePromptPathFor('/agents/', 'code-generation')).toBe(
    '/agents/prompts/aidlc/stages/construction/code-generation.md',
  );
  expect(rolePromptPathFor('/agents', 'developer')).toBe(
    '/agents/agents/aidlc/developer.md',
  );
  expect(sensorPromptPathFor('/agents', 'validation-evidence')).toBe(
    '/agents/prompts/aidlc/sensors/validation-evidence.md',
  );
});
