import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import matter from 'gray-matter';
import {
  runWhenMain as runCliWhenMain,
  runWhenMainWithHelp,
} from '../utils/cli.js';

export interface AidpPlanValidationReceipt {
  readonly headings: readonly string[];
  readonly planPath?: string;
  readonly repoSearchIndex?: string;
  readonly status: 'valid';
  readonly title: string;
}

export const AIDP_PLAN_HEADINGS = [
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

export class AidpPlanValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`AIDP plan validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'AidpPlanValidationError';
    this.issues = issues;
  }
}

const itemLines = (section: string): readonly string[] =>
  section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+|^\d+[.)]\s+|^\|[^|]/u.test(line));

const nonEmptyString = (
  value: unknown,
  label: string,
  issues: string[],
): string => {
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
  allowSchemaPlaceholders = false,
): string => {
  const value = sections[heading] ?? '';
  if (!value) {
    issues.push(`${heading} must contain content.`);
  }
  if (!allowSchemaPlaceholders && PLACEHOLDER.test(value)) {
    issues.push(`${heading} contains an unresolved placeholder.`);
  }
  return value;
};

const requireTerms = (
  section: string,
  heading: string,
  alternatives: readonly (readonly string[])[],
  issues: string[],
): void => {
  for (const group of alternatives) {
    if (
      !group.some((term) => new RegExp(`\\b${term}\\b`, 'iu').test(section))
    ) {
      issues.push(`${heading} must state ${group.join(' or ')}.`);
    }
  }
};

const requireWorkflowTaskItems = (
  workflow: string,
  workflowItems: readonly string[],
  issues: string[],
): void => {
  const taskItems = workflow
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^- \[ \] \S/u.test(line));
  if (taskItems.length !== workflowItems.length) {
    issues.push(
      'CHRONOLOGICAL WORKFLOW must contain only unchecked Markdown task items beginning `- [ ]`.',
    );
  }
};

const sectionText = (body: string, heading: string, index: number): string => {
  const next = AIDP_PLAN_HEADINGS[index + 1];
  const pattern = next
    ? new RegExp(
        `^### ${index + 1}\\. ${heading}\\n([\\s\\S]*?)(?=^### ${index + 2}\\. ${next}\\n)`,
        'mu',
      )
    : new RegExp(`^### ${index + 1}\\. ${heading}\\n([\\s\\S]*)$`, 'mu');
  return pattern.exec(body)?.[1]?.trim() ?? '';
};

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/aidp-plan-validator.ts <absolute-plan-path>';

const validatePlanPath = (
  planPath: string,
  expectedIndex: string,
  issues: string[],
): void => {
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
  if (
    basename(canonical) !== route.at(-1) ||
    dirname(canonical).endsWith('/.agents/plans')
  ) {
    issues.push(
      'Plan path must identify one named plan file inside its index directory.',
    );
  }
};

const validateSections = (body: string, issues: string[]) => {
  const headings = [...body.matchAll(/^### (\d+)\. (.+)$/gmu)].map(
    (match) => `${match[1]}. ${match[2]}`,
  );
  const expectedHeadings = AIDP_PLAN_HEADINGS.map(
    (heading, index) => `${index + 1}. ${heading}`,
  );
  if (headings.join('\n') !== expectedHeadings.join('\n')) {
    issues.push('Plan must contain exactly the six AIDP headings in order.');
  }
  const sections = Object.fromEntries(
    AIDP_PLAN_HEADINGS.map((heading, index) => [
      heading,
      sectionText(body, heading, index),
    ]),
  );
  const target = requireSection(sections, AIDP_PLAN_HEADINGS[0], issues);
  const variables = requireSection(sections, AIDP_PLAN_HEADINGS[1], issues);
  const workflow = requireSection(sections, AIDP_PLAN_HEADINGS[2], issues);
  const tools = requireSection(sections, AIDP_PLAN_HEADINGS[3], issues);
  const verification = requireSection(sections, AIDP_PLAN_HEADINGS[4], issues);
  const output = requireSection(sections, AIDP_PLAN_HEADINGS[5], issues, true);

  requireTerms(
    target,
    AIDP_PLAN_HEADINGS[0],
    [
      ['objective'],
      ['scope'],
      ['exclude', 'exclusion', 'exclusions'],
      ['owner'],
    ],
    issues,
  );
  if (itemLines(variables).length < 1) {
    issues.push(
      'VARIABLE DEFINITION MATRIX must contain at least one item or table row.',
    );
  }
  requireTerms(
    variables,
    AIDP_PLAN_HEADINGS[1],
    [['type'], ['required', 'optional']],
    issues,
  );
  const workflowItems = itemLines(workflow);
  if (workflowItems.length === 0) {
    issues.push('CHRONOLOGICAL WORKFLOW must contain numbered steps.');
  }
  requireWorkflowTaskItems(workflow, workflowItems, issues);
  workflowItems.forEach((step, index) => {
    requireTerms(
      step,
      `CHRONOLOGICAL WORKFLOW step ${index + 1}`,
      [
        ['target', 'boundary'],
        ['responsibility', 'owner'],
        ['dependency', 'ordering'],
        ['reason'],
        ['expected', 'result'],
        ['preserved'],
        ['failure', 'boundary'],
        ['proof', 'check'],
      ],
      issues,
    );
  });
  requireTerms(
    tools,
    AIDP_PLAN_HEADINGS[3],
    [['primary'], ['owner'], ['input'], ['fallback']],
    issues,
  );
  if (itemLines(verification).length < 1) {
    issues.push(
      'SYSTEMATIC VERIFICATION CHECKLIST must contain at least one check.',
    );
  }
  requireTerms(
    verification,
    AIDP_PLAN_HEADINGS[4],
    [
      ['objective'],
      ['variable', 'input'],
      ['workflow', 'result'],
      ['exclude', 'scope'],
      ['failure', 'stop'],
    ],
    issues,
  );
  requireTerms(
    output,
    AIDP_PLAN_HEADINGS[5],
    [
      ['label', 'labels'],
      ['order'],
      ['delimiter', 'format'],
      ['required'],
      ['omit', 'omission'],
    ],
    issues,
  );
  return headings;
};

const validDate = (value: string, label: string, issues: string[]): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    issues.push(`${label} must use YYYY-MM-DD.`);
    return;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
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
    keys.length !== REQUIRED_FRONTMATTER.length ||
    REQUIRED_FRONTMATTER.some((field) => !keys.includes(field))
  ) {
    issues.push(
      `Frontmatter must contain exactly: ${REQUIRED_FRONTMATTER.join(', ')}.`,
    );
  }
  const title = nonEmptyString(metadata.title, 'title', issues);
  const repoSearchIndex = nonEmptyString(
    metadata.repo_search_index,
    'repo_search_index',
    issues,
  );
  const createdAt = nonEmptyString(metadata.created_at, 'created_at', issues);
  const updatedAt = nonEmptyString(metadata.updated_at, 'updated_at', issues);
  const status = nonEmptyString(metadata.status, 'status', issues);
  if (createdAt) {
    validDate(createdAt, 'created_at', issues);
  }
  if (updatedAt) {
    validDate(updatedAt, 'updated_at', issues);
  }
  if (
    status &&
    !/^(?:draft|pending|blocked|in-progress|completed?)$/iu.test(status)
  ) {
    issues.push(
      'status must be draft, pending, blocked, in-progress, complete, or completed.',
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

export const validateAidpPlan = (
  content: string,
  planPath?: string,
): AidpPlanValidationReceipt => {
  const issues: string[] = [];
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(content);
  } catch {
    throw new AidpPlanValidationError(['Plan frontmatter must be valid YAML.']);
  }

  const { repoSearchIndex, title } = validateFrontmatter(
    parsed,
    planPath,
    issues,
  );
  const headings = validateSections(parsed.content.trim(), issues);

  if (issues.length > 0) {
    throw new AidpPlanValidationError(issues);
  }
  return {
    headings,
    planPath: planPath ? resolve(planPath) : undefined,
    repoSearchIndex,
    status: 'valid',
    title,
  };
};

export const run = async (
  args: readonly string[],
  read: typeof readFile = readFile,
  checkStat: typeof stat = stat,
  write: (message: string) => void = console.log,
): Promise<AidpPlanValidationReceipt> => {
  if (args.length !== 1 || !args[0]?.startsWith('/')) {
    throw new Error(usage());
  }
  const planPath = resolve(args[0]);
  const metadata = await checkStat(planPath);
  if (!metadata.isFile()) {
    throw new Error(`Plan path is not a regular file: ${planPath}`);
  }
  const receipt = validateAidpPlan(await read(planPath, 'utf8'), planPath);
  write(JSON.stringify(receipt, null, 2));
  return receipt;
};

export const runWhenMain = runCliWhenMain;

await runWhenMainWithHelp(import.meta.main, Bun.argv.slice(2), usage, run);
