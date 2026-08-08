import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { nodeFileSystem } from '../utils/filesystem.js';
import {
  type SkillSuiteValidationReceipt,
  validateAllSkills,
} from '../utils/skill-manager.js';

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/validate-skills.ts';

export const validReceiptLine = (
  receipt: SkillSuiteValidationReceipt,
): string =>
  `skill-validation: passed — ${receipt.skillCount} skills, ${receipt.matrixCount} matrix cases, ${receipt.prose.prosePaths.length} prose paths, ${receipt.prose.checkedLocalLinkTargets} local links checked.`;

export const run = async (
  args: readonly string[],
  agentsRoot = `${import.meta.dir}/..`,
  write: (message: string) => void = console.log,
  validate: typeof validateAllSkills = validateAllSkills,
): Promise<void> => {
  if (args.length !== 0) {
    throw new Error(usage());
  }
  const receipt = await validate(nodeFileSystem, `${agentsRoot}/skills`);
  write(validReceiptLine(receipt));
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
