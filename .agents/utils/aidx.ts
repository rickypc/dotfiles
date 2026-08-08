import matter from 'gray-matter';

export interface AidxCompletionReceipt {
  readonly importerReceipt: unknown;
  readonly planPath: string;
  readonly status: 'completed-with-knowledge-base-receipt';
  readonly title: string;
}

export interface AidxPlanDocument {
  readonly cbmIndex: string;
  readonly constraints: readonly string[];
  readonly coreDirectives: readonly string[];
  readonly createdAt: string;
  readonly executionSteps: readonly string[];
  readonly inputsToProcess: readonly string[];
  readonly objective: string;
  readonly role: string;
  readonly status: string;
  readonly title: string;
  readonly updatedAt: string;
}

export type AidxPlanImporter = (planPath: string) => Promise<unknown>;

export type AidxPlanRemover = (planPath: string) => Promise<void>;

export const assertPlanPathForIndex = (
  relativePath: string,
  cbmIndex: string,
): void => {
  const expectedPrefix = `.agents/plans/${cbmIndex}/`;
  if (!relativePath.startsWith(expectedPrefix)) {
    throw new Error(
      `AIDX plan path must use the selected CBM index: ${cbmIndex}.`,
    );
  }
};

const PLAN_HEADINGS = [
  'ROLE',
  'OBJECTIVE',
  'CORE DIRECTIVES',
  'EXECUTION STEPS',
  'CONSTRAINTS',
  'INPUTS TO PROCESS',
] as const;

const assertCompleted = (value: string, heading: string): string => {
  if (/^\[.*\]$/u.test(value.trim())) {
    throw new Error(`Plan section contains an unfinished item: ${heading}.`);
  }
  if (/^(?:KEEP|TBD|TODO|PLACEHOLDER)$/u.test(value.trim())) {
    throw new Error(
      `Plan section contains interactive or unfinished text: ${heading}.`,
    );
  }
  return value;
};

const EXECUTION_STEP_FIELDS = [
  'Action',
  'Target or Boundary',
  'Change or Decision',
  'Dependency or Ordering',
  'Reason',
  'Acceptance or Proof',
  'Failure or Stop',
] as const;

export const completeAidxPlan = async (
  planPath: string,
  plan: AidxPlanDocument,
  importer: AidxPlanImporter,
  remover: AidxPlanRemover = async () => undefined,
): Promise<AidxCompletionReceipt> => ({
  importerReceipt: await (async () => {
    const importerReceipt = await importer(planPath);
    await remover(planPath);
    return importerReceipt;
  })(),
  planPath,
  status: 'completed-with-knowledge-base-receipt',
  title: plan.title,
});

const listItems = (value: string, heading: string): readonly string[] => {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const items = lines.map((line) =>
    line.replace(/^(?:[-*]|\d+\.)\s+/u, '').trim(),
  );
  if (items.some((item) => !item || /^\[.*\]$/u.test(item))) {
    throw new Error(`Plan section contains an unfinished item: ${heading}.`);
  }
  if (
    items.some((item) => /^(?:KEEP|TBD|TODO|PLACEHOLDER)$/u.test(item.trim()))
  ) {
    throw new Error(
      `Plan section contains interactive or unfinished text: ${heading}.`,
    );
  }
  const normalized = items.map((item) => item.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`Plan section contains duplicate items: ${heading}.`);
  }
  return items;
};

const requiredText = (data: Record<string, unknown>, key: string): string => {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Plan frontmatter field is required: ${key}.`);
  }
  return value.trim();
};

const section = (body: string, heading: string): string => {
  const headingIndex = PLAN_HEADINGS.indexOf(
    heading as (typeof PLAN_HEADINGS)[number],
  );
  const nextHeading = PLAN_HEADINGS[headingIndex + 1];
  const pattern = nextHeading
    ? new RegExp(`^# ${heading}\\n([\\s\\S]*?)(?=^# ${nextHeading}\\n)`, 'mu')
    : new RegExp(`^# ${heading}\\n([\\s\\S]*)$`, 'mu');
  const match = pattern.exec(body);
  if (!match?.[1]?.trim()) {
    throw new Error(`Plan section is required: ${heading}.`);
  }
  return match[1].trim();
};

const validateExecutionStep = (step: string): void => {
  const present = EXECUTION_STEP_FIELDS.filter((field) =>
    new RegExp(`${field}:\\s*\\S`, 'u').test(step),
  );
  if (present.length === 0) {
    return;
  }
  const missing = EXECUTION_STEP_FIELDS.filter(
    (field) => !present.includes(field),
  );
  if (missing.length > 0) {
    throw new Error(
      `AIDX execution step is missing contract field(s): ${missing.join(', ')}.`,
    );
  }
};

const validateFrontmatter = (
  data: Record<string, unknown>,
): AidxPlanDocument => {
  const allowed = new Set([
    'title',
    'cbm_index',
    'created_at',
    'updated_at',
    'status',
  ]);
  const unsupported = Object.keys(data).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new Error(
      `Plan frontmatter has unsupported field(s): ${unsupported.join(', ')}.`,
    );
  }
  return {
    cbmIndex: requiredText(data, 'cbm_index'),
    constraints: [],
    coreDirectives: [],
    createdAt: requiredText(data, 'created_at'),
    executionSteps: [],
    inputsToProcess: [],
    objective: '',
    role: '',
    status: requiredText(data, 'status'),
    title: requiredText(data, 'title'),
    updatedAt: requiredText(data, 'updated_at'),
  };
};

export const parseAidxPlan = (content: string): AidxPlanDocument => {
  if (!matter.test(content)) {
    throw new Error('AIDX plan YAML frontmatter is required.');
  }
  const parsed = matter(content);
  const metadata = validateFrontmatter(parsed.data as Record<string, unknown>);
  const body = parsed.content.trim();
  const headings = [...body.matchAll(/^# (.+)$/gmu)].map((match) => match[1]);
  if (headings.join('\n') !== PLAN_HEADINGS.join('\n')) {
    throw new Error(
      'AIDX plans must contain the six required sections in template order.',
    );
  }
  const role = assertCompleted(section(body, 'ROLE'), 'ROLE');
  const objective = assertCompleted(section(body, 'OBJECTIVE'), 'OBJECTIVE');
  const coreDirectives = listItems(
    section(body, 'CORE DIRECTIVES'),
    'CORE DIRECTIVES',
  );
  const executionSteps = listItems(
    section(body, 'EXECUTION STEPS'),
    'EXECUTION STEPS',
  );
  const constraints = listItems(section(body, 'CONSTRAINTS'), 'CONSTRAINTS');
  const inputsToProcess = listItems(
    section(body, 'INPUTS TO PROCESS'),
    'INPUTS TO PROCESS',
  );
  if (executionSteps.some((step) => step.length < 24)) {
    throw new Error(
      'AIDX execution steps must be granular and technically precise.',
    );
  }
  executionSteps.forEach(validateExecutionStep);
  return {
    ...metadata,
    constraints,
    coreDirectives,
    executionSteps,
    inputsToProcess,
    objective,
    role,
  };
};
