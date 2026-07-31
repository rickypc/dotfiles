import { expect, test } from 'bun:test';

import {
  createAidlcIntent,
  withAidlcKnowledgeContext,
} from '../../../utils/aidlc/intent.js';
import {
  stagePacketFor,
  validateAidlcStageAssets,
} from '../../../utils/aidlc/stage.js';

test('builds one packet containing stage, roles, and sensors', () => {
  const packet = stagePacketFor('/agents', createAidlcIntent('repo', 'X'));
  expect(packet.stage).toBe('workspace-scaffold');
  expect(packet.rolePaths).toEqual(['/agents/agents/aidlc/delivery.md']);
  expect(packet.sensorPaths).toEqual([
    '/agents/prompts/aidlc/sensors/intent-evidence.md',
  ]);
  expect(packet.commonPaths).toHaveLength(3);
});

test('rejects empty or missing stage assets', async () => {
  const packet = stagePacketFor('/agents', createAidlcIntent('repo', 'X'));
  const files = new Map(
    [
      ...packet.commonPaths,
      packet.stagePromptPath,
      ...packet.rolePaths,
      ...packet.sensorPaths,
    ].map((path) => [path, 'content']),
  );
  const fileSystem = {
    mkdir: async () => undefined,
    readFile: async (path: string) => files.get(path) ?? '',
    rm: async () => undefined,
    writeFile: async () => undefined,
  };
  await validateAidlcStageAssets(fileSystem, packet);
  files.set(packet.stagePromptPath, '');
  await expect(validateAidlcStageAssets(fileSystem, packet)).rejects.toThrow(
    'asset is empty',
  );
});

test('requires resolved context before practices discovery', () => {
  let intent = createAidlcIntent('repo', 'X');
  const index = intent.route.findIndex(
    (record) => record.slug === 'practices-discovery',
  );
  intent = {
    ...intent,
    route: intent.route.map((record, itemIndex) => ({
      ...record,
      status:
        itemIndex < index
          ? 'completed'
          : itemIndex === index
            ? 'active'
            : 'pending',
    })),
    stage: 'practices-discovery',
  };
  expect(() => stagePacketFor('/agents', intent)).toThrow('resolved knowledge');
  expect(
    stagePacketFor(
      '/agents',
      withAidlcKnowledgeContext(intent, {
        bindings: {},
        resolvedAt: 'now',
        rules: [],
        sources: [],
      }),
    ).contextRequired,
  ).toBeTrue();
});

test('refuses to reopen a completed intent', () => {
  const intent = createAidlcIntent('repo', 'X');
  const completed = {
    ...intent,
    route: intent.route.map((record) => ({
      ...record,
      evidence: 'verified',
      status: 'completed' as const,
    })),
    stage: 'knowledge-distillation' as const,
  };
  expect(() => stagePacketFor('/agents', completed)).toThrow('completed');
});
