import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { nodeFileSystem, readText } from '../utils/filesystem.js';
import {
  captureConcept,
  conceptIndexPath,
  isKbConceptPath,
  type OkfMetadata,
  parseOkfConcept,
  type ReconciliationPlan,
  reconcileConcepts,
  renderDirectoryIndex,
  searchKnowledgeBase,
  searchKnowledgeBaseBatch,
  searchKnowledgeBaseWithFallback,
} from '../utils/knowledge-base.js';
import { bunExecutor } from '../utils/process.js';

const runBatchSearchCommand = async (
  args: readonly string[],
  batchSearch: typeof searchKnowledgeBaseBatch,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, value, cbmIndex, ...queries] = args;
  if (
    command !== 'search-batch' ||
    !value ||
    !cbmIndex ||
    queries.length === 0
  ) {
    return false;
  }
  write(
    JSON.stringify(
      await batchSearch(nodeFileSystem, bunExecutor, value, cbmIndex, queries),
      null,
      2,
    ),
  );
  return true;
};

const runCapture = async (
  args: readonly string[],
  capture: typeof captureConcept,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, kbRoot, relativePath, metadataJson, body, evidence] = args;
  if (
    command !== 'capture' ||
    !kbRoot ||
    !relativePath ||
    !metadataJson ||
    !body ||
    !evidence ||
    args.length !== 6
  ) {
    return false;
  }
  let metadata: OkfMetadata;
  try {
    metadata = JSON.parse(metadataJson) as OkfMetadata;
  } catch {
    throw new Error('KB capture metadata must be valid JSON.');
  }
  write(
    JSON.stringify(
      await capture(
        nodeFileSystem,
        kbRoot,
        relativePath,
        metadata,
        body,
        evidence,
      ),
    ),
  );
  return true;
};

const runConceptIndex = (
  args: readonly string[],
  write: (message: string) => void,
): boolean => {
  const [command, value] = args;
  if (
    command !== 'concept-index' ||
    !value ||
    args.length !== 2 ||
    !isKbConceptPath(value)
  ) {
    return false;
  }
  write(conceptIndexPath(value));
  return true;
};

const runReconcile = async (
  args: readonly string[],
  reconcile: typeof reconcileConcepts,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, kbRoot, requestPath] = args;
  if (
    command !== 'reconcile' ||
    !kbRoot ||
    !requestPath ||
    !requestPath.startsWith('/') ||
    args.length !== 3
  ) {
    return false;
  }
  let plan: ReconciliationPlan;
  try {
    plan = JSON.parse(
      await readText(nodeFileSystem, requestPath),
    ) as ReconciliationPlan;
  } catch {
    throw new Error('KB reconciliation request must be valid JSON.');
  }
  write(JSON.stringify(await reconcile(nodeFileSystem, kbRoot, plan)));
  return true;
};

const runSearchCommand = async (
  args: readonly string[],
  search: typeof searchKnowledgeBase,
  discover: typeof searchKnowledgeBaseWithFallback,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, value, first, second] = args;
  if ((command !== 'search' && command !== 'related') || !value || !first) {
    return false;
  }
  if (args.length === 3) {
    write(JSON.stringify(await search(nodeFileSystem, value, first), null, 2));
    return true;
  }
  if (command === 'search' && second && args.length === 4) {
    write(
      JSON.stringify(
        await discover(nodeFileSystem, bunExecutor, value, first, second),
        null,
        2,
      ),
    );
    return true;
  }
  return false;
};

const runReadCommand = async (
  args: readonly string[],
  search: typeof searchKnowledgeBase,
  discover: typeof searchKnowledgeBaseWithFallback,
  batchSearch: typeof searchKnowledgeBaseBatch,
  write: (message: string) => void,
): Promise<boolean> => {
  const [command, value, ...rest] = args;
  if (command === 'validate' && value && args.length === 2) {
    parseOkfConcept(await readText(nodeFileSystem, value));
    write('okf: passed');
    return true;
  }
  if (command === 'render-index' && value && args.length >= 2) {
    write(renderDirectoryIndex(value, rest));
    return true;
  }
  if (command === 'search' || command === 'related') {
    return runSearchCommand(args, search, discover, write);
  }
  return runBatchSearchCommand(args, batchSearch, write);
};

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/knowledge-base.ts <capture|concept-index|reconcile|related|render-index|search|search-batch|validate> <arguments>; search-batch takes one KB root, one CBM index, and 1-4 unique queries.';

export const run = async (
  args: readonly string[],
  write: (message: string) => void = console.log,
  capture: typeof captureConcept = captureConcept,
  search: typeof searchKnowledgeBase = searchKnowledgeBase,
  discover: typeof searchKnowledgeBaseWithFallback = searchKnowledgeBaseWithFallback,
  reconcile: typeof reconcileConcepts = reconcileConcepts,
  batchSearch: typeof searchKnowledgeBaseBatch = searchKnowledgeBaseBatch,
): Promise<void> => {
  if (await runCapture(args, capture, write)) {
    return;
  }
  if (await runReconcile(args, reconcile, write)) {
    return;
  }
  if (runConceptIndex(args, write)) {
    return;
  }
  if (await runReadCommand(args, search, discover, batchSearch, write)) {
    return;
  }
  throw new Error(usage());
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
