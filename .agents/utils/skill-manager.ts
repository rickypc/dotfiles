import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import matter from 'gray-matter';
import type {
  MatrixCase,
  MatrixEvidence,
} from './evidence-gated-workflow-controller/matrix.js';
import {
  casesFor,
  evaluateMatrix,
  validateMatrix,
} from './evidence-gated-workflow-controller/matrix.js';
import {
  type ActionPacket,
  createActionPacket,
  fingerprint,
} from './evidence-gated-workflow-controller/packet.js';
import type { EvidenceReceipt } from './evidence-gated-workflow-controller/receipt.js';
import {
  createReceipt,
  failedCheckNames,
  receiptPasses,
} from './evidence-gated-workflow-controller/receipt.js';
import type { WorkflowState } from './evidence-gated-workflow-controller/state.js';
import type { FileSystem } from './filesystem.js';

export interface SkillInitializationReceipt {
  readonly description: string;
  readonly name: string;
  readonly path: string;
  readonly status: 'created';
}

export interface SkillManagerBatchEvaluation {
  readonly phase: 'baseline' | 'candidate';
  readonly results: readonly SkillManagerBatchResult[];
}

export interface SkillManagerBatchResult {
  readonly candidate: EvidenceReceipt;
  readonly challenge?: EvidenceReceipt;
  readonly matrixPath: string;
  readonly repair?: ActionPacket;
  readonly targetSkillPath: string;
}

export interface SkillManagerBatchTarget {
  readonly matrix: readonly MatrixCase[];
  readonly matrixPath: string;
  readonly sourceText: string;
  readonly targetSkillPath: string;
}

export interface SkillManagerPacketInput {
  readonly failedAssertionIds: readonly string[];
  readonly reviewId: string;
  readonly state: WorkflowState;
  readonly targetSkillPath: string;
}

export interface SkillProseReviewFinding {
  readonly kind: 'missing-local-link' | 'out-of-scope-local-link';
  readonly sourcePath: string;
  readonly targetPath: string;
}

export interface SkillProseReviewReceipt {
  readonly checkedLocalLinkTargets: number;
  readonly findings: readonly SkillProseReviewFinding[];
  readonly ignoredPaths: readonly string[];
  readonly prosePaths: readonly string[];
  readonly reviewedRoots: readonly string[];
}

export interface SkillValidationReceipt {
  readonly description: string;
  readonly name: string;
  readonly path: string;
  readonly status: 'valid';
}

const actionTitleFor = (state: WorkflowState): string => {
  if (state === 'draft') {
    return 'Define and validate the skill quality matrix';
  }
  if (state === 'candidate_requested' || state === 'candidate_checked') {
    return 'Repair every compatible failed assertion in one candidate batch';
  }
  throw new Error(`No Skill Manager action packet is available for ${state}.`);
};

const agentsRootFor = (path: string): string | undefined => {
  const marker = '/.agents/';
  const index = path.indexOf(marker);
  if (index >= 0) {
    return path.slice(0, index + '/.agents'.length);
  }
  return path.endsWith('/.agents') ? path : undefined;
};

export const createSkillManagerPacket = (
  input: SkillManagerPacketInput,
): ActionPacket => {
  const assertionIds =
    input.state === 'draft' ? ['matrix-definition'] : input.failedAssertionIds;
  if (assertionIds.length === 0) {
    throw new Error(
      'At least one failed assertion is required for a candidate packet.',
    );
  }
  return createActionPacket({
    forbiddenActions: [
      'Change the frozen quality matrix.',
      'Edit paths outside the target skill.',
      'Claim completion without script-produced evidence.',
    ],
    intentId: input.reviewId,
    knownUserQuestions: [],
    nextPhase: input.state === 'draft' ? 'baseline' : 'evaluate',
    packetId: `${input.reviewId}-${input.state}`,
    requiredActionGroups: [
      {
        allowedPaths: [input.targetSkillPath],
        id: `${input.state}-action`,
        requiredAssertionIds: assertionIds,
        title: actionTitleFor(input.state),
      },
    ],
    state: input.state,
  });
};

export const evaluateSkillMatrix = (
  cases: readonly MatrixCase[],
  evidence: MatrixEvidence,
  sourceFingerprint: string,
  phase: 'baseline_recorded' | 'candidate_checked' | 'challenge_checked',
): EvidenceReceipt => {
  const visibility = phase === 'challenge_checked' ? 'challenge' : 'candidate';
  return createReceipt({
    checks: evaluateMatrix(casesFor(cases, visibility), evidence),
    sourceFingerprint,
    state: phase,
  });
};

const failedAssertionIdsFor = (receipt: EvidenceReceipt): string[] => [
  ...new Set(
    failedCheckNames(receipt).map((name) => name.split(':', 1)[0] ?? name),
  ),
];

const isExternalTarget = (target: string): boolean =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const skillNameFor = (skillPath: string): string => {
  const name = basename(resolve(skillPath));
  if (!skillNamePattern.test(name)) {
    throw new Error(
      'Skill directory names must use lowercase letters, digits, and hyphens.',
    );
  }
  return name;
};

const titleFor = (name: string): string =>
  name
    .split('-')
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ');

const skillSourceFor = (name: string, description: string): string => `---
name: ${name}
description: ${JSON.stringify(description)}
---

# ${titleFor(name)}

Use this skill only after its trigger is confirmed. State the normal path,
the owner of each delegated command or information source, and the proof that
closes the work. Keep detailed branch guidance in linked references.
`;

export const initializeSkill = async (
  fileSystem: Pick<FileSystem, 'mkdir' | 'readFile' | 'writeFile'>,
  skillPath: string,
  description: string,
): Promise<SkillInitializationReceipt> => {
  if (!skillPath.startsWith('/') || !description.trim()) {
    throw new Error(
      'Skill path must be absolute and description must be nonblank.',
    );
  }
  const path = resolve(skillPath);
  const name = skillNameFor(path);
  const skillFile = join(path, 'SKILL.md');
  if ((await readOptional(fileSystem, skillFile)) !== undefined) {
    throw new Error(`Skill already exists: ${skillFile}`);
  }
  await fileSystem.mkdir(path, { recursive: true });
  await fileSystem.writeFile(
    skillFile,
    skillSourceFor(name, description),
    'utf8',
  );
  return { description, name, path, status: 'created' };
};

export const validateSkill = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  skillPath: string,
): Promise<SkillValidationReceipt> => {
  if (!skillPath.startsWith('/')) {
    throw new Error('Skill path must be absolute.');
  }
  const path = resolve(skillPath);
  const name = skillNameFor(path);
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(await fileSystem.readFile(join(path, 'SKILL.md'), 'utf8'));
  } catch {
    throw new Error(
      `Skill SKILL.md frontmatter is invalid: ${join(path, 'SKILL.md')}`,
    );
  }
  if (
    typeof parsed.data.name !== 'string' ||
    parsed.data.name !== name ||
    typeof parsed.data.description !== 'string' ||
    !parsed.data.description.trim() ||
    !parsed.content.trim()
  ) {
    throw new Error(
      `Skill SKILL.md must contain valid name, description, and instructions: ${join(path, 'SKILL.md')}`,
    );
  }
  return {
    description: parsed.data.description,
    name,
    path,
    status: 'valid',
  };
};

const proseExtensions = new Set(['.md', '.txt', '.yaml', '.yml']);

const isProsePath = (path: string): boolean =>
  proseExtensions.has(extname(path));

const isWithin = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

export const localMarkdownLinkTargets = (source: string): readonly string[] => {
  const prose = source.replace(/```[\s\S]*?```/g, '');
  const targets: string[] = [];
  for (const match of prose.matchAll(
    /!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g,
  )) {
    targets.push(match[1] ?? match[2] ?? '');
  }
  for (const match of prose.matchAll(
    /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm,
  )) {
    targets.push(match[1] ?? match[2] ?? '');
  }
  return targets.filter(Boolean);
};

export const parseMatrixJsonl = (content: string): MatrixCase[] => {
  const lines = content.split('\n').filter((line) => line.trim());
  const cases = lines.map((line, index) => {
    try {
      return JSON.parse(line) as MatrixCase;
    } catch {
      throw new Error(`Matrix line ${index + 1} is not valid JSON.`);
    }
  });
  validateMatrix(cases);
  return cases;
};

const patternMatches = (pattern: string, candidate: string): boolean => {
  const directoryPattern = pattern.endsWith('/');
  const core = directoryPattern ? pattern.slice(0, -1) : pattern;
  const escaped = core
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replaceAll('**', '<<<double-star>>>')
    .replaceAll('*', '[^/]*')
    .replaceAll('<<<double-star>>>', '.*');
  return new RegExp(`^${escaped}${directoryPattern ? '(?:/.*)?' : '$'}`).test(
    candidate,
  );
};

export const ignoredByAgentsGitignore = (
  agentsRoot: string,
  path: string,
  gitignore: string,
): boolean => {
  const candidate = relative(agentsRoot, path).replaceAll('\\', '/');
  let ignored = false;
  for (const rawLine of gitignore.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const negated = line.startsWith('!');
    const pattern = (negated ? line.slice(1) : line).replace(/^\//, '');
    if (pattern && patternMatches(pattern, candidate)) {
      ignored = !negated;
    }
  }
  return ignored;
};

const readOptional = async (
  fileSystem: Pick<FileSystem, 'readFile'>,
  path: string,
): Promise<string | undefined> => {
  try {
    return await fileSystem.readFile(path, 'utf8');
  } catch {
    return undefined;
  }
};

const proseReview = {
  collect: async (
    fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
    readdir: NonNullable<FileSystem['readdir']>,
    path: string,
    gitignores: ReadonlyMap<string, string>,
    ignoredPaths: Set<string>,
    prosePaths: Set<string>,
  ): Promise<void> => {
    const agentsRoot = agentsRootFor(path);
    const gitignore = agentsRoot ? gitignores.get(agentsRoot) : undefined;
    if (
      agentsRoot &&
      gitignore &&
      ignoredByAgentsGitignore(agentsRoot, path, gitignore)
    ) {
      ignoredPaths.add(path);
      return;
    }
    if (isProsePath(path)) {
      if ((await readOptional(fileSystem, path)) !== undefined) {
        prosePaths.add(path);
      }
      return;
    }
    if (extname(path)) {
      return;
    }
    const entries = await readdir(path, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const child = join(path, entry.name);
        if (entry.isDirectory() || isProsePath(child)) {
          await proseReview.collect(
            fileSystem,
            readdir,
            child,
            gitignores,
            ignoredPaths,
            prosePaths,
          );
        }
      }),
    );
  },
  findingFor: async (
    fileSystem: Pick<FileSystem, 'readFile'>,
    sourcePath: string,
    target: string,
    reviewedRoots: readonly string[],
  ): Promise<{
    readonly checked: boolean;
    readonly finding?: SkillProseReviewFinding;
  }> => {
    const targetWithoutAnchor = target.split('#', 1)[0] ?? '';
    if (!targetWithoutAnchor || isExternalTarget(targetWithoutAnchor)) {
      return { checked: false };
    }
    const targetPath = resolve(dirname(sourcePath), targetWithoutAnchor);
    if (!reviewedRoots.some((root) => isWithin(targetPath, root))) {
      return {
        checked: true,
        finding: { kind: 'out-of-scope-local-link', sourcePath, targetPath },
      };
    }
    const missing = (await readOptional(fileSystem, targetPath)) === undefined;
    return {
      checked: true,
      ...(missing
        ? { finding: { kind: 'missing-local-link', sourcePath, targetPath } }
        : {}),
    };
  },
  findings: async (
    fileSystem: Pick<FileSystem, 'readFile'>,
    prosePaths: ReadonlySet<string>,
    reviewedRoots: readonly string[],
  ): Promise<{
    readonly checkedLocalLinkTargets: number;
    readonly findings: readonly SkillProseReviewFinding[];
  }> => {
    const results = await Promise.all(
      [...prosePaths]
        .filter((sourcePath) => extname(sourcePath) === '.md')
        .map((sourcePath) =>
          proseReview.sourceFindings(fileSystem, sourcePath, reviewedRoots),
        ),
    );
    const linkResults = results.flat();
    return {
      checkedLocalLinkTargets: linkResults.filter(({ checked }) => checked)
        .length,
      findings: linkResults.flatMap(({ finding }) =>
        finding ? [finding] : [],
      ),
    };
  },
  sourceFindings: async (
    fileSystem: Pick<FileSystem, 'readFile'>,
    sourcePath: string,
    reviewedRoots: readonly string[],
  ) => {
    const source = await fileSystem.readFile(sourcePath, 'utf8');
    return Promise.all(
      localMarkdownLinkTargets(source).map((target) =>
        proseReview.findingFor(fileSystem, sourcePath, target, reviewedRoots),
      ),
    );
  },
};

const receiptFor = (
  target: SkillManagerBatchTarget,
  phase: 'baseline_recorded' | 'candidate_checked' | 'challenge_checked',
): EvidenceReceipt =>
  evaluateSkillMatrix(
    target.matrix,
    { delegatedChecks: {}, ownedFiles: new Set(), text: target.sourceText },
    fingerprint(target.sourceText),
    phase,
  );

const repairFor = (
  reviewId: string,
  target: SkillManagerBatchTarget,
  receipt: EvidenceReceipt,
): ActionPacket | undefined => {
  const failedAssertionIds = failedAssertionIdsFor(receipt);
  return failedAssertionIds.length === 0
    ? undefined
    : createSkillManagerPacket({
        failedAssertionIds,
        reviewId,
        state: 'candidate_requested',
        targetSkillPath: target.targetSkillPath,
      });
};

export const evaluateSkillManagerBatch = (
  reviewId: string,
  phase: 'baseline' | 'candidate',
  targets: readonly SkillManagerBatchTarget[],
): SkillManagerBatchEvaluation => {
  if (targets.length === 0) {
    throw new Error('At least one skill matrix and target pair is required.');
  }
  const candidates = targets.map((target) => ({
    candidate: receiptFor(
      target,
      phase === 'baseline' ? 'baseline_recorded' : 'candidate_checked',
    ),
    target,
  }));
  const allCandidatesPass = candidates.every(({ candidate }) =>
    receiptPasses(candidate),
  );
  return {
    phase,
    results: candidates.map(({ candidate, target }) => {
      const challenge =
        phase === 'candidate' &&
        allCandidatesPass &&
        target.matrix.some(({ visibility }) => visibility === 'challenge')
          ? receiptFor(target, 'challenge_checked')
          : undefined;
      const repair =
        phase === 'candidate'
          ? repairFor(reviewId, target, challenge ?? candidate)
          : undefined;
      return {
        candidate,
        ...(challenge ? { challenge } : {}),
        ...(repair ? { repair } : {}),
        matrixPath: target.matrixPath,
        targetSkillPath: target.targetSkillPath,
      };
    }),
  };
};

export const reviewSkillProse = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  roots: readonly string[],
): Promise<SkillProseReviewReceipt> => {
  if (roots.length === 0 || roots.some((root) => !root.startsWith('/'))) {
    throw new Error('Skill prose review requires at least one absolute root.');
  }
  const readdir = fileSystem.readdir;
  if (!readdir) {
    throw new Error('Skill prose review requires directory listing support.');
  }
  const reviewedRoots = [...new Set(roots.map((root) => resolve(root)))].sort();
  const gitignores = new Map<string, string>();
  for (const agentsRoot of new Set(reviewedRoots.map(agentsRootFor))) {
    if (!agentsRoot) {
      continue;
    }
    const content = await readOptional(
      fileSystem,
      join(agentsRoot, '.gitignore'),
    );
    if (content !== undefined) {
      gitignores.set(agentsRoot, content);
    }
  }
  const ignoredPaths = new Set<string>();
  const prosePaths = new Set<string>();
  await Promise.all(
    reviewedRoots.map((root) =>
      proseReview.collect(
        fileSystem,
        readdir,
        root,
        gitignores,
        ignoredPaths,
        prosePaths,
      ),
    ),
  );
  const linkReceipt = await proseReview.findings(
    fileSystem,
    prosePaths,
    reviewedRoots,
  );
  return {
    ...linkReceipt,
    findings: [...linkReceipt.findings].sort((left, right) =>
      `${left.sourcePath}:${left.targetPath}`.localeCompare(
        `${right.sourcePath}:${right.targetPath}`,
      ),
    ),
    ignoredPaths: [...ignoredPaths].sort(),
    prosePaths: [...prosePaths].sort(),
    reviewedRoots,
  };
};
