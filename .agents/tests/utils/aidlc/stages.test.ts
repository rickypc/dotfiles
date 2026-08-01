import { expect, test } from 'bun:test';

import {
  initialAidlcRoute,
  knowledgePathsForStage,
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
  expect(stageDefinitionFor('build-and-test')).toMatchObject({
    number: '3.6',
    phase: 'construction',
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
  expect(nextAidlcRouteStage(route, 'build-and-test')).toBeUndefined();
  expect(() => nextAidlcRouteStage(route, 'unknown')).toThrow(
    'not in this AIDLC route',
  );
});

test('omits the UI-only stage from a non-UI route', () => {
  expect(
    initialAidlcRoute(false).find((stage) => stage.slug === 'refined-mockups'),
  ).toMatchObject({ status: 'skipped' });
  expect(
    initialAidlcRoute(true).find((stage) => stage.slug === 'refined-mockups'),
  ).toMatchObject({ status: 'pending' });
});
test('maps every active stage to universal role, sensor, and prompt assets', () => {
  expect(rolesForStage('build-and-test')).toEqual(['quality', 'security']);
  expect(sensorsForStage('reverse-engineering')).toEqual([
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
  expect(knowledgePathsForStage('/agents', 'application-design')).toContain(
    '/agents/aidlc/knowledge/roles/architect/adr-template.md',
  );
});
