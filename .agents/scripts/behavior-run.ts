import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWhenMainWithHelp } from '../utils/cli.js';
import {
  behaviorGraderBundleFor,
  behaviorRunReceiptFromResponses,
  behaviorTargetBundleFor,
} from '../utils/quality-engine/behavior-bundles.js';
import {
  BEHAVIOR_RUNS_PER_CASE,
  type BehaviorRunAggregateReceipt,
  type BehaviorRunCase,
  type BehaviorRunCaseSessions,
  type BehaviorRunExpected,
  type BehaviorRunMetadata,
  type BehaviorRunSplit,
  evaluationMatrixFingerprintFor,
  isBehaviorRunId,
} from '../utils/quality-engine/behavior-run.js';
import { aggregateBehaviorRunReceipts } from '../utils/quality-engine/behavior-run-aggregate.js';
import {
  type BehaviorEvaluationCase,
  behaviorRubricAxes,
  type EvaluationCase,
  parseEvaluationCasesJsonl,
} from '../utils/quality-engine/evaluation-cases.js';

export interface BehaviorRunCliDependencies {
  readonly readText: (path: string) => Promise<string>;
  readonly write: (message: string) => void;
}

export const BEHAVIOR_RUN_AGENTS_ROOT_PATH = fileURLToPath(new URL('../', import.meta.url));

interface BehaviorRunManifestPolicy {
  readonly behaviorRunsPerCase: number;
  readonly evaluationId: string;
  readonly manifestFingerprint: string;
}

const USAGE = [
  'Usage:',
  '  bun <agents-root>/scripts/behavior-run.ts expected <cases> <metadata> <split> <sessions.jsonl>',
  '  bun <agents-root>/scripts/behavior-run.ts target <cases> <source.md> <case-id> <metadata.json>',
  '  bun <agents-root>/scripts/behavior-run.ts grader <cases> <shared-rubric.md> <case-id> <target-response.json> <metadata.json>',
  '  bun <agents-root>/scripts/behavior-run.ts seal <cases> <expected.json> <target.jsonl> <grader.jsonl>',
  '  bun <agents-root>/scripts/behavior-run.ts aggregate <owner-id> <split> <run-receipts.jsonl>',
  '  seal emits runId-linked provisional local scores; it does not verify session authenticity or admit a baseline.',
  '  aggregate requires the root manifest run count and validates each case-to-runId link.',
].join('\n');

export const BEHAVIOR_RUN_ROOT_MANIFEST_PATH = fileURLToPath(
  new URL('../evals/manifest.json', import.meta.url),
);

const behaviorCasesFrom = (content: string): readonly BehaviorEvaluationCase[] =>
  parseEvaluationCasesJsonl(content).filter(
    (item): item is BehaviorEvaluationCase => item.kind === 'behavior',
  );

export const behaviorRunUsage = (): string => USAGE;

const caseFor = (cases: readonly BehaviorEvaluationCase[], id: string): BehaviorEvaluationCase => {
  const evaluationCase = cases.find((item) => item.id === id);
  if (!evaluationCase) {
    throw new Error(`No behavior case has id ${id}.`);
  }
  return evaluationCase;
};

const evaluationCasesFrom = (content: string): readonly EvaluationCase[] =>
  parseEvaluationCasesJsonl(content);

const isAbsoluteJsonlPath = (value: string | undefined): value is string =>
  value?.startsWith('/') === true && value?.endsWith('.jsonl') === true;

const isAbsoluteJsonPath = (value: string | undefined): value is string =>
  value?.startsWith('/') === true && value?.endsWith('.json') === true;

const isAbsoluteMarkdownPath = (value: string | undefined): value is string =>
  value?.startsWith('/') === true && value?.endsWith('.md') === true;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertManifestBinding = (value: unknown, policy: BehaviorRunManifestPolicy): void => {
  if (
    !isRecord(value)
    || !isRecord(value.metadata)
    || value.metadata.evaluationId !== policy.evaluationId
  ) {
    throw new Error('Run metadata evaluationId does not match evals/manifest.json.');
  }
  if (value.metadata.manifestFingerprint !== policy.manifestFingerprint) {
    throw new Error('Run metadata manifestFingerprint does not match evals/manifest.json.');
  }
  if (
    !Number.isInteger(value.metadata.runIndex)
    || Number(value.metadata.runIndex) < 1
    || Number(value.metadata.runIndex) > policy.behaviorRunsPerCase
  ) {
    throw new Error(`Run metadata runIndex must be between 1 and ${policy.behaviorRunsPerCase}.`);
  }
};

const caseSessionsFrom = (content: string): readonly BehaviorRunCaseSessions[] => {
  const lines = content.split(/\r?\n/u);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  if (lines.length === 0 || lines.some((line) => line.trim() === '')) {
    throw new Error('Session metadata JSONL must contain one nonblank row per case.');
  }
  return lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Session metadata JSONL line ${index + 1} is not valid JSON.`);
    }
    if (
      !isRecord(value)
      || Object.keys(value).sort().join(',') !== 'caseId,graderSessionId,targetSessionId'
      || typeof value.caseId !== 'string'
      || !value.caseId.trim()
      || typeof value.targetSessionId !== 'string'
      || !value.targetSessionId.trim()
      || typeof value.graderSessionId !== 'string'
      || !value.graderSessionId.trim()
    ) {
      throw new Error(`Session metadata JSONL row ${index + 1} is malformed.`);
    }
    return {
      caseId: value.caseId,
      graderSessionId: value.graderSessionId,
      targetSessionId: value.targetSessionId,
    };
  });
};

const casesPathForManifestOwner = (manifestContent: string, ownerId: string): string => {
  const manifest: unknown = JSON.parse(manifestContent);
  if (!isRecord(manifest) || !Array.isArray(manifest.owners)) {
    throw new Error('Root evaluation manifest must declare owner-bound case paths.');
  }
  const matches = manifest.owners.filter((owner) => isRecord(owner) && owner.id === ownerId);
  if (matches.length !== 1) {
    throw new Error(`Root evaluation manifest must declare exactly one owner named ${ownerId}.`);
  }
  const owner = matches[0];
  if (
    !isRecord(owner)
    || !Array.isArray(owner.requiredLanes)
    || !owner.requiredLanes.includes('behavior')
    || !isRecord(owner.artifacts)
    || typeof owner.artifacts.cases !== 'string'
  ) {
    throw new Error(`Manifest owner ${ownerId} has no behavior lane or case artifact.`);
  }
  const casesPath = owner.artifacts.cases;
  const segments = casesPath.split('/');
  if (
    !casesPath.startsWith('evals/')
    || !casesPath.endsWith('.jsonl')
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Manifest owner ${ownerId} has an unsafe case artifact path.`);
  }
  return resolve(BEHAVIOR_RUN_AGENTS_ROOT_PATH, casesPath);
};

const expectedFrom = (value: unknown, split: BehaviorRunSplit): BehaviorRunExpected => {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    throw new Error('Run metadata must be a JSON object.');
  }
  const cases = value.cases;
  const sessions = value.sessions;
  if (!Array.isArray(cases) || !Array.isArray(sessions)) {
    throw new Error('Run metadata must contain the frozen behavior cases and per-case sessions.');
  }
  return {
    axes: behaviorRubricAxes,
    cases: cases as readonly BehaviorRunCase[],
    metadata: value.metadata as unknown as BehaviorRunMetadata,
    sessions: sessions as readonly BehaviorRunCaseSessions[],
    split,
  };
};

const runIdFromMetadata = async (
  path: string | undefined,
  dependencies: BehaviorRunCliDependencies,
): Promise<string> => {
  const metadata: unknown = JSON.parse(await dependencies.readText(path ?? ''));
  if (!isRecord(metadata) || !isBehaviorRunId(metadata.runId)) {
    throw new Error('Run metadata must contain a UUIDv4 runId.');
  }
  return metadata.runId;
};

const runTarget = async (
  args: readonly string[],
  dependencies: BehaviorRunCliDependencies,
): Promise<void> => {
  const [, casesPath, sourcePath, caseId, metadataPath] = args;
  const allCases = behaviorCasesFrom(await dependencies.readText(casesPath ?? ''));
  const source = await dependencies.readText(sourcePath ?? '');
  const runId = await runIdFromMetadata(metadataPath, dependencies);
  const bundle = behaviorTargetBundleFor(caseFor(allCases, caseId ?? ''), source, runId);
  dependencies.write(JSON.stringify(bundle, null, 2));
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const assertMatrixFingerprint = (
  metadata: Pick<BehaviorRunMetadata, 'matrixFingerprint'>,
  cases: readonly EvaluationCase[],
): void => {
  const expectedFingerprint = evaluationMatrixFingerprintFor(cases, sha256);
  if (!/^[a-f0-9]{64}$/u.test(expectedFingerprint)) {
    throw new Error('Evaluation case matrix fingerprint must be a lowercase SHA-256 value.');
  }
  if (metadata.matrixFingerprint !== expectedFingerprint) {
    throw new Error(
      `Run metadata matrixFingerprint does not match the evaluation case matrix; expected ${expectedFingerprint}.`,
    );
  }
};

const behaviorRunPolicyFromManifest = (content: string): BehaviorRunManifestPolicy => {
  const manifest: unknown = JSON.parse(content);
  if (!isRecord(manifest) || typeof manifest.evaluationId !== 'string' || !manifest.evaluationId) {
    throw new Error('Root evaluation manifest must contain a nonblank evaluationId.');
  }
  if (
    !isRecord(manifest.policy)
    || !Number.isInteger(manifest.policy.behaviorRunsPerCase)
    || Number(manifest.policy.behaviorRunsPerCase) !== BEHAVIOR_RUNS_PER_CASE
  ) {
    throw new Error(
      `Root evaluation manifest policy must require exactly ${BEHAVIOR_RUNS_PER_CASE} behavior runs per case.`,
    );
  }
  const manifestFingerprint = sha256(content);
  if (!/^[a-f0-9]{64}$/u.test(manifestFingerprint)) {
    throw new Error('Root evaluation manifest fingerprint must be a lowercase SHA-256 value.');
  }
  return {
    behaviorRunsPerCase: Number(manifest.policy.behaviorRunsPerCase),
    evaluationId: manifest.evaluationId,
    manifestFingerprint,
  };
};

const splitFrom = (value: string | undefined): BehaviorRunSplit => {
  if (value === 'train' || value === 'validation' || value === 'challenge') {
    return value;
  }
  throw new Error(USAGE);
};

const runAggregate = async (
  args: readonly string[],
  dependencies: BehaviorRunCliDependencies,
): Promise<void> => {
  const [, ownerId, splitValue, receiptsPath] = args;
  const split = splitFrom(splitValue);
  const manifestContent = await dependencies.readText(BEHAVIOR_RUN_ROOT_MANIFEST_PATH);
  const policy = behaviorRunPolicyFromManifest(manifestContent);
  const casesPath = casesPathForManifestOwner(manifestContent, ownerId ?? '');
  const evaluationCases = evaluationCasesFrom(await dependencies.readText(casesPath));
  const behaviorCases = evaluationCases.filter(
    (item): item is BehaviorEvaluationCase => item.kind === 'behavior',
  );
  const expectedCases = behaviorCases
    .filter((item) => item.split === split)
    .map(({ hardAssertions, id, split: caseSplit, taskFamily }) => ({
      hardAssertions,
      id,
      split: caseSplit,
      taskFamily,
    }));
  if (expectedCases.length === 0) {
    throw new Error(`Manifest owner ${ownerId} has no frozen ${split} behavior cases.`);
  }
  const matrixFingerprint = evaluationMatrixFingerprintFor(evaluationCases, sha256);
  const content = await dependencies.readText(receiptsPath ?? '');
  const lines = content.split(/\r?\n/u);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  if (lines.length === 0 || lines.some((line) => line.trim() === '')) {
    throw new Error('Behavior run receipt JSONL must contain one nonblank receipt per line.');
  }
  const receipts: unknown[] = lines.map((line, index) => {
    try {
      const receipt: unknown = JSON.parse(line);
      assertManifestBinding(receipt, policy);
      return receipt;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Behavior run receipt JSONL line ${index + 1} is not valid JSON.`);
      }
      throw error;
    }
  });
  const aggregate: BehaviorRunAggregateReceipt = aggregateBehaviorRunReceipts(
    receipts,
    {
      axes: behaviorRubricAxes,
      cases: expectedCases,
      matrixFingerprint,
      ownerId: ownerId ?? '',
      split,
    },
    policy.behaviorRunsPerCase,
    sha256,
  );
  dependencies.write(JSON.stringify(aggregate, null, 2));
};

const runExpected = async (
  args: readonly string[],
  dependencies: BehaviorRunCliDependencies,
): Promise<void> => {
  const [, casesPath, metadataPath, splitValue, sessionsPath] = args;
  const split = splitFrom(splitValue);
  const evaluationCases = evaluationCasesFrom(await dependencies.readText(casesPath ?? ''));
  const allCases = evaluationCases.filter(
    (item): item is BehaviorEvaluationCase => item.kind === 'behavior',
  );
  const expectedCases = allCases.map(({ hardAssertions, id, split: caseSplit, taskFamily }) => ({
    hardAssertions,
    id,
    split: caseSplit,
    taskFamily,
  }));
  const metadata: unknown = JSON.parse(await dependencies.readText(metadataPath ?? ''));
  const sessions = caseSessionsFrom(await dependencies.readText(sessionsPath ?? ''));
  const expected = expectedFrom({ cases: expectedCases, metadata, sessions }, split);
  const policy = behaviorRunPolicyFromManifest(
    await dependencies.readText(BEHAVIOR_RUN_ROOT_MANIFEST_PATH),
  );
  assertManifestBinding(expected, policy);
  assertMatrixFingerprint(expected.metadata, evaluationCases);
  dependencies.write(JSON.stringify(expected, null, 2));
};

const runSeal = async (
  args: readonly string[],
  dependencies: BehaviorRunCliDependencies,
): Promise<void> => {
  const [, casesPath, expectedPath, targetResponsesPath, graderResponsesPath] = args;
  const evaluationCases = evaluationCasesFrom(await dependencies.readText(casesPath ?? ''));
  const allCases = evaluationCases.filter(
    (item): item is BehaviorEvaluationCase => item.kind === 'behavior',
  );
  const expectedValue: unknown = JSON.parse(await dependencies.readText(expectedPath ?? ''));
  if (
    !isRecord(expectedValue)
    || !isRecord(expectedValue.metadata)
    || !Array.isArray(expectedValue.cases)
  ) {
    throw new Error('Expected run file must contain cases and run metadata.');
  }
  const policy = behaviorRunPolicyFromManifest(
    await dependencies.readText(BEHAVIOR_RUN_ROOT_MANIFEST_PATH),
  );
  assertManifestBinding(expectedValue, policy);
  const split = splitFrom(expectedValue.split as string | undefined);
  const expected = expectedFrom(expectedValue, split);
  assertMatrixFingerprint(expected.metadata, evaluationCases);
  const matchingCases = allCases.filter(({ split: caseSplit }) => caseSplit === split);
  const receipt = behaviorRunReceiptFromResponses(
    await dependencies.readText(targetResponsesPath ?? ''),
    await dependencies.readText(graderResponsesPath ?? ''),
    expected,
    matchingCases,
    { sha256 },
  );
  dependencies.write(JSON.stringify(receipt, null, 2));
};

const strictEvidenceFrom = (
  value: unknown,
  expectedRunId: string,
): { diff: string; output: string; toolTrace: string } => {
  if (
    !isRecord(value)
    || Object.keys(value).sort().join(',') !== 'diff,output,runId,toolTrace'
    || typeof value.diff !== 'string'
    || typeof value.output !== 'string'
    || typeof value.runId !== 'string'
    || typeof value.toolTrace !== 'string'
  ) {
    throw new Error(
      'Target response must contain exactly string fields diff, output, runId, and toolTrace.',
    );
  }
  if (value.runId !== expectedRunId) {
    throw new Error('Target response runId does not match run metadata.');
  }
  return { diff: value.diff, output: value.output, toolTrace: value.toolTrace };
};

const runGrader = async (
  args: readonly string[],
  dependencies: BehaviorRunCliDependencies,
): Promise<void> => {
  const [, casesPath, rubricPath, caseId, targetResponsePath, metadataPath] = args;
  const allCases = behaviorCasesFrom(await dependencies.readText(casesPath ?? ''));
  const rubric = await dependencies.readText(rubricPath ?? '');
  const evidence: unknown = JSON.parse(await dependencies.readText(targetResponsePath ?? ''));
  const runId = await runIdFromMetadata(metadataPath, dependencies);
  const bundle = behaviorGraderBundleFor(
    caseFor(allCases, caseId ?? ''),
    strictEvidenceFrom(evidence, runId),
    rubric,
    runId,
  );
  dependencies.write(JSON.stringify(bundle, null, 2));
};

export const runBehaviorRunCommand = async (
  args: readonly string[],
  dependencies: BehaviorRunCliDependencies,
): Promise<void> => {
  const [command] = args;
  if (args.length === 5 && command === 'expected') {
    await runExpected(args, dependencies);
    return;
  }
  if (args.length === 5 && command === 'target') {
    await runTarget(args, dependencies);
    return;
  }
  if (args.length === 6 && command === 'grader') {
    await runGrader(args, dependencies);
    return;
  }
  if (args.length === 5 && command === 'seal') {
    await runSeal(args, dependencies);
    return;
  }
  if (args.length === 4 && command === 'aggregate') {
    await runAggregate(args, dependencies);
    return;
  }
  throw new Error(USAGE);
};

export const runBehaviorRunCli = async (
  args: readonly string[],
  dependencies: BehaviorRunCliDependencies,
): Promise<void> => {
  const [command, casesPath, argument3, argument4] = args;
  const commonValid = isAbsoluteJsonlPath(casesPath);
  const valid =
    (command === 'expected'
      && commonValid
      && isAbsoluteJsonPath(argument3)
      && isAbsoluteJsonlPath(args[4])
      && args.length === 5)
    || (command === 'target'
      && commonValid
      && isAbsoluteMarkdownPath(argument3)
      && typeof argument4 === 'string'
      && isAbsoluteJsonPath(args[4])
      && args.length === 5)
    || (command === 'grader'
      && commonValid
      && isAbsoluteMarkdownPath(argument3)
      && typeof argument4 === 'string'
      && isAbsoluteJsonPath(args[4])
      && isAbsoluteJsonPath(args[5])
      && args.length === 6)
    || (command === 'seal'
      && commonValid
      && isAbsoluteJsonPath(argument3)
      && isAbsoluteJsonlPath(argument4)
      && isAbsoluteJsonlPath(args[4])
      && args.length === 5)
    || (command === 'aggregate'
      && typeof casesPath === 'string'
      && casesPath.trim().length > 0
      && (argument3 === 'train' || argument3 === 'validation' || argument3 === 'challenge')
      && isAbsoluteJsonlPath(args[3])
      && args.length === 4);
  if (!valid) {
    throw new Error(USAGE);
  }
  await runBehaviorRunCommand(args, dependencies);
};

export const runBehaviorRunMain = async (args: readonly string[]): Promise<void> => {
  await runBehaviorRunCli(args, {
    readText: async (path) => readFile(path, 'utf8'),
    write: console.log,
  });
};

void runWhenMainWithHelp(
  import.meta.main,
  import.meta.main ? Bun.argv.slice(2) : [],
  behaviorRunUsage,
  runBehaviorRunMain,
);
