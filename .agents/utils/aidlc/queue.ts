import type { DirectoryEntry, FileSystem } from '../filesystem.js';
import {
  type AidlcIntent,
  aidlcIntentStatusFor,
  assertAidlcIntentPath,
  loadAidlcIntent,
} from './intent.js';

export type AidlcQueueCategory =
  | 'active'
  | 'awaiting-approval'
  | 'invalid'
  | 'needs-knowledge-closeout'
  | 'retirable'
  | 'superseded';

export interface AidlcQueueItem {
  readonly category: AidlcQueueCategory;
  readonly error?: string;
  readonly id: string;
  readonly path: string;
  readonly stage?: string;
  readonly summary?: string;
}

export interface AidlcQueueReport {
  readonly items: readonly AidlcQueueItem[];
  readonly leftoverCount: number;
}

const categoryOrder: readonly AidlcQueueCategory[] = [
  'active',
  'awaiting-approval',
  'invalid',
  'needs-knowledge-closeout',
  'superseded',
  'retirable',
];

const categoryFor = (intent: AidlcIntent): AidlcQueueCategory => {
  if (intent.lifecycle === 'superseded') return 'superseded';
  if (aidlcIntentStatusFor(intent) === 'completed') {
    return intent.kbCloseout ? 'retirable' : 'needs-knowledge-closeout';
  }
  if (intent.stage === 'approval-handoff') return 'awaiting-approval';
  return 'active';
};

const intentsDirectory = (agentsRoot: string, cbmIndex: string): string => {
  const placeholderPath = `${agentsRoot.replace(/\/$/u, '')}/aidlc/${cbmIndex}/intents/queue-placeholder.md`;
  assertAidlcIntentPath(placeholderPath);
  return placeholderPath.slice(0, -'queue-placeholder.md'.length - 1);
};

const itemFor = async (
  fileSystem: FileSystem,
  path: string,
): Promise<AidlcQueueItem> => {
  try {
    const intent = await loadAidlcIntent(fileSystem, path);
    return {
      category: categoryFor(intent),
      id: intent.id,
      path,
      stage: intent.stage,
      summary: intent.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid intent';
    return {
      category: 'invalid',
      error: message.slice(0, 160),
      id: path.split('/').at(-1)?.replace(/\.md$/u, '') ?? path,
      path,
    };
  }
};

export const inventoryAidlcIntents = async (
  fileSystem: FileSystem,
  agentsRoot: string,
  cbmIndex: string,
): Promise<AidlcQueueReport> => {
  if (!fileSystem.readdir)
    throw new Error('AIDLC queue requires directory listing support.');
  const directory = intentsDirectory(agentsRoot, cbmIndex);
  let entries: readonly DirectoryEntry[];
  try {
    entries = await fileSystem.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return { items: [], leftoverCount: 0 };
    }
    throw error;
  }
  const files = entries
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.md'))
    .map((entry) => `${directory}/${entry.name}`)
    .sort();
  const items = (
    await Promise.all(files.map((path) => itemFor(fileSystem, path)))
  ).sort((left, right) => {
    const categoryDifference =
      categoryOrder.indexOf(left.category) -
      categoryOrder.indexOf(right.category);
    return categoryDifference || left.id.localeCompare(right.id);
  });
  return {
    items,
    leftoverCount: items.filter(
      (item) => item.category !== 'retirable' && item.category !== 'superseded',
    ).length,
  };
};
