import type { CommandBody, CommandDeclaration } from '../utils/cli/declaration.js';
import { errorMessage } from '../utils/cli/errors.js';
import { runMain } from '../utils/cli/index.js';
import { nodeFileSystem, readText } from '../utils/filesystem.js';
import { PROSE_CUE_SET_VERSION, type ProseCueReport, scanText } from '../utils/prose-cues.js';

interface InputReport extends ProseCueReport {
  readonly input: string;
}

interface ScanReceipt {
  readonly markerSetVersion: number;
  readonly networkAccess: false;
  readonly results: readonly InputReport[];
  readonly rewritePerformed: false;
  readonly schemaVersion: 1;
}

const scanInput = async (input: string, readStdin: () => Promise<string>): Promise<InputReport> => {
  try {
    const source = input === '-' ? await readStdin() : await readText(nodeFileSystem, input);
    return { input: input === '-' ? '<stdin>' : input, ...scanText(source) };
  } catch (error) {
    throw new Error(
      `Cannot read UTF-8 input ${input}: ${errorMessage(error)}. Check that the file exists and is readable.`,
    );
  }
};

const scanBody: CommandBody<ScanReceipt> = {
  arity: [1, 32],
  positionals: '<input-path|-> [input-path|-> ...]',
  renderText: (receipt) => JSON.stringify(receipt),
  run: async (input, context) => {
    const stdin = input.positionals.includes('-')
      ? Promise.resolve().then(() => context.readStdin())
      : Promise.resolve('');
    return {
      markerSetVersion: PROSE_CUE_SET_VERSION,
      networkAccess: false,
      results: await Promise.all(input.positionals.map((path) => scanInput(path, () => stdin))),
      rewritePerformed: false,
      schemaVersion: 1,
    };
  },
  summary: 'Report fixed local prose-style cues without changing input files.',
};

export const command: CommandDeclaration<ScanReceipt> = {
  commands: { scan: scanBody },
  script: 'scripts/prose-cues.ts',
  summary: 'Read-only prose cue scanner with a versioned local marker set.',
};

void runMain(command, import.meta.main);
