import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import matter from 'gray-matter';
import { runWhenMain as runCliWhenMain, runWhenMainWithHelp } from '../utils/cli.js';

export interface AidxCompletedPlanValidationReceipt {
  readonly completedSteps: number;
  readonly headings: readonly string[];
  readonly planPath?: string;
  readonly repoSearchIndex?: string;
  readonly skippedSteps: number;
  readonly status: 'valid';
  readonly title: string;
}

export const AIDX_COMPLETED_PLAN_HEADINGS = [
  'TARGET DIRECTIVES',
  'VARIABLE DEFINITION MATRIX',
  'CHRONOLOGICAL WORKFLOW',
  'TOOL STRATEGY & FALLBACKS',
  'SYSTEMATIC VERIFICATION CHECKLIST',
  'RIGID OUTPUT SCHEMA',
] as const;

const REQUIRED_FRONTMATTER = [
  'title',
  'repo_search_index',
  'created_at',
  'updated_at',
  'status',
] as const;

const PLACEHOLDER =
  /(?:\[(?:the |a |brief |specific |high-level |core |guardrails |specific file)[^\]]*\]|\b(?:TBD|TODO|PLACEHOLDER|FIXME)\b|<(?:path|file|symbol|value|type|name|command|slug|absolute-[^>]+)>)/iu;

export class AidxCompletedPlanValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`AIDX completed-plan validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'AidxCompletedPlanValidationError';
    this.issues = issues;
  }
}

const nonEmptyString = (value: unknown, label: string, issues: string[]): string => {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push(`${label} must be a non-empty string.`);
    return '';
  }
  return value.trim();
};

const requireSection = (
  sections: Readonly<Record<string, string>>,
  heading: string,
  issues: string[],
): string => {
  const value = sections[heading] ?? '';
  if (!value) {
    issues.push(`${heading} must contain content.`);
  } else if (PLACEHOLDER.test(value)) {
    issues.push(`${heading} contains an unresolved placeholder.`);
  }
  return value;
};

const sectionText = (body: string, heading: string, index: number): string => {
  const next = AIDX_COMPLETED_PLAN_HEADINGS[index + 1];
  const pattern = next
    ? new RegExp(
        `^## ${index + 1}\\. ${heading}\\n([\\s\\S]*?)(?=^## ${index + 2}\\. ${next}\\n)`,
        'mu',
      )
    : new RegExp(`^## ${index + 1}\\. ${heading}\\n([\\s\\S]*)$`, 'mu');
  return pattern.exec(body)?.[1]?.trim() ?? '';
};

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/aidx-completed-plan-validator.ts <absolute-plan-path>';

const validateH1MatchesTitle = (body: string, title: string, issues: string[]): void => {
  const h1Matches = [...body.matchAll(/^# (.+)$/gmu)];
  if (h1Matches.length === 0) {
    issues.push(
      'Plan body must begin with exactly one H1 (# <title>) on the first line after the YAML frontmatter.',
    );
    return;
  }
  if (h1Matches.length > 1) {
    issues.push(`Plan body must contain exactly one H1; found ${h1Matches.length}.`);
    return;
  }
  const h1Text = h1Matches[0][1].trim();
  if (h1Text !== title.trim()) {
    issues.push(
      `Document H1 ("${h1Text}") must equal the frontmatter title ("${title.trim()}") verbatim.`,
    );
  }
};

const validatePlanPath = (planPath: string, expectedIndex: string, issues: string[]): void => {
  const canonical = resolve(planPath);
  const marker = '/.agents/plans/';
  const markerIndex = canonical.lastIndexOf(marker);
  if (markerIndex <= 0 || !canonical.endsWith('.md')) {
    issues.push(
      'Plan path must be an absolute Markdown file under .agents/plans/<repo-search-index>.',
    );
    return;
  }
  const route = canonical.slice(markerIndex + marker.length).split('/');
  if (route.length !== 2 || route[0] !== expectedIndex || !route[1]) {
    issues.push(
      'Plan path must use the matching .agents/plans/<repo-search-index>/<plan>.md route.',
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(expectedIndex)) {
    issues.push('repo_search_index must be one safe path segment.');
  }
  if (basename(canonical) !== route.at(-1) || dirname(canonical).endsWith('/.agents/plans')) {
    issues.push('Plan path must identify one named plan file inside its index directory.');
  }
};

const validateSectionShape = (body: string, issues: string[]) => {
  const headings = [...body.matchAll(/^## (\d+)\. (.+)$/gmu)].map(
    (match) => `${match[1]}. ${match[2]}`,
  );
  const expectedHeadings = AIDX_COMPLETED_PLAN_HEADINGS.map(
    (heading, index) => `${index + 1}. ${heading}`,
  );
  if (headings.join('\n') !== expectedHeadings.join('\n')) {
    issues.push(
      'Plan must contain exactly the six AIDP H2 headings in order: ## 1. TARGET DIRECTIVES through ## 6. RIGID OUTPUT SCHEMA.',
    );
  }
  const sections = Object.fromEntries(
    AIDX_COMPLETED_PLAN_HEADINGS.map((heading, index) => [
      heading,
      sectionText(body, heading, index),
    ]),
  );
  for (const heading of AIDX_COMPLETED_PLAN_HEADINGS) {
    requireSection(sections, heading, issues);
  }
  return { headings, sections };
};

const validateWorkflow = (
  workflow: string,
  issues: string[],
): { completed: number; skipped: number } => {
  const lines = workflow.split('\n').map((line) => line.trim());
  const taskItems = lines.filter((line) => /^- \[[ x-]\] \S/u.test(line));
  if (taskItems.length === 0) {
    issues.push('CHRONOLOGICAL WORKFLOW must contain Markdown task items.');
    return { completed: 0, skipped: 0 };
  }
  const unchecked = taskItems.filter((line) => /^- \[ \]/u.test(line));
  if (unchecked.length > 0) {
    issues.push(
      `CHRONOLOGICAL WORKFLOW still contains ${unchecked.length} unchecked \`- [ ]\` item(s); a completed plan has no unchecked step.`,
    );
  }
  const invalid = taskItems.filter((line) => /^- \[[~!]\]/u.test(line));
  if (invalid.length > 0) {
    issues.push(
      `CHRONOLOGICAL WORKFLOW contains ${invalid.length} \`- [~]\`/\`- [!]\` item(s); use \`- [x]\` or \`- [-] reason: ...\`.`,
    );
  }
  const skippedItems = taskItems.filter((line) => /^- \[-\]/u.test(line));
  for (const item of skippedItems) {
    if (!/\breason\b/iu.test(item)) {
      issues.push(`Skipped workflow item lacks a reason: "${item.slice(0, 80)}".`);
    }
  }
  return {
    completed: taskItems.filter((line) => /^- \[x\]/u.test(line)).length,
    skipped: skippedItems.length,
  };
};

const validDate = (value: string, label: string, issues: string[]): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    issues.push(`${label} must use YYYY-MM-DD.`);
    return;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    issues.push(`${label} must be a real calendar date.`);
  }
};

const validateFrontmatter = (
  parsed: ReturnType<typeof matter>,
  planPath: string | undefined,
  issues: string[],
) => {
  const metadata = parsed.data as Record<string, unknown>;
  const keys = Object.keys(metadata);
  if (
    keys.length !== REQUIRED_FRONTMATTER.length
    || REQUIRED_FRONTMATTER.some((field) => !keys.includes(field))
  ) {
    issues.push(`Frontmatter must contain exactly: ${REQUIRED_FRONTMATTER.join(', ')}.`);
  }
  const title = nonEmptyString(metadata.title, 'title', issues);
  const repoSearchIndex = nonEmptyString(metadata.repo_search_index, 'repo_search_index', issues);
  const createdAt = nonEmptyString(metadata.created_at, 'created_at', issues);
  const updatedAt = nonEmptyString(metadata.updated_at, 'updated_at', issues);
  const status = nonEmptyString(metadata.status, 'status', issues);
  if (createdAt) {
    validDate(createdAt, 'created_at', issues);
  }
  if (updatedAt) {
    validDate(updatedAt, 'updated_at', issues);
  }
  if (status && !/^completed?$/iu.test(status)) {
    issues.push(
      'status must be `completed` for an AIDX closeout; a pending, draft, blocked, or in-progress plan is not a completed plan.',
    );
  }
  if (title && PLACEHOLDER.test(title)) {
    issues.push('title contains an unresolved placeholder.');
  }
  if (planPath) {
    validatePlanPath(planPath, repoSearchIndex, issues);
  }
  return { repoSearchIndex, title };
};

export const validateAidxCompletedPlan = (
  content: string,
  planPath?: string,
): AidxCompletedPlanValidationReceipt => {
  const issues: string[] = [];
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(content);
  } catch {
    throw new AidxCompletedPlanValidationError(['Plan frontmatter must be valid YAML.']);
  }

  const { repoSearchIndex, title } = validateFrontmatter(parsed, planPath, issues);
  const body = parsed.content.trim();
  const { headings, sections } = validateSectionShape(body, issues);
  validateH1MatchesTitle(body, title, issues);
  const workflow = validateWorkflow(
    sections[AIDX_COMPLETED_PLAN_HEADINGS[2] as string] ?? '',
    issues,
  );

  if (issues.length > 0) {
    throw new AidxCompletedPlanValidationError(issues);
  }
  return {
    completedSteps: workflow.completed,
    headings,
    planPath: planPath ? resolve(planPath) : undefined,
    repoSearchIndex,
    skippedSteps: workflow.skipped,
    status: 'valid',
    title,
  };
};

export const run = async (
  args: readonly string[],
  read: typeof readFile = readFile,
  checkStat: typeof stat = stat,
  write: (message: string) => void = console.log,
): Promise<AidxCompletedPlanValidationReceipt> => {
  if (args.length !== 1 || !args[0]?.startsWith('/')) {
    throw new Error(usage());
  }
  const planPath = resolve(args[0]);
  const metadata = await checkStat(planPath);
  if (!metadata.isFile()) {
    throw new Error(`Plan path is not a regular file: ${planPath}`);
  }
  const receipt = validateAidxCompletedPlan(await read(planPath, 'utf8'), planPath);
  write(JSON.stringify(receipt, null, 2));
  return receipt;
};

export const runWhenMain = runCliWhenMain;

await runWhenMainWithHelp(import.meta.main, Bun.argv.slice(2), usage, run);
