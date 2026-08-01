import { runAidlcCliWhenMain } from '../../utils/aidlc/cli.js';
import { loadAidlcIntent } from '../../utils/aidlc/intent.js';
import {
  renderAidlcStagePacket,
  stagePacketFor,
  validateAidlcStageAssets,
} from '../../utils/aidlc/stage.js';
import { runWhenMain as runCliWhenMain } from '../../utils/cli.js';
import { nodeFileSystem } from '../../utils/filesystem.js';

export const usage = (): string =>
  'Usage: bun ~/.agents/scripts/aidlc/stage.ts next <agents-root> <intent-path>';

export const run = async (
  args: readonly string[],
  write: (value: string) => void = console.log,
  load: typeof loadAidlcIntent = loadAidlcIntent,
  packet: typeof stagePacketFor = stagePacketFor,
  validate: typeof validateAidlcStageAssets = validateAidlcStageAssets,
): Promise<void> => {
  const [command, agentsRoot, intentPath] = args;
  if (command !== 'next' || !agentsRoot || !intentPath || args.length !== 3) {
    throw new Error(usage());
  }
  const stagePacket = packet(
    agentsRoot,
    await load(nodeFileSystem, intentPath),
  );
  await validate(nodeFileSystem, stagePacket);
  write(renderAidlcStagePacket(stagePacket));
};

export const runWhenMain = runCliWhenMain;

runAidlcCliWhenMain(import.meta.main, Bun.argv.slice(2), run);
