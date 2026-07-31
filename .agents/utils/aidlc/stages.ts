export type AidlcPhase =
  | 'initialization'
  | 'ideation'
  | 'inception'
  | 'construction'
  | 'operation'
  | 'closure';

export type AidlcRole =
  | 'architect'
  | 'delivery'
  | 'design'
  | 'developer'
  | 'operations'
  | 'product'
  | 'quality'
  | 'security';

export type AidlcSensor =
  | 'approval-gate'
  | 'context-snapshot'
  | 'intent-evidence'
  | 'validation-evidence';

export interface AidlcStageDefinition {
  readonly condition: string;
  readonly gate: boolean;
  readonly name: string;
  readonly number: string;
  readonly phase: AidlcPhase;
  readonly slug: string;
}

export interface AidlcStageRecord {
  readonly evidence?: string;
  readonly slug: AidlcStageSlug;
  readonly status: AidlcStageStatus;
}

export type AidlcStageSlug = (typeof universalCodeChangeStages)[number]['slug'];

export type AidlcStageStatus =
  | 'active'
  | 'awaiting-approval'
  | 'completed'
  | 'skipped'
  | 'pending';

// Central immutable route contract for the universal AIDLC conductor.
// These selected identifiers, names, phase names, and ordering are intentionally
// aligned with AI-DLC v2. Conditions are deterministic single-intent adaptations
// of the upstream stage contracts. Knowledge Distillation is a local extension:
// the upstream workflow has no persistent private-KB lifecycle.
export const universalCodeChangeStages: readonly AidlcStageDefinition[] = [
  {
    condition: 'Ensure the single private intent record exists.',
    gate: false,
    name: 'Workspace Scaffold',
    number: '0.1',
    phase: 'initialization',
    slug: 'workspace-scaffold',
  },
  {
    condition: 'Scan and classify the selected workspace.',
    gate: false,
    name: 'Workspace Detection',
    number: '0.2',
    phase: 'initialization',
    slug: 'workspace-detection',
  },
  {
    condition: 'Initialize the stage route from workspace evidence.',
    gate: false,
    name: 'State Initialization',
    number: '0.3',
    phase: 'initialization',
    slug: 'state-init',
  },
  {
    condition: 'Capture the requested outcome, constraints, and unknowns.',
    gate: false,
    name: 'Intent Capture & Framing',
    number: '1.1',
    phase: 'ideation',
    slug: 'intent-capture',
  },
  {
    condition:
      'Execute only for external positioning, source research, or build-vs-buy; otherwise record why it is not applicable.',
    gate: false,
    name: 'Market Research',
    number: '1.2',
    phase: 'ideation',
    slug: 'market-research',
  },
  {
    condition:
      'Execute for integrations, regulation, material risk, or technical uncertainty; otherwise record why it is not applicable.',
    gate: false,
    name: 'Feasibility & Constraints',
    number: '1.3',
    phase: 'ideation',
    slug: 'feasibility',
  },
  {
    condition:
      'Define the in-scope boundary, exclusions, and success criteria.',
    gate: false,
    name: 'Scope Definition',
    number: '1.4',
    phase: 'ideation',
    slug: 'scope-definition',
  },
  {
    condition:
      'Execute when a user-facing UI needs exploration; for API or browser interaction work, record the applicable interaction diagram or skip reason.',
    gate: false,
    name: 'Rough Mockups',
    number: '1.6',
    phase: 'ideation',
    slug: 'rough-mockups',
  },
  {
    condition: 'Compile the approved intent and implementation plan.',
    gate: true,
    name: 'Approval & Handoff',
    number: '1.7',
    phase: 'ideation',
    slug: 'approval-handoff',
  },
  {
    condition:
      'Execute for an existing codebase; skip only for a verified greenfield workspace.',
    gate: false,
    name: 'Reverse Engineering',
    number: '2.1',
    phase: 'inception',
    slug: 'reverse-engineering',
  },
  {
    condition:
      'Execute when project practices are absent, stale, or relevant to the change; otherwise record the fresh evidence used.',
    gate: false,
    name: 'Practices Discovery',
    number: '2.2',
    phase: 'inception',
    slug: 'practices-discovery',
  },
  {
    condition:
      'Turn the approved request and evidence into testable requirements.',
    gate: false,
    name: 'Requirements Analysis',
    number: '2.3',
    phase: 'inception',
    slug: 'requirements-analysis',
  },
  {
    condition:
      'Execute for user-facing behavior, multiple personas, complex business logic, or cross-team work; otherwise record the alternative coverage.',
    gate: false,
    name: 'User Stories',
    number: '2.4',
    phase: 'inception',
    slug: 'user-stories',
  },
  {
    condition:
      'Execute when user-facing UI or an interaction diagram needs refinement; otherwise record why it is not applicable.',
    gate: false,
    name: 'Refined Mockups',
    number: '2.5',
    phase: 'inception',
    slug: 'refined-mockups',
  },
  {
    condition:
      'Execute for new component, service, API, or browser/CLI boundary design; otherwise record why the existing design is sufficient.',
    gate: false,
    name: 'Application Design',
    number: '2.6',
    phase: 'inception',
    slug: 'application-design',
  },
  {
    condition:
      'Execute for multiple dependent implementation units; otherwise record the single-unit plan.',
    gate: false,
    name: 'Units Generation',
    number: '2.7',
    phase: 'inception',
    slug: 'units-generation',
  },
  {
    condition:
      'Execute when units generation ran or build order, dependencies, or risk sequencing need an explicit plan; otherwise record the direct build plan.',
    gate: false,
    name: 'Delivery Planning',
    number: '2.8',
    phase: 'inception',
    slug: 'delivery-planning',
  },
  {
    condition:
      'Execute for new data models, complex business rules, or non-trivial logic; otherwise record why requirements are sufficient.',
    gate: false,
    name: 'Functional Design',
    number: '3.1',
    phase: 'construction',
    slug: 'functional-design',
  },
  {
    condition:
      'Execute for performance, security, scalability, reliability, or technology-selection requirements; otherwise record why it is not applicable.',
    gate: false,
    name: 'NFR Requirements',
    number: '3.2',
    phase: 'construction',
    slug: 'nfr-requirements',
  },
  {
    condition:
      'Execute only when NFR Requirements ran and concrete NFR patterns require design.',
    gate: false,
    name: 'NFR Design',
    number: '3.3',
    phase: 'construction',
    slug: 'nfr-design',
  },
  {
    condition:
      'Execute for infrastructure, deployment architecture, or cloud-resource changes; otherwise record why it is not applicable.',
    gate: false,
    name: 'Infrastructure Design',
    number: '3.4',
    phase: 'construction',
    slug: 'infrastructure-design',
  },
  {
    condition: 'Implement only the approved scope and its required tests.',
    gate: false,
    name: 'Code Generation',
    number: '3.5',
    phase: 'construction',
    slug: 'code-generation',
  },
  {
    condition:
      'Run and repair required build, behavior, coverage, lint, and type checks.',
    gate: false,
    name: 'Build and Test',
    number: '3.6',
    phase: 'construction',
    slug: 'build-and-test',
  },
  {
    condition:
      'Execute only when the request changes CI or the existing pipeline is inadequate for the new verification contract.',
    gate: false,
    name: 'CI Pipeline',
    number: '3.7',
    phase: 'construction',
    slug: 'ci-pipeline',
  },
  {
    condition:
      'Capture approved durable knowledge, then validate and distill it.',
    gate: false,
    name: 'Knowledge Distillation',
    number: 'local.1',
    phase: 'closure',
    slug: 'knowledge-distillation',
  },
];

export const initialAidlcRoute = (): AidlcStageRecord[] =>
  universalCodeChangeStages.map((stage, index) => ({
    slug: stage.slug,
    status: index === 0 ? 'active' : 'pending',
  }));

export const nextAidlcRouteStage = (
  route: readonly AidlcStageRecord[],
  current: AidlcStageSlug,
): AidlcStageSlug | undefined => {
  const index = route.findIndex((item) => item.slug === current);
  if (index < 0)
    throw new Error(`Stage is not in this AIDLC route: ${current}.`);
  return route[index + 1]?.slug;
};

export const stageDefinitionFor = (
  slug: AidlcStageSlug,
): AidlcStageDefinition => {
  const stage = universalCodeChangeStages.find((item) => item.slug === slug);
  if (!stage) throw new Error(`Unknown AIDLC stage: ${slug}.`);
  return stage;
};

const rolesByStage: Readonly<Record<AidlcStageSlug, readonly AidlcRole[]>> = {
  'application-design': ['architect', 'design'],
  'approval-handoff': ['delivery', 'product'],
  'build-and-test': ['quality', 'security'],
  'ci-pipeline': ['delivery', 'quality'],
  'code-generation': ['developer'],
  'delivery-planning': ['delivery', 'architect'],
  feasibility: ['architect', 'security'],
  'functional-design': ['architect', 'developer'],
  'infrastructure-design': ['architect', 'security'],
  'intent-capture': ['product', 'architect'],
  'knowledge-distillation': ['delivery'],
  'market-research': ['product'],
  'nfr-design': ['architect', 'security'],
  'nfr-requirements': ['architect', 'quality', 'security'],
  'practices-discovery': ['developer', 'quality', 'security'],
  'refined-mockups': ['design', 'product'],
  'requirements-analysis': ['product'],
  'reverse-engineering': ['developer', 'architect'],
  'rough-mockups': ['design', 'product'],
  'scope-definition': ['product', 'delivery'],
  'state-init': ['delivery'],
  'units-generation': ['architect', 'delivery'],
  'user-stories': ['product', 'design', 'developer', 'quality'],
  'workspace-detection': ['developer'],
  'workspace-scaffold': ['delivery'],
};

export const rolePromptPathFor = (
  agentsRoot: string,
  role: AidlcRole,
): string => `${agentsRoot.replace(/\/$/u, '')}/agents/aidlc/${role}.md`;

export const rolesForStage = (slug: AidlcStageSlug): readonly AidlcRole[] =>
  rolesByStage[slug];

export const sensorPromptPathFor = (
  agentsRoot: string,
  sensor: AidlcSensor,
): string =>
  `${agentsRoot.replace(/\/$/u, '')}/prompts/aidlc/sensors/${sensor}.md`;

export const sensorsForStage = (
  slug: AidlcStageSlug,
): readonly AidlcSensor[] => {
  const sensors: AidlcSensor[] = ['intent-evidence'];
  if (slug === 'practices-discovery') sensors.push('context-snapshot');
  if (slug === 'approval-handoff') sensors.push('approval-gate');
  if (slug === 'build-and-test') sensors.push('validation-evidence');
  return sensors;
};

export const stagePromptPathFor = (
  agentsRoot: string,
  slug: AidlcStageSlug,
): string => {
  const stage = stageDefinitionFor(slug);
  return `${agentsRoot.replace(/\/$/u, '')}/prompts/aidlc/stages/${stage.phase}/${slug}.md`;
};
