import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { nodeFileSystem } from '../utils/filesystem.js';
import { validateAllSkills } from '../utils/skill-manager.js';

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/validate-skills.ts';

export const run = async (
  args: readonly string[],
  agentsRoot = `${import.meta.dir}/..`,
  write: (message: string) => void = console.log,
): Promise<void> => {
  if (args.length !== 0) {
    throw new Error(usage());
  }
  const receipt = await validateAllSkills(
    nodeFileSystem,
    `${agentsRoot}/skills`,
  );
  write(
    JSON.stringify(
      {
        matrixCount: receipt.matrixCount,
        prose: {
          checkedLocalLinkTargets: receipt.prose.checkedLocalLinkTargets,
          findings: receipt.prose.findings,
          ignoredPathCount: receipt.prose.ignoredPaths.length,
          prosePathCount: receipt.prose.prosePaths.length,
          reviewedRoots: receipt.prose.reviewedRoots,
        },
        skillCount: receipt.skillCount,
        status: receipt.status,
      },
      null,
      2,
    ),
  );
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
