import type { FileSystem } from '../filesystem.js';
import { readText } from '../filesystem.js';
import { type AidlcIntent, aidlcIntentStatusFor } from './intent.js';
import {
  rolePromptPathFor,
  rolesForStage,
  sensorPromptPathFor,
  sensorsForStage,
  stageDefinitionFor,
  stagePromptPathFor,
} from './stages.js';

export interface AidlcStagePacket {
  readonly commonPaths: readonly string[];
  readonly contextRequired: boolean;
  readonly intentId: string;
  readonly phase: string;
  readonly rolePaths: readonly string[];
  readonly sensorPaths: readonly string[];
  readonly stage: string;
  readonly stagePromptPath: string;
}

const commonPromptPathsFor = (agentsRoot: string): readonly string[] => [
  `${agentsRoot}/prompts/aidlc/common/stage-protocol.md`,
  `${agentsRoot}/prompts/aidlc/common/question-contract.md`,
  `${agentsRoot}/prompts/aidlc/common/methodology.md`,
];

export const renderAidlcStagePacket = (packet: AidlcStagePacket): string =>
  JSON.stringify(packet, null, 2);

export const stagePacketFor = (
  agentsRoot: string,
  intent: AidlcIntent,
): AidlcStagePacket => {
  if (aidlcIntentStatusFor(intent) === 'completed') {
    throw new Error(
      'AIDLC intent is completed; do not emit another stage packet.',
    );
  }
  const stage = stageDefinitionFor(intent.stage);
  const contextRequired = intent.stage === 'practices-discovery';
  if (contextRequired && !intent.kbContext.resolvedAt) {
    throw new Error(
      'Practices Discovery requires a resolved knowledge context.',
    );
  }
  return {
    commonPaths: commonPromptPathsFor(agentsRoot),
    contextRequired,
    intentId: intent.id,
    phase: stage.phase,
    rolePaths: rolesForStage(intent.stage).map((role) =>
      rolePromptPathFor(agentsRoot, role),
    ),
    sensorPaths: sensorsForStage(intent.stage).map((sensor) =>
      sensorPromptPathFor(agentsRoot, sensor),
    ),
    stage: intent.stage,
    stagePromptPath: stagePromptPathFor(agentsRoot, intent.stage),
  };
};

export const validateAidlcStageAssets = async (
  fileSystem: FileSystem,
  packet: AidlcStagePacket,
): Promise<void> => {
  const paths = [
    ...packet.commonPaths,
    packet.stagePromptPath,
    ...packet.rolePaths,
    ...packet.sensorPaths,
  ];
  await Promise.all(
    paths.map(async (path) => {
      if (!(await readText(fileSystem, path)).trim()) {
        throw new Error(`AIDLC stage asset is empty: ${path}`);
      }
    }),
  );
};
