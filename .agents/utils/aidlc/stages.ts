export type AidlcPhase =
  | 'initialization'
  | 'ideation'
  | 'inception'
  | 'construction';

export type AidlcRole =
  | 'architect'
  | 'delivery'
  | 'design'
  | 'developer'
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

// The global route intentionally keeps only the four phases and stages that
// reduce planning ambiguity before implementation. Persistent KB capture is
// Construction closeout after 3.6, never a synthetic Closure phase or stage.
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
    condition:
      'Classify the selected workspace and its project-owned final gate.',
    gate: false,
    name: 'Workspace Detection',
    number: '0.2',
    phase: 'initialization',
    slug: 'workspace-detection',
  },
  {
    condition: 'Initialize the selected route from workspace evidence.',
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
      'Use only when integrations, regulation, or material technical uncertainty require it.',
    gate: false,
    name: 'Feasibility & Constraints',
    number: '1.3',
    phase: 'ideation',
    slug: 'feasibility',
  },
  {
    condition:
      'Define the in-scope boundary, exclusions, acceptance criteria, and final gate.',
    gate: false,
    name: 'Scope Definition',
    number: '1.4',
    phase: 'ideation',
    slug: 'scope-definition',
  },
  {
    condition:
      'Compile the approved intent and implementation plan for explicit user approval.',
    gate: true,
    name: 'Approval & Handoff',
    number: '1.7',
    phase: 'ideation',
    slug: 'approval-handoff',
  },
  {
    condition:
      'For brownfield work, discover current code through codebase-memory and resolve durable context through knowledge-base.',
    gate: false,
    name: 'Reverse Engineering',
    number: '2.1',
    phase: 'inception',
    slug: 'reverse-engineering',
  },
  {
    condition:
      'Turn the approved request and verified context into testable requirements.',
    gate: false,
    name: 'Requirements Analysis',
    number: '2.3',
    phase: 'inception',
    slug: 'requirements-analysis',
  },
  {
    condition:
      'Use only for user-facing UI; define the UI once from requirements, existing UI, and supplied visual references.',
    gate: false,
    name: 'Refined Mockups',
    number: '2.5',
    phase: 'inception',
    slug: 'refined-mockups',
  },
  {
    condition:
      'Design the implementation approach and owning boundaries before units are generated.',
    gate: false,
    name: 'Application Design',
    number: '2.6',
    phase: 'inception',
    slug: 'application-design',
  },
  {
    condition: 'Produce the implementation-unit dependency plan.',
    gate: false,
    name: 'Units Generation',
    number: '2.7',
    phase: 'inception',
    slug: 'units-generation',
  },
  {
    condition: 'Produce the construction sequence, risks, and validation plan.',
    gate: false,
    name: 'Delivery Planning',
    number: '2.8',
    phase: 'inception',
    slug: 'delivery-planning',
  },
  {
    condition:
      'Use when new data models, complex business logic, or business rules need a design.',
    gate: false,
    name: 'Functional Design',
    number: '3.1',
    phase: 'construction',
    slug: 'functional-design',
  },
  {
    condition:
      'Use when performance, security, scalability, reliability, or stack constraints need explicit requirements.',
    gate: false,
    name: 'NFR Requirements',
    number: '3.2',
    phase: 'construction',
    slug: 'nfr-requirements',
  },
  {
    condition:
      'Use only when NFR Requirements ran and concrete patterns must be designed.',
    gate: false,
    name: 'NFR Design',
    number: '3.3',
    phase: 'construction',
    slug: 'nfr-design',
  },
  {
    condition: 'Implement only approved units and their required tests.',
    gate: false,
    name: 'Code Generation',
    number: '3.5',
    phase: 'construction',
    slug: 'code-generation',
  },
  {
    condition:
      'Run the single configured project final gate; repair every failure and rerun it until it passes.',
    gate: false,
    name: 'Build and Test',
    number: '3.6',
    phase: 'construction',
    slug: 'build-and-test',
  },
];

export const initialAidlcRoute = (uiRequired = true): AidlcStageRecord[] =>
  universalCodeChangeStages.map((stage, index) => {
    if (stage.slug === 'refined-mockups' && !uiRequired) {
      return {
        evidence: 'Not applicable: intent declares no user-facing UI.',
        slug: stage.slug,
        status: 'skipped',
      };
    }
    return {
      slug: stage.slug,
      status: index === 0 ? 'active' : 'pending',
    };
  });

export const nextAidlcRouteStage = (
  route: readonly AidlcStageRecord[],
  current: AidlcStageSlug,
): AidlcStageSlug | undefined => {
  const index = route.findIndex((item) => item.slug === current);
  if (index < 0) {
    throw new Error(`Stage is not in this AIDLC route: ${current}.`);
  }
  return route[index + 1]?.slug;
};

export const stageDefinitionFor = (
  slug: AidlcStageSlug,
): AidlcStageDefinition => {
  const stage = universalCodeChangeStages.find((item) => item.slug === slug);
  if (!stage) {
    throw new Error(`Unknown AIDLC stage: ${slug}.`);
  }
  return stage;
};

const rolesByStage: Readonly<Record<AidlcStageSlug, readonly AidlcRole[]>> = {
  'application-design': ['architect', 'design'],
  'approval-handoff': ['delivery', 'product'],
  'build-and-test': ['quality', 'security'],
  'code-generation': ['developer'],
  'delivery-planning': ['delivery', 'architect'],
  feasibility: ['architect', 'security'],
  'functional-design': ['architect', 'developer'],
  'intent-capture': ['product', 'architect'],
  'nfr-design': ['architect', 'security'],
  'nfr-requirements': ['architect', 'quality', 'security'],
  'refined-mockups': ['design', 'product'],
  'requirements-analysis': ['product'],
  'reverse-engineering': ['developer', 'architect'],
  'scope-definition': ['product', 'delivery'],
  'state-init': ['delivery'],
  'units-generation': ['architect', 'delivery'],
  'workspace-detection': ['developer'],
  'workspace-scaffold': ['delivery'],
};

export const rolePromptPathFor = (
  agentsRoot: string,
  role: AidlcRole,
): string => `${agentsRoot.replace(/\/$/u, '')}/aidlc/roles/${role}.md`;

export const rolesForStage = (slug: AidlcStageSlug): readonly AidlcRole[] =>
  rolesByStage[slug];

// Knowledge is selected by the active stage, not expanded from every assigned
// role. This keeps the packet's declared reading set small and deterministic
// while retaining the complete knowledge library for its owning stage.
const knowledgeFilesByStage: Readonly<
  Record<AidlcStageSlug, readonly string[]>
> = {
  'application-design': [
    'languages/common.md',
    'languages/profiles.md',
    'shared/brownfield.md',
    'shared/command-catalog.md',
    'shared/software-engineering-work-packets.md',
    'roles/architect/adr-template.md',
    'roles/architect/architecture-patterns.md',
  ],
  'approval-handoff': [
    'shared/verification.md',
    'roles/delivery/workflow-planning-guide.md',
  ],
  'build-and-test': [
    'shared/verification.md',
    'shared/software-engineering-work-packets.md',
    'roles/quality/testing-guide.md',
    'roles/quality/nfr-validation-methods.md',
  ],
  'code-generation': [
    'languages/common.md',
    'languages/profiles.md',
    'shared/software-engineering-work-packets.md',
    'roles/developer/code-generation-guide.md',
    'roles/developer/code-generation-patterns.md',
    'roles/developer/re-artifacts.md',
  ],
  'delivery-planning': [
    'shared/command-catalog.md',
    'shared/software-engineering-work-packets.md',
    'shared/verification.md',
    'roles/delivery/team-topologies.md',
    'roles/delivery/workflow-planning-guide.md',
  ],
  feasibility: [
    'shared/brownfield.md',
    'shared/rules-reading.md',
    'roles/architect/architecture-guide.md',
    'roles/architect/architecture-patterns.md',
    'roles/security/security-guide.md',
  ],
  'functional-design': [
    'roles/architect/ddd-patterns.md',
    'roles/developer/api-design-guide.md',
    'roles/developer/data-modelling-patterns.md',
    'roles/product/functional-design-guide.md',
  ],
  'intent-capture': [
    'shared/ai-dlc-principles.md',
    'shared/rules-reading.md',
    'roles/product/market-research-methods.md',
    'roles/product/product-guide.md',
    'roles/product/requirements-elicitation.md',
  ],
  'nfr-design': [
    'roles/architect/nfr-design-guide.md',
    'roles/architect/nfr-design-patterns.md',
    'roles/quality/nfr-reliability-guide.md',
    'roles/security/devsecops-pipeline-patterns.md',
  ],
  'nfr-requirements': [
    'shared/verification.md',
    'roles/quality/test-strategy-patterns.md',
    'roles/security/nfr-requirements-guide.md',
    'roles/security/threat-modelling-stride.md',
  ],
  'refined-mockups': [
    'roles/design/accessibility-wcag.md',
    'roles/design/component-spec-template.md',
    'roles/design/interaction-design-patterns.md',
    'roles/design/ux-guide.md',
    'roles/design/wireframing-guide.md',
  ],
  'requirements-analysis': [
    'languages/common.md',
    'languages/profiles.md',
    'shared/verification.md',
    'shared/software-engineering-work-packets.md',
    'roles/product/requirements-guide.md',
    'roles/product/user-story-patterns.md',
  ],
  'reverse-engineering': [
    'shared/brownfield.md',
    'shared/rules-reading.md',
    'shared/software-engineering-work-packets.md',
    'roles/architect/architecture-guide.md',
    'roles/developer/code-analysis-guide.md',
  ],
  'scope-definition': [
    'shared/ai-dlc-principles.md',
    'shared/verification.md',
    'roles/delivery/mob-programming-guide.md',
    'roles/product/prioritization-frameworks.md',
    'roles/product/requirements-guide.md',
  ],
  'state-init': [],
  'units-generation': [
    'languages/common.md',
    'languages/profiles.md',
    'shared/command-catalog.md',
    'shared/verification.md',
    'shared/software-engineering-work-packets.md',
    'roles/architect/architecture-guide.md',
    'roles/delivery/workflow-planning-guide.md',
  ],
  'workspace-detection': [],
  'workspace-scaffold': [],
};

export const knowledgePathsForStage = (
  agentsRoot: string,
  slug: AidlcStageSlug,
): readonly string[] => {
  const root = agentsRoot.replace(/\/$/u, '');
  return knowledgeFilesByStage[slug].map(
    (file) => `${root}/aidlc/knowledge/${file}`,
  );
};

export const sensorPromptPathFor = (
  agentsRoot: string,
  sensor: AidlcSensor,
): string =>
  `${agentsRoot.replace(/\/$/u, '')}/aidlc/prompts/sensors/${sensor}.md`;

export const sensorsForStage = (
  slug: AidlcStageSlug,
): readonly AidlcSensor[] => {
  const sensors: AidlcSensor[] = ['intent-evidence'];
  if (slug === 'reverse-engineering') {
    sensors.push('context-snapshot');
  }
  if (slug === 'approval-handoff') {
    sensors.push('approval-gate');
  }
  if (slug === 'build-and-test') {
    sensors.push('validation-evidence');
  }
  return sensors;
};

export const stagePromptPathFor = (
  agentsRoot: string,
  slug: AidlcStageSlug,
): string => {
  const stage = stageDefinitionFor(slug);
  return `${agentsRoot.replace(/\/$/u, '')}/aidlc/prompts/stages/${stage.phase}/${slug}.md`;
};
