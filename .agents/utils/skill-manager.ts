import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import matter from 'gray-matter';
import type { FileSystem } from './filesystem.js';
import type { MatrixCase, MatrixEvidence } from './quality-engine/matrix.js';
import {
  casesFor,
  evaluateMatrix,
  validateMatrix,
} from './quality-engine/matrix.js';
import {
  type ActionPacket,
  createActionPacket,
  fingerprint,
} from './quality-engine/packet.js';
import type { EvidenceReceipt } from './quality-engine/receipt.js';
import {
  createReceipt,
  failedCheckNames,
  receiptPasses,
} from './quality-engine/receipt.js';
import type { WorkflowState } from './quality-engine/state.js';
import {
  isMatrixVerifierId,
  runIndependentVerifier,
} from './quality-engine/verifier.js';

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

export interface SkillRubricContract {
  readonly minimumPassRate: number;
  readonly requiredCaseFields: readonly string[];
  readonly requiredVisibility: readonly string[];
  readonly schemaVersion: number;
  readonly verifierIds: readonly string[];
}

export interface SkillSuiteValidationReceipt {
  readonly matrixCount: number;
  readonly prose: SkillProseReviewReceipt;
  readonly skillCount: number;
  readonly status: 'valid';
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
  const selectedCases = casesFor(cases, visibility);
  return createReceipt({
    checks: [
      ...evaluateMatrix(selectedCases, evidence),
      ...selectedCases.map((matrixCase) =>
        runIndependentVerifier(matrixCase, evidence),
      ),
    ],
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

const expectedRubricFields = new Set([
  'assertions',
  'failureMode',
  'id',
  'independentVerifier',
  'repairBoundary',
  'scenario',
  'visibility',
]);

export const parseSkillRubric = (content: string): SkillRubricContract => {
  const parsed = matter(content);
  const data = parsed.data as Record<string, unknown>;
  const requiredCaseFields = data.requiredCaseFields;
  const requiredVisibility = data.requiredVisibility;
  const verifierIds = data.verifierIds;
  if (
    data.schemaVersion !== 1 ||
    typeof data.minimumPassRate !== 'number' ||
    data.minimumPassRate !== 1 ||
    !Array.isArray(requiredCaseFields) ||
    !requiredCaseFields.every((value) => typeof value === 'string') ||
    !Array.isArray(requiredVisibility) ||
    !requiredVisibility.every((value) => typeof value === 'string') ||
    !Array.isArray(verifierIds) ||
    !verifierIds.every(
      (value) => typeof value === 'string' && isMatrixVerifierId(value),
    ) ||
    !parsed.content.trim()
  ) {
    throw new Error(
      'Evaluation rubric requires schemaVersion 1, minimumPassRate 1, executable verifier IDs, and prose.',
    );
  }
  const fields = requiredCaseFields as string[];
  if (
    fields.length !== expectedRubricFields.size ||
    fields.some((field) => !expectedRubricFields.has(field)) ||
    !requiredVisibility.includes('candidate') ||
    !requiredVisibility.includes('challenge')
  ) {
    throw new Error(
      'Evaluation rubric must require every matrix field and both visibility values.',
    );
  }
  return {
    minimumPassRate: data.minimumPassRate,
    requiredCaseFields: fields,
    requiredVisibility: requiredVisibility as string[],
    schemaVersion: data.schemaVersion,
    verifierIds: verifierIds as string[],
  };
};

const validateRubricForMatrix = (
  rubric: SkillRubricContract,
  matrix: readonly MatrixCase[],
): void => {
  if (
    !matrix.every((matrixCase) =>
      rubric.verifierIds.includes(matrixCase.independentVerifier),
    )
  ) {
    throw new Error(
      'Evaluation rubric does not authorize every matrix verifier.',
    );
  }
};

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

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

const skillMatrixPaths = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  skillPath: string,
): Promise<readonly string[]> => {
  const evalsPath = join(skillPath, 'evals');
  const entries = await fileSystem.readdir?.(evalsPath, {
    withFileTypes: true,
  });
  if (!entries) {
    throw new Error('Skill evaluation requires directory listing support.');
  }
  const matrixPaths = entries
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(evalsPath, entry.name))
    .sort();
  if (matrixPaths.length === 0) {
    throw new Error(`Skill has no evaluation matrix: ${evalsPath}`);
  }
  if (!matrixPaths.includes(join(evalsPath, 'cases.jsonl'))) {
    throw new Error(
      `Skill is missing its canonical evaluation matrix: ${join(evalsPath, 'cases.jsonl')}`,
    );
  }
  const rubricPath = join(evalsPath, 'rubric.md');
  if (!(await readOptional(fileSystem, rubricPath))?.trim()) {
    throw new Error(
      `Skill is missing a nonblank evaluation rubric: ${rubricPath}`,
    );
  }
  return matrixPaths;
};

const validateSkillEvaluations = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  skillPath: string,
): Promise<number> => {
  const sourcePath = join(skillPath, 'SKILL.md');
  const sourceText = await fileSystem.readFile(sourcePath, 'utf8');
  const sourceFingerprint = fingerprint(sourceText);
  const matrixPaths = await skillMatrixPaths(fileSystem, skillPath);
  const rubric = parseSkillRubric(
    (await readOptional(fileSystem, join(skillPath, 'evals', 'rubric.md'))) ??
      '',
  );
  let candidateCount = 0;
  let challengeCount = 0;
  for (const matrixPath of matrixPaths) {
    const matrix = parseMatrixJsonl(
      await fileSystem.readFile(matrixPath, 'utf8'),
    );
    validateRubricForMatrix(rubric, matrix);
    const matrixCandidateCount = matrix.filter(
      ({ visibility }) => visibility === 'candidate',
    ).length;
    const matrixChallengeCount = matrix.filter(
      ({ visibility }) => visibility === 'challenge',
    ).length;
    candidateCount += matrixCandidateCount;
    challengeCount += matrixChallengeCount;
    const phases = [
      {
        count: matrixCandidateCount,
        label: 'candidate',
        phase: 'candidate_checked' as const,
      },
      {
        count: matrixChallengeCount,
        label: 'challenge',
        phase: 'challenge_checked' as const,
      },
    ].filter(({ count }) => count > 0);
    for (const { label, phase } of phases) {
      const receipt = evaluateSkillMatrix(
        matrix,
        { delegatedChecks: {}, ownedFiles: new Set(), text: sourceText },
        sourceFingerprint,
        phase,
      );
      if (!receiptPasses(receipt)) {
        throw new Error(
          `${matrixPath} ${label} evaluation failed: ${failedCheckNames(receipt).join(', ')}`,
        );
      }
    }
  }
  if (candidateCount === 0 || challengeCount === 0) {
    throw new Error(
      `Skill evaluation requires at least one candidate and one challenge case: ${skillPath}`,
    );
  }
  return matrixPaths.length;
};

export const validateAllSkills = async (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  skillsRoot: string,
): Promise<SkillSuiteValidationReceipt> => {
  if (!skillsRoot.startsWith('/') || !fileSystem.readdir) {
    throw new Error(
      'All-skill validation requires an absolute skills root and directory listing support.',
    );
  }
  const root = resolve(skillsRoot);
  const entries = await fileSystem.readdir(root, { withFileTypes: true });
  const skillPaths = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .sort();
  if (skillPaths.length === 0) {
    throw new Error(`No skills found under ${root}.`);
  }
  const results = await Promise.allSettled(
    skillPaths.map(async (skillPath) => {
      try {
        await validateSkill(fileSystem, skillPath);
        return {
          matrixCount: await validateSkillEvaluations(fileSystem, skillPath),
        };
      } catch (error) {
        throw new Error(`${skillPath}: ${errorMessage(error)}`);
      }
    }),
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [errorMessage(result.reason)] : [],
  );
  if (failures.length > 0) {
    throw new Error(`Skill validation failed:\n${failures.join('\n')}`);
  }
  const prose = await reviewSkillProse(fileSystem, [root]);
  if (prose.findings.length > 0) {
    throw new Error(
      `Skill prose review failed: ${prose.findings
        .map(
          ({ sourcePath, targetPath, kind }) =>
            `${kind}: ${sourcePath} -> ${targetPath}`,
        )
        .join('; ')}`,
    );
  }
  return {
    matrixCount: results.reduce(
      (count, result) =>
        count + (result.status === 'fulfilled' ? result.value.matrixCount : 0),
      0,
    ),
    prose,
    skillCount: skillPaths.length,
    status: 'valid',
  };
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
