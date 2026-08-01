import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createAidlcIntent,
  withAidlcKnowledgeContext,
} from '../../../utils/aidlc/intent.js';
import {
  renderAidlcStagePacket,
  stagePacketFor,
  validateAidlcStageAssets,
} from '../../../utils/aidlc/stage.js';

test('builds one packet with only the current stage assets', () => {
  const packet = stagePacketFor('/agents', createAidlcIntent('repo', 'X'));
  expect(packet.stage).toBe('workspace-scaffold');
  expect(packet.rolePaths).toEqual(['/agents/aidlc/roles/delivery.md']);
  expect(packet.sensorPaths).toEqual([
    '/agents/aidlc/prompts/sensors/intent-evidence.md',
  ]);
  expect(packet.commonPaths).toHaveLength(6);
  expect(packet.knowledgePaths).toEqual([]);
  expect(renderAidlcStagePacket(packet)).toContain('workspace-scaffold');
});

test('keeps AIDLC prompt assets in one non-nested namespace', () => {
  const promptRoot = fileURLToPath(
    new URL('../../../aidlc/prompts/', import.meta.url),
  );
  for (const path of [
    'stages/initialization/workspace-scaffold.md',
    'sensors/intent-evidence.md',
    'templates/practice-record.md',
  ]) {
    expect(existsSync(`${promptRoot}/${path}`)).toBeTrue();
  }
  expect(existsSync(`${promptRoot}/aidlc`)).toBeFalse();
});

test('rejects empty or missing stage assets', async () => {
  const packet = stagePacketFor('/agents', createAidlcIntent('repo', 'X'));
  const files = new Map(
    [
      ...packet.commonPaths,
      packet.stagePromptPath,
      ...packet.rolePaths,
      ...packet.knowledgePaths,
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

test('requires resolved context before reverse engineering', () => {
  let intent = createAidlcIntent('repo', 'X');
  const index = intent.route.findIndex(
    (record) => record.slug === 'reverse-engineering',
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
    stage: 'reverse-engineering',
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
    stage: 'build-and-test' as const,
  };
  expect(() => stagePacketFor('/agents', completed)).toThrow('completed');
});
