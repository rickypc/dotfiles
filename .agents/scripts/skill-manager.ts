import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import {
  fingerprint,
  renderActionPacket,
} from '../utils/evidence-gated-workflow-controller/packet.js';
import type { WorkflowState } from '../utils/evidence-gated-workflow-controller/state.js';
import { nodeFileSystem, readText } from '../utils/filesystem.js';
import {
  createSkillManagerPacket,
  evaluateSkillMatrix,
  parseMatrixJsonl,
} from '../utils/skill-manager.js';

export const usage = (): string =>
  'Usage: bun ~/.agents/scripts/skill-manager.ts packet <intent-id> <candidate_checked|candidate_requested|draft> <skill-path> [assertion-id,...] | evaluate <baseline|candidate|challenge> <matrix-jsonl-path> <target-path>';

const defaultRead = readText.bind(undefined, nodeFileSystem);

const phaseFor = (
  phase: string,
): 'baseline_recorded' | 'candidate_checked' | 'challenge_checked' => {
  if (phase === 'baseline') return 'baseline_recorded';
  if (phase === 'candidate') return 'candidate_checked';
  if (phase === 'challenge') return 'challenge_checked';
  throw new Error(usage());
};

export const run = async (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer> = defaultRead,
  write: (message: string) => void = console.log,
): Promise<void> => {
  const [command, first, second, third, fourth] = args;
  if (command === 'evaluate') {
    if (!first || !second || !third || fourth || args.length !== 4) {
      throw new Error(usage());
    }
    const [matrixContent, sourceContent] = await Promise.all([
      read(second),
      read(third),
    ]);
    const matrixJsonl = String(matrixContent);
    const sourceText = String(sourceContent);
    const receipt = evaluateSkillMatrix(
      parseMatrixJsonl(matrixJsonl),
      { delegatedChecks: {}, ownedFiles: new Set(), text: sourceText },
      fingerprint(sourceText),
      phaseFor(first),
    );
    write(JSON.stringify(receipt, null, 2));
    return;
  }
  if (
    command !== 'packet' ||
    !first ||
    !second ||
    !third ||
    args.length < 4 ||
    args.length > 5
  ) {
    throw new Error(usage());
  }
  const packet = createSkillManagerPacket({
    failedAssertionIds: fourth?.split(',').filter(Boolean) ?? [],
    intentId: first,
    state: second as WorkflowState,
    targetSkillPath: third,
  });
  write(renderActionPacket(packet));
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
