import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import {
  type FileSystem,
  nodeFileSystem,
  readText,
} from '../utils/filesystem.js';
import {
  fingerprint,
  renderActionPacket,
} from '../utils/quality-engine/packet.js';
import type { WorkflowState } from '../utils/quality-engine/state.js';
import {
  createSkillManagerPacket,
  evaluateSkillManagerBatch,
  evaluateSkillMatrix,
  initializeSkill,
  parseMatrixJsonl,
  reviewSkillProse,
  validateSkill,
} from '../utils/skill-manager.js';

export const usage = (): string =>
  [
    'Usage:',
    '  bun <agents-root>/scripts/skill-manager.ts init <absolute-skill-path> <description>',
    '  bun <agents-root>/scripts/skill-manager.ts validate <absolute-skill-path>',
    '  bun <agents-root>/scripts/skill-manager.ts review <absolute-skill-or-static-root-path> [absolute-additional-static-root-path]',
    '  bun <agents-root>/scripts/skill-manager.ts evaluate <baseline-or-candidate-or-challenge> <absolute-matrix-jsonl-path> <absolute-skill-file-path>',
    '  bun <agents-root>/scripts/skill-manager.ts batch <review-id> <baseline-or-candidate> <absolute-matrix-jsonl-path> <absolute-skill-file-path> ...',
    '  bun <agents-root>/scripts/skill-manager.ts packet <review-id> <candidate-checked-or-candidate-requested-or-draft> <absolute-skill-path> [failed-assertion-ids]',
  ].join('\n');

const defaultRead = readText.bind(undefined, nodeFileSystem);

const batchPairsFor = (
  args: readonly string[],
): readonly {
  readonly matrixPath: string;
  readonly targetSkillPath: string;
}[] => {
  const pairs = args.slice(3);
  if (
    !args[1] ||
    (args[2] !== 'baseline' && args[2] !== 'candidate') ||
    pairs.length === 0 ||
    pairs.length % 2 !== 0
  ) {
    throw new Error(usage());
  }
  const parsed = Array.from({ length: pairs.length / 2 }, (_, index) => ({
    matrixPath: pairs[index * 2] ?? '',
    targetSkillPath: pairs[index * 2 + 1] ?? '',
  }));
  if (
    parsed.some(
      ({ matrixPath, targetSkillPath }) =>
        !matrixPath.startsWith('/') ||
        !matrixPath.endsWith('.jsonl') ||
        !targetSkillPath.startsWith('/') ||
        !targetSkillPath.endsWith('/SKILL.md'),
    )
  ) {
    throw new Error(
      'batch requires absolute <matrix-jsonl-path> values and absolute <skill-file-path> values ending in /SKILL.md.',
    );
  }
  return parsed;
};

const phaseFor = (
  phase: string,
): 'baseline_recorded' | 'candidate_checked' | 'challenge_checked' => {
  if (phase === 'baseline') {
    return 'baseline_recorded';
  }
  if (phase === 'candidate') {
    return 'candidate_checked';
  }
  if (phase === 'challenge') {
    return 'challenge_checked';
  }
  throw new Error(usage());
};

const runInit = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: FileSystem,
): Promise<void> => {
  if (args.length !== 3 || !args[1]?.startsWith('/') || !args[2]) {
    throw new Error(usage());
  }
  write(
    JSON.stringify(
      await initializeSkill(fileSystem, args[1], args[2]),
      null,
      2,
    ),
  );
};

const runPacket = (
  args: readonly string[],
  write: (message: string) => void,
): void => {
  const [, reviewId, state, targetSkillPath, failedAssertionIds] = args;
  if (
    args[0] !== 'packet' ||
    !reviewId ||
    !state ||
    !targetSkillPath ||
    args.length < 4 ||
    args.length > 5
  ) {
    throw new Error(usage());
  }
  write(
    renderActionPacket(
      createSkillManagerPacket({
        failedAssertionIds:
          failedAssertionIds?.split(',').filter(Boolean) ?? [],
        reviewId,
        state: state as WorkflowState,
        targetSkillPath,
      }),
    ),
  );
};

const runReview = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
): Promise<void> => {
  const roots = args.slice(1);
  if (roots.length === 0 || roots.some((root) => !root.startsWith('/'))) {
    throw new Error(usage());
  }
  write(JSON.stringify(await reviewSkillProse(fileSystem, roots), null, 2));
};

const runValidate = async (
  args: readonly string[],
  write: (message: string) => void,
  fileSystem: Pick<FileSystem, 'readFile'>,
): Promise<void> => {
  if (args.length !== 2 || !args[1]?.startsWith('/')) {
    throw new Error(usage());
  }
  write(JSON.stringify(await validateSkill(fileSystem, args[1]), null, 2));
};

export const run = async (
  args: readonly string[],
  read: (path: string) => Promise<string | Buffer> = defaultRead,
  write: (message: string) => void = console.log,
  fileSystem: FileSystem = nodeFileSystem,
): Promise<void> => {
  const [command, first, second, third, fourth] = args;
  if (command === 'init') {
    await runInit(args, write, fileSystem);
    return;
  }
  if (command === 'validate') {
    await runValidate(args, write, fileSystem);
    return;
  }
  if (command === 'review') {
    await runReview(args, write, fileSystem);
    return;
  }
  if (command === 'batch') {
    const pairs = batchPairsFor(args);
    const sources = await Promise.all(
      pairs.map(async ({ matrixPath, targetSkillPath }) => {
        const [matrixContent, sourceContent] = await Promise.all([
          read(matrixPath),
          read(targetSkillPath),
        ]);
        return {
          matrix: parseMatrixJsonl(String(matrixContent)),
          matrixPath,
          sourceText: String(sourceContent),
          targetSkillPath,
        };
      }),
    );
    write(
      JSON.stringify(
        evaluateSkillManagerBatch(
          first ?? '',
          second as 'baseline' | 'candidate',
          sources,
        ),
        null,
        2,
      ),
    );
    return;
  }
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
  runPacket(args, write);
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
