import { readFile, realpath, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import {
  assertPlanPathForIndex,
  completeAidxPlan,
  parseAidxPlan,
} from '../utils/aidx.js';
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
  if (!value) {
    throw new Error('AIDX requires a plan path.');
  }
  const path = resolve(isAbsolute(value) ? value : join(projectRoot, value));
  const relativeToPlans = relative(plansRoot, path).replaceAll('\\', '/');
  if (
    !relativeToPlans ||
    relativeToPlans.startsWith('../') ||
    isAbsolute(relativeToPlans) ||
    !relativeToPlans.endsWith('.md')
  ) {
    throw new Error('AIDX plans must live under .agents/plans/<cbm-index>/.');
  }
  return relative(projectRoot, path).replaceAll('\\', '/');
};

const canonicalPlan = async (
  value: string | undefined,
): Promise<{
  readonly absolutePath: string;
  readonly inputPath: string;
  readonly relativePath: string;
}> => {
  if (!value) {
    throw new Error('AIDX requires a plan path.');
  }
  const candidate = resolve(
    isAbsolute(value) ? value : join(projectRoot, value),
  );
  const relativeCandidate = relativePlanPath(value);
  const plansRootReal = await realpath(plansRoot);
  const candidateReal = await realpath(candidate);
  const relativeReal = relative(plansRootReal, candidateReal).replaceAll(
    '\\',
    '/',
  );
  if (
    !relativeReal ||
    relativeReal.startsWith('../') ||
    isAbsolute(relativeReal) ||
    !relativeReal.endsWith('.md')
  ) {
    throw new Error('AIDX plan path must resolve inside .agents/plans/.');
  }
  if (!(await stat(candidateReal)).isFile()) {
    throw new Error('AIDX plan path must resolve to a regular file.');
  }
  return {
    absolutePath: candidateReal,
    inputPath: value,
    relativePath: relativeCandidate,
  };
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
    const resolved = await canonicalPlan(args[1]);
    const plan = parseAidxPlan(await readFile(resolved.absolutePath, 'utf8'));
    assertPlanPathForIndex(resolved.relativePath, plan.cbmIndex);
    const completion = await completeAidxPlan(
      resolved.relativePath,
      plan,
      planImporter,
      async () => unlink(resolved.absolutePath),
    );
    write(
      JSON.stringify({ ...completion, inputPath: resolved.inputPath }, null, 2),
    );
    return;
  }
  if (args.length !== 1) {
    throw new Error(usage());
  }
  const resolved = await canonicalPlan(args[0]);
  const plan = parseAidxPlan(await readFile(resolved.absolutePath, 'utf8'));
  assertPlanPathForIndex(resolved.relativePath, plan.cbmIndex);
  write(
    JSON.stringify(
      {
        cbmIndex: plan.cbmIndex,
        constraints: plan.constraints,
        coreDirectives: plan.coreDirectives,
        executionSteps: plan.executionSteps,
        inputPath: resolved.inputPath,
        inputsToProcess: plan.inputsToProcess,
        planPath: resolved.relativePath,
        status: 'ready-for-sequential-execution',
        title: plan.title,
      },
      null,
      2,
    ),
  );
};

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
