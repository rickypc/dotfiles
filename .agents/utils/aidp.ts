import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import matter from 'gray-matter';

export interface AidpPlanInput {
  readonly cbmIndex: string;
  readonly constraints: readonly string[];
  readonly coreDirectives: readonly string[];
  readonly createdAt: string;
  readonly executionSteps: readonly string[];
  readonly inputsToProcess: readonly string[];
  readonly objective: string;
  readonly role: string;
  readonly status: string;
  readonly summary: string;
  readonly updatedAt: string;
}

export interface AidpProjectContext {
  readonly agentsRoot: string;
  readonly cbmIndex: string;
  readonly projectRoot: string;
}

const REQUIRED_FIELDS = [
  'title',
  'cbm_index',
  'created_at',
  'updated_at',
  'status',
] as const;

const assertNonEmpty = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} cannot be empty; clarification is required.`);
  }
  if (
    /\[(?:the |a |brief |specific |high-level |core |guardrails |specific file)/iu.test(
      normalized,
    )
  ) {
    throw new Error(`${label} still contains a template placeholder.`);
  }
  return normalized;
};

const assertList = (
  values: readonly string[],
  label: string,
): readonly string[] => {
  if (values.length === 0) {
    throw new Error(`${label} requires at least one explicit item.`);
  }
  return values.map((value, index) =>
    assertNonEmpty(value, `${label} item ${index + 1}`),
  );
};

export const derivePlanSummary = (
  request: string,
  projectRoot: string,
): string => {
  const normalized = assertNonEmpty(request, 'Plan request')
    .split(/\r?\n/u)[0]
    .replace(/^[#>*\-\s]+/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const projectName = basename(resolve(projectRoot));
  const words = normalized.split(' ').slice(0, 14).join(' ');
  const summary = words || `Plan for ${projectName}`;
  return summary.slice(0, 120).trim();
};

const listSection = (values: readonly string[]): string =>
  values.map((value) => `- ${value}`).join('\n');

export const relativePlanPathFor = (
  projectRoot: string,
  absolutePlanPath: string,
): string => {
  const root = resolve(projectRoot);
  const path = resolve(absolutePlanPath);
  const relativePath = relative(root, path);
  const normalized = relativePath.replaceAll('\\', '/');
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath) ||
    !normalized.startsWith('.agents/plans/')
  ) {
    throw new Error('Plan path must stay inside .agents/plans/.');
  }
  return normalized;
};

export const renderPlanHandoff = (
  projectRoot: string,
  absolutePlanPath: string,
): string => {
  const relativePath = relativePlanPathFor(projectRoot, absolutePlanPath);
  const filename = basename(resolve(absolutePlanPath));
  return `[${filename}](${resolve(absolutePlanPath)})\n\n\`\`\`plaintext\n/aidx ${relativePath}\n\`\`\``;
};

const replaceSection = (
  body: string,
  heading: string,
  nextHeading: string | undefined,
  value: string,
): string => {
  const end = nextHeading ? `(?=^# ${nextHeading}\\n)` : '$';
  const pattern = new RegExp(`^# ${heading}\\n[\\s\\S]*?${end}`, 'mu');
  if (!pattern.test(body)) {
    throw new Error(`Template section is missing: ${heading}.`);
  }
  return body.replace(pattern, `# ${heading}\n${value}\n`);
};

export const resolveProjectRoot = (
  invocationRoot: string,
  explicitProjectRoot?: string,
): string => resolve(explicitProjectRoot ?? invocationRoot);

const safeSegment = (value: string, label: string): string => {
  const normalized = assertNonEmpty(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(normalized)) {
    throw new Error(`${label} must be one relative path segment.`);
  }
  return normalized;
};

export const cbmIndexForProject = (
  projectRoot: string,
  temporaryRoot?: string,
): string => {
  const normalizedRoot = resolve(projectRoot).replaceAll('\\', '/');
  if (temporaryRoot) {
    const normalizedTemporaryRoot = resolve(temporaryRoot).replaceAll(
      '\\',
      '/',
    );
    if (
      normalizedRoot === normalizedTemporaryRoot ||
      normalizedRoot.startsWith(`${normalizedTemporaryRoot}/`)
    ) {
      throw new Error(
        'Project root cannot be an operating-system temporary path.',
      );
    }
  }
  const index = normalizedRoot
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9]+/gu, '-'))
    .filter(Boolean)
    .join('-');
  return safeSegment(index, 'CBM index');
};

export const slugifyPlanSummary = (summary: string): string => {
  const slug = assertNonEmpty(summary, 'Plan summary')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
  if (!slug) {
    throw new Error('Plan summary must contain letters or numbers.');
  }
  return slug;
};

export const planPathFor = (
  projectRoot: string,
  cbmIndex: string,
  summary: string,
): string =>
  join(
    resolve(projectRoot),
    '.agents',
    'plans',
    safeSegment(cbmIndex, 'CBM index'),
    `${slugifyPlanSummary(summary)}.md`,
  );

const stepsSection = (values: readonly string[]): string =>
  values.map((value, index) => `${index + 1}. ${value}`).join('\n');

export const renderAidpPlan = (
  template: string,
  input: AidpPlanInput,
): string => {
  const parsedTemplate = matter(template);
  const body = PLAN_HEADINGS.reduce((current, heading, index) => {
    const values: Record<(typeof PLAN_HEADINGS)[number], string> = {
      CONSTRAINTS: listSection(assertList(input.constraints, 'CONSTRAINTS')),
      'CORE DIRECTIVES': listSection(
        assertList(input.coreDirectives, 'CORE DIRECTIVES'),
      ),
      'EXECUTION STEPS': stepsSection(
        assertList(input.executionSteps, 'EXECUTION STEPS').map(
          (step, stepIndex) => {
            if (step.length < 24) {
              throw new Error(
                `EXECUTION STEPS item ${stepIndex + 1} must be granular and technically precise.`,
              );
            }
            return step;
          },
        ),
      ),
      'INPUTS TO PROCESS': listSection(
        assertList(input.inputsToProcess, 'INPUTS TO PROCESS'),
      ),
      OBJECTIVE: assertNonEmpty(input.objective, 'OBJECTIVE'),
      ROLE: assertNonEmpty(input.role, 'ROLE'),
    };
    return replaceSection(
      current,
      heading,
      PLAN_HEADINGS[index + 1],
      values[heading],
    );
  }, parsedTemplate.content.trim());
  return matter.stringify(`${body.trim()}\n`, {
    cbm_index: safeSegment(input.cbmIndex, 'CBM index'),
    created_at: assertNonEmpty(input.createdAt, 'created_at'),
    status: assertNonEmpty(input.status, 'status'),
    title: assertNonEmpty(input.summary, 'Plan summary'),
    updated_at: assertNonEmpty(input.updatedAt, 'updated_at'),
  });
};

const PLAN_HEADINGS = [
  'ROLE',
  'OBJECTIVE',
  'CORE DIRECTIVES',
  'EXECUTION STEPS',
  'CONSTRAINTS',
  'INPUTS TO PROCESS',
] as const;

export const validatePlanFrontmatter = (content: string): void => {
  const parsed = matter(content);
  const keys = Object.keys(parsed.data);
  if (
    keys.length !== REQUIRED_FIELDS.length ||
    REQUIRED_FIELDS.some((field) => !keys.includes(field))
  ) {
    throw new Error(
      'Plan frontmatter must contain exactly the required YAML fields.',
    );
  }
};
