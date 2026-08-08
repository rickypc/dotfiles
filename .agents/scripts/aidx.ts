import { readFile, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { completeAidxPlan, parseAidxPlan } from '../utils/aidx.js';
import { runWhenMain } from '../utils/cli.js';

type PlanImporter = (planPath: string) => Promise<unknown>;

const projectRoot = resolve(import.meta.dir, '..', '..');
const plansRoot = join(projectRoot, '.agents', 'plans');

const importCompletedPlan = async (planPath: string): Promise<unknown> => {
  const child = Bun.spawn(
    [
      'bun',
      join(projectRoot, '.agents', 'scripts', 'knowledge-base.ts'),
      'import-plan',
      planPath,
    ],
    { cwd: projectRoot, stderr: 'pipe', stdout: 'pipe' },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(
      `AIDX knowledge-base plan import failed with exit code ${exitCode}: ${stderr.trim() || stdout.trim()}`,
    );
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error('AIDX knowledge-base plan importer returned invalid JSON.');
  }
};

const relativePlanPath = (value: string | undefined): string => {
  if (!value || isAbsolute(value)) {
    throw new Error('AIDX requires a relative plan path.');
  }
  const path = resolve(projectRoot, value);
  const relativeToPlans = relative(plansRoot, path);
  if (
    !relativeToPlans ||
    relativeToPlans.startsWith('..') ||
    isAbsolute(relativeToPlans) ||
    !relativeToPlans.endsWith('.md')
  ) {
    throw new Error('AIDX plans must live under .agents/plans/<cbm-index>/.');
  }
  return value.replaceAll('\\', '/');
};

const usage = (): string =>
  'Usage: bun <agents-root>/scripts/aidx.ts <relative-plan-path> | complete <relative-plan-path>';

export const run = async (
  args: readonly string[],
  write: (message: string) => void = console.log,
  importer?: PlanImporter,
): Promise<void> => {
  const planImporter = importer ?? importCompletedPlan;
  if (args.length === 2 && args[0] === 'complete') {
    const planPath = relativePlanPath(args[1]);
    const absolutePlanPath = resolve(projectRoot, planPath);
    const plan = parseAidxPlan(await readFile(absolutePlanPath, 'utf8'));
    const completion = await completeAidxPlan(
      planPath,
      plan,
      planImporter,
      async () => unlink(absolutePlanPath),
    );
    write(JSON.stringify(completion, null, 2));
    return;
  }
  if (args.length !== 1) {
    throw new Error(usage());
  }
  const planPath = relativePlanPath(args[0]);
  const absolutePlanPath = resolve(projectRoot, planPath);
  const plan = parseAidxPlan(await readFile(absolutePlanPath, 'utf8'));
  write(
    JSON.stringify(
      {
        cbmIndex: plan.cbmIndex,
        constraints: plan.constraints,
        coreDirectives: plan.coreDirectives,
        executionSteps: plan.executionSteps,
        inputsToProcess: plan.inputsToProcess,
        planPath,
        status: 'ready-for-sequential-execution',
        title: plan.title,
      },
      null,
      2,
    ),
  );
};

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
