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

const askList = async (
  prompt: Prompt,
  heading: string,
  minimum: number,
  existing: readonly string[] = [],
): Promise<readonly string[]> => {
  const values: string[] = [];
  let index = 0;
  while (true) {
    const suffix = existing[index] ? ` [existing: ${existing[index]}]` : '';
    const answer = (
      await prompt(
        `${heading} item ${index + 1}${suffix}; enter KEEP to retain the existing item or leave blank to finish.\n> `,
      )
    ).trim();
    if (!answer) {
      return completeList(values, heading, minimum);
    }
    values.push(
      answer.toUpperCase() === 'KEEP' && existing[index]
        ? existing[index]
        : answer,
    );
    index += 1;
  }
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
    'EXECUTION STEPS',
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
    executionSteps,
    inputsToProcess: [...contextInputs, ...inputsToProcess],
    objective,
    role,
    summary: existing?.summary ?? summary,
  };
};

const existingAnswers = (content: string): PlanAnswers => {
  const metadata = matter(content).data as Record<string, unknown>;
  const lines = content.split('\n');
  const valuesFor = (
    heading: string,
    nextHeading?: string,
  ): readonly string[] => {
    const start = lines.indexOf(`# ${heading}`) + 1;
    const end = nextHeading ? lines.indexOf(`# ${nextHeading}`) : lines.length;
    return lines
      .slice(start, end < 0 ? lines.length : end)
      .map((line) => line.replace(/^(?:[-*]|\d+\.)\s+/u, '').trim())
      .filter((line) => line && !line.startsWith('['));
  };
  return {
    cbmIndex: String(metadata.cbm_index ?? ''),
    constraints: valuesFor('CONSTRAINTS', 'INPUTS TO PROCESS'),
    coreDirectives: valuesFor('CORE DIRECTIVES', 'EXECUTION STEPS'),
    executionSteps: valuesFor('EXECUTION STEPS', 'CONSTRAINTS'),
    inputsToProcess: valuesFor('INPUTS TO PROCESS'),
    objective: valuesFor('OBJECTIVE', 'CORE DIRECTIVES').join(' '),
    role: valuesFor('ROLE', 'OBJECTIVE').join(' '),
    summary: String(metadata.title ?? ''),
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
    !['codebase-memory.ts', 'knowledge-base.ts'].includes(
      pathBasename(scriptPath),
    )
  ) {
    throw new Error(
      `AIDP owned-read boundary rejected child script: ${scriptPath}`,
    );
  }
  const child = Bun.spawn(['bun', scriptPath, ...arguments_], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(
      `${scriptPath} failed with exit code ${exitCode}: ${stderr.trim() || stdout.trim()}`,
    );
  }
  return stdout.trim();
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
    join(agentsRoot, 'scripts', 'codebase-memory.ts'),
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
          aidxCommand: `/aidx ${planPath}`,
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

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
