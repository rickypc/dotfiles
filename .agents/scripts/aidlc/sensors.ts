import { loadAidlcIntent } from '../../utils/aidlc/intent.js';
import { runAidlcSensors } from '../../utils/aidlc/sensors.js';
import { runWhenMain as runCliWhenMain } from '../../utils/cli.js';
import { nodeFileSystem } from '../../utils/filesystem.js';

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/aidlc/sensors.ts check <intent-path>';

export const run = async (
  args: readonly string[],
  write: (value: string) => void = console.log,
  load: typeof loadAidlcIntent = loadAidlcIntent,
  sensors: typeof runAidlcSensors = runAidlcSensors,
): Promise<void> => {
  const [command, intentPath, stage] = args;
  if (
    command !== 'check' ||
    !intentPath ||
    args.length < 2 ||
    args.length > 3
  ) {
    throw new Error(usage());
  }
  write(
    JSON.stringify(
      sensors(
        await load(nodeFileSystem, intentPath),
        stage as Parameters<typeof runAidlcSensors>[1],
      ),
    ),
  );
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
