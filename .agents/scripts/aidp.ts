import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import matter from 'gray-matter';

import {
  acquireAidpLock,
  cbmIndexForProject,
  derivePlanSummary,
  planPathFor,
  relativePlanPathFor,
  renderAidpPlan,
  renderPlanHandoff,
  resolveProjectRoot,
  slugifyPlanSummary,
  validatePlanIntegrity,
} from '../utils/aidp.js';
import { runWhenMain } from '../utils/cli.js';
import {
  type BunSpawner,
  createBunExecutor,
  execute,
} from '../utils/process.js';

interface CliOptions {
  readonly projectRoot?: string;
  readonly request?: string;
}

interface PlanAnswers {
  readonly cbmIndex: string;
  readonly constraints: readonly string[];
  readonly coreDirectives: readonly string[];
  readonly executionSteps: readonly string[];
  readonly inputsToProcess: readonly string[];
  readonly objective: string;
  readonly role: string;
  readonly summary: string;
}

interface ProjectContext {
  readonly agentsRoot: string;
  readonly cbmIndex: string;
  readonly inputs: readonly string[];
  readonly projectRoot: string;
}

type Prompt = (question: string) => Promise<string>;

const MAX_LIST_ITEMS_PER_ROUND = 5;

const agentsRoot = resolve(import.meta.dir, '..');
const templatePath = join(agentsRoot, 'skills', 'aidp', 'template.md');

const askRequired = async (
  prompt: Prompt,
  question: string,
): Promise<string> => {
  const answer = (await prompt(`${question}\n> `)).trim();
  if (!answer) {
    throw new Error(
      `${question} is unresolved; aidp stopped for clarification.`,
    );
  }
  return answer;
};

const askValue = async (
  prompt: Prompt,
  question: string,
  existing?: string,
): Promise<string> => {
  const answer = (
    await prompt(`${question}${existing ? ` [existing: ${existing}]` : ''}\n> `)
  ).trim();
  if (!answer) {
    throw new Error(
      `${question} is unresolved; aidp stopped for clarification.`,
    );
  }
  return answer.toUpperCase() === 'KEEP' && existing ? existing : answer;
};

const assertDirectory = async (path: string, label: string): Promise<void> => {
  try {
    if (!(await stat(path)).isDirectory()) {
      throw new Error(`${label} must be a directory: ${path}`);
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${path}`);
    }
    throw error;
  }
};

const completeList = (
  values: readonly string[],
  heading: string,
  minimum: number,
): readonly string[] => {
  if (values.length < minimum) {
    throw new Error(`${heading} needs at least ${minimum} explicit item(s).`);
  }
  return values;
};

const parseListBatch = (
  rawAnswer: string,
  heading: string,
  round: number,
): readonly string[] => {
  let batch: unknown;
  try {
    batch = JSON.parse(rawAnswer.trim());
  } catch (error: unknown) {
    throw new Error(
      `${heading} batch round ${round} must be one JSON array of up to ${MAX_LIST_ITEMS_PER_ROUND} strings; received invalid JSON. ` +
        'Submit a corrected batch; this is an input error, not an unresolved requirement.',
      { cause: error },
    );
  }
  if (!Array.isArray(batch)) {
    throw new Error(
      `${heading} batch round ${round} must be a JSON array of up to ${MAX_LIST_ITEMS_PER_ROUND} strings; received ${typeof batch}.`,
    );
  }
  if (batch.length > MAX_LIST_ITEMS_PER_ROUND) {
    throw new Error(
      `${heading} batch round ${round} contains ${batch.length} items; the maximum is ${MAX_LIST_ITEMS_PER_ROUND}. Submit at most ${MAX_LIST_ITEMS_PER_ROUND} items per round.`,
    );
  }
  return batch.map((item, batchIndex) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(
        `${heading} batch round ${round} item ${batchIndex + 1} must be a non-empty string.`,
      );
    }
    return item.trim();
  });
};

const askListBatch = async (
  prompt: Prompt,
  heading: string,
  round: number,
): Promise<readonly string[]> => {
  try {
    const rawAnswer = await prompt(
      `${heading} batch round ${round}: return one JSON array containing 1-${MAX_LIST_ITEMS_PER_ROUND} strings, one string per item. ` +
        'Use "KEEP" for an existing item at the current position; return [] only when the complete list has been submitted.\n> ',
    );
    return parseListBatch(rawAnswer, heading, round);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.startsWith(`${heading} batch round ${round}`)) {
      throw error;
    }
    throw new Error(`${heading} batch round ${round} input failed: ${reason}`, {
      cause: error,
    });
  }
};

const askList = async (
  prompt: Prompt,
  heading: string,
  minimum: number,
  existing: readonly string[] = [],
): Promise<readonly string[]> => {
  const values: string[] = [];
  let index = 0;
  let round = 1;
  while (true) {
    const batch = await askListBatch(prompt, heading, round);
    if (batch.length === 0) {
      return completeList(values, heading, minimum);
    }
    for (const item of batch) {
      values.push(
        item.toUpperCase() === 'KEEP' && existing[index]
          ? existing[index]
          : item,
      );
      index += 1;
    }
    round += 1;
  }
};

const skillManagerStep =
  "[ ] Action: Invoke /skill-manager for the affected skill package before changing it; Target or Boundary: <agents-root>/skills/skill-manager/SKILL.md and the named skill package; Source -> Target: the plan's skill-target findings -> the Skill Manager-owned contract, review, validation, and evaluation lane; Change or Decision: route every skill-package change through /skill-manager; Dependency or Ordering: first applicable step before any skill-package edit; Reason: skill lifecycle ownership must be explicit for AIDX; Acceptance or Proof: /skill-manager validate, review, and applicable evaluation receipts; Failure or Stop: stop if the affected skill package or owner is unresolved.";

const existingAnswers = (content: string): PlanAnswers => {
  const metadata = matter(content).data as Record<string, unknown>;
  const lines = content.split('\n');
  const valuesFor = (
    heading: string,
    nextHeading?: string,
    ordered = false,
  ): readonly string[] => {
    const start = lines.indexOf(`# ${heading}`) + 1;
    const end = nextHeading ? lines.indexOf(`# ${nextHeading}`) : lines.length;
    return lines
      .slice(start, end < 0 ? lines.length : end)
      .map((line) => line.trim())
      .filter((line) =>
        ordered ? /^\d+\.\s+/u.test(line) : line && !line.startsWith('['),
      )
      .map((line) => line.replace(/^(?:[-*]|\d+\.)\s+/u, '').trim());
  };
  const orderedHeading = 'ORDERED EXECUTION STEPS';
  return {
    cbmIndex: String(metadata.cbm_index ?? ''),
    constraints: valuesFor('CONSTRAINTS', 'INPUTS TO PROCESS'),
    coreDirectives: valuesFor('CORE DIRECTIVES', orderedHeading),
    executionSteps: valuesFor(orderedHeading, 'CONSTRAINTS', true),
    inputsToProcess: valuesFor('INPUTS TO PROCESS'),
    objective: valuesFor('OBJECTIVE', 'CORE DIRECTIVES').join(' '),
    role: valuesFor('ROLE', 'OBJECTIVE').join(' '),
    summary: String(metadata.title ?? ''),
  };
};

const includesSkillPackageTarget = (step: string): boolean =>
  /\/skills\/|(?:^|\s)SKILL\.md\b|(?:^|\s)template\.md\b/iu.test(step);

const ensureSkillManagerStep = (
  executionSteps: readonly string[],
): readonly string[] => {
  if (
    !executionSteps.some(includesSkillPackageTarget) ||
    executionSteps.some((step) => /\/skill-manager\b/iu.test(step))
  ) {
    return executionSteps;
  }
  return [skillManagerStep, ...executionSteps];
};

const answersFor = async (
  prompt: Prompt,
  summary: string,
  cbmIndex: string,
  contextInputs: readonly string[],
  existing?: PlanAnswers,
): Promise<PlanAnswers> => {
  const role = await askValue(
    prompt,
    'ROLE: which specific expert role owns this plan?',
    existing?.role,
  );
  const objective = await askValue(
    prompt,
    'OBJECTIVE: what observable outcome must this plan deliver?',
    existing?.objective,
  );
  const coreDirectives = await askList(
    prompt,
    'CORE DIRECTIVES',
    2,
    existing?.coreDirectives,
  );
  const executionSteps = await askList(
    prompt,
    'ORDERED EXECUTION STEPS',
    1,
    existing?.executionSteps,
  );
  const constraints = await askList(
    prompt,
    'CONSTRAINTS',
    1,
    existing?.constraints,
  );
  const inputsToProcess = await askList(
    prompt,
    'INPUTS TO PROCESS',
    1,
    existing?.inputsToProcess,
  );
  return {
    cbmIndex,
    constraints,
    coreDirectives,
    executionSteps: ensureSkillManagerStep(executionSteps),
    inputsToProcess: [...contextInputs, ...inputsToProcess],
    objective,
    role,
    summary: existing?.summary ?? summary,
  };
};

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const pathBasename = (path: string): string => path.split('/').at(-1) ?? path;

const privateKnowledgeBaseRoot = (): string =>
  join(homedir(), 'Library', 'Application Support', 'agent-knowledge-base');

const readExistingPlan = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const readOptional = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const receiptSummary = (receipt: string): string =>
  receipt.replace(/\s+/gu, ' ').trim().slice(0, 1200);

const runOwnedRead = async (
  scriptPath: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<string> => {
  if (
    !['repo-search.ts', 'knowledge-base.ts'].includes(pathBasename(scriptPath))
  ) {
    throw new Error(
      `AIDP owned-read boundary rejected child script: ${scriptPath}`,
    );
  }
  const result = await execute(
    createBunExecutor(Bun.spawn as unknown as BunSpawner),
    {
      args: [scriptPath, ...arguments_],
      command: 'bun',
      cwd,
    },
  );
  return result.stdout.trim();
};

const AIDP_LOCK_STALE_AFTER_MS = 15 * 60 * 1000;

const contextFor = async (
  projectRoot: string,
  request: string,
): Promise<ProjectContext> => {
  const cbmIndex = cbmIndexForProject(projectRoot, tmpdir());
  const guidancePaths = [
    join(projectRoot, 'AGENTS.md'),
    join(projectRoot, '.agents', 'references', 'agents', 'tool-execution.md'),
  ];
  const guidanceInputs: string[] = [];
  for (const path of guidancePaths) {
    if (await readOptional(path)) {
      guidanceInputs.push(`Project guidance loaded: ${path}`);
    }
  }
  const cbmReceipt = await runOwnedRead(
    join(agentsRoot, 'scripts', 'repo-search.ts'),
    ['discover', projectRoot, cbmIndex, request],
    projectRoot,
  );
  const knowledgeRoot = privateKnowledgeBaseRoot();
  const knowledgeReceipt = !(await isDirectory(knowledgeRoot))
    ? 'Private knowledge base root was not configured; no KB receipt was available.'
    : await runOwnedRead(
        join(agentsRoot, 'scripts', 'knowledge-base.ts'),
        ['search', knowledgeRoot, cbmIndex, request],
        projectRoot,
      );
  return {
    agentsRoot,
    cbmIndex,
    inputs: [
      `Resolved project root: ${projectRoot}`,
      `Derived CBM index: ${cbmIndex}`,
      ...guidanceInputs,
      `CBM receipt: ${receiptSummary(cbmReceipt)}`,
      `KB receipt: ${receiptSummary(knowledgeReceipt)}`,
    ],
    projectRoot,
  };
};

const usage = (): string =>
  'Usage: bun <agents-root>/scripts/aidp.ts [--project <project-root>] [plan-request]';

const parseArgs = (args: readonly string[]): CliOptions => {
  const parsed = args.reduce(
    (state, argument, index) => {
      if (state.skipNext) {
        state.skipNext = false;
        return state;
      }
      const projectOption = /^--project(?:=(.*))?$/u.exec(argument);
      if (projectOption) {
        const projectRoot = projectOption[1] ?? args[index + 1];
        if (!projectRoot) {
          throw new Error(`${usage()}\n--project requires a path.`);
        }
        state.projectRoot = projectRoot;
        state.skipNext = projectOption[1] === undefined;
        return state;
      }
      if (argument.startsWith('-')) {
        throw new Error(usage());
      }
      state.requestParts.push(argument);
      return state;
    },
    {
      projectRoot: undefined as string | undefined,
      requestParts: [] as string[],
      skipNext: false,
    },
  );
  return {
    projectRoot: parsed.projectRoot,
    request: parsed.requestParts.join(' ').trim() || undefined,
  };
};

const writePlan = async (
  projectRoot: string,
  templateContent: string,
  summary: string,
  answers: PlanAnswers,
  existingPath?: string,
): Promise<string> => {
  const now = new Date().toISOString().slice(0, 10);
  const path =
    existingPath ?? planPathFor(projectRoot, answers.cbmIndex, summary);
  const expectedPath = planPathFor(projectRoot, answers.cbmIndex, summary);
  if (resolve(path) !== resolve(expectedPath)) {
    throw new Error('Existing plan path does not match its summary slug.');
  }
  const existing = existingPath
    ? await readFile(existingPath, 'utf8')
    : undefined;
  const content = renderAidpPlan(templateContent, {
    cbmIndex: answers.cbmIndex,
    constraints: answers.constraints,
    coreDirectives: answers.coreDirectives,
    createdAt: existing
      ? String(
          (matter(existing).data as Record<string, unknown>).created_at ?? now,
        )
      : now,
    executionSteps: answers.executionSteps,
    inputsToProcess: answers.inputsToProcess,
    objective: answers.objective,
    role: answers.role,
    status: 'pending',
    summary,
    updatedAt: now,
  });
  validatePlanIntegrity(content, answers.cbmIndex);
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, content, 'utf8');
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return relativePlanPathFor(projectRoot, path);
};

export const run = async (
  args: readonly string[],
  write: (message: string) => void = console.log,
  suppliedPrompt?: Prompt,
): Promise<void> => {
  const options = parseArgs(args);
  const invocationRoot = process.cwd();
  const projectRoot = resolveProjectRoot(invocationRoot, options.projectRoot);
  await assertDirectory(projectRoot, 'Project root');
  if (!options.request && !suppliedPrompt && !input.isTTY) {
    throw new Error(
      'AIDP requires a plan request when stdin is not an interactive terminal.',
    );
  }
  const lock = await acquireAidpLock(
    {
      mkdir: async (path, options) => {
        await mkdir(path, { recursive: options.recursive });
      },
      readFile,
      unlink,
      writeFile,
    },
    projectRoot,
    options.request ?? 'interactive',
    process.pid,
    Date.now(),
    AIDP_LOCK_STALE_AFTER_MS,
  );
  const templateContent = await readFile(templatePath, 'utf8');
  const readline = suppliedPrompt
    ? undefined
    : createInterface({ input, output });
  const prompt: Prompt =
    suppliedPrompt ??
    ((question) =>
      readline?.question(question) ??
      Promise.reject(new Error('AIDP prompt interface is unavailable.')));
  try {
    const request =
      options.request ??
      (await askRequired(
        prompt,
        'What should this implementation plan accomplish?',
      ));
    const context = await contextFor(projectRoot, request);
    const summary = derivePlanSummary(request, projectRoot);
    const candidate = planPathFor(projectRoot, context.cbmIndex, summary);
    const existing = await readExistingPlan(candidate);
    const prior = existing ? existingAnswers(existing) : undefined;
    const answers = await answersFor(
      prompt,
      summary,
      context.cbmIndex,
      context.inputs,
      prior,
    );
    const planPath = await writePlan(
      projectRoot,
      templateContent,
      summary,
      answers,
      existing ? candidate : undefined,
    );
    write(
      JSON.stringify(
        {
          absolutePlanPath: resolve(projectRoot, planPath),
          aidxCommand: `/aidx ${resolve(projectRoot, planPath)}`,
          cbmIndex: context.cbmIndex,
          handoff: renderPlanHandoff(
            projectRoot,
            resolve(projectRoot, planPath),
          ),
          planPath,
          projectRoot: context.projectRoot,
          summary,
          summarySlug: slugifyPlanSummary(summary),
        },
        null,
        2,
      ),
    );
  } finally {
    readline?.close();
    await lock.release();
  }
};

const mainResult = runWhenMain(import.meta.main, Bun.argv.slice(2), run);
if (mainResult instanceof Promise) {
  try {
    await mainResult;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`AIDP failed: ${message}`);
    process.exitCode = 1;
  }
}
