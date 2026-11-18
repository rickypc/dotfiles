import {
  command,
  createCommand,
  type KnowledgeBaseDependencies,
} from '../../scripts/knowledge-base.js';
import { defaultContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const contextFor = (out: string[]) => {
  const sink = (message: string) => out.push(message);
  return defaultContext({ stderr: sink, stdin: '', stdout: sink, target: {} });
};

export const helpText = async (): Promise<string> => {
  const out: string[] = [];
  await runCommand(command, ['--help'], contextFor(out));
  return out[0] ?? '';
};

export const runKnowledgeBase = async (
  args: readonly string[],
  write?: (message: string) => void,
  capture?: KnowledgeBaseDependencies['capture'],
  search?: KnowledgeBaseDependencies['search'],
  discover?: KnowledgeBaseDependencies['discover'],
  reconcile?: KnowledgeBaseDependencies['reconcile'],
  batchSearch?: KnowledgeBaseDependencies['batchSearch'],
  importer?: KnowledgeBaseDependencies['importer'],
  moveSourceToTrash?: KnowledgeBaseDependencies['moveSourceToTrash'],
): Promise<void> => {
  const out: string[] = [];
  const overrides = Object.fromEntries(
    Object.entries({
      batchSearch,
      capture,
      discover,
      importer,
      moveSourceToTrash,
      reconcile,
      search,
    }).filter(([, value]) => value !== undefined),
  );
  const code = await runCommand(
    createCommand(overrides),
    [...args, '--format', 'text'],
    contextFor(out),
  );
  if (code !== 0) {
    throw new Error(out.join('\n'));
  }
  write?.(out[0] ?? '');
};
