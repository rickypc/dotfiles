import path from 'node:path';

export const AGENTS_ROOT_FLAG = '--agents-root';

type ListDirectory = (
  directory: string,
) => Promise<readonly { readonly isDirectory: boolean; readonly name: string }[]>;

const rootProblem = async (root: string, listDirectory: ListDirectory): Promise<string> => {
  if (!path.isAbsolute(root) || root.split(/[\\/]/u).includes('..')) {
    return 'an absolute path without ".." segments';
  }
  const items = await listDirectory(root).catch(() => undefined);
  if (items === undefined) {
    return 'an existing directory';
  }
  return items.some((item) => item.isDirectory && ['evals', 'skills'].includes(item.name))
    ? ''
    : 'a directory that contains a skills or evals directory';
};

// Splits `--agents-root <path>` off the arguments and validates the path before any work starts.
export const splitAgentsRoot = async (
  args: readonly string[],
  listDirectory: ListDirectory,
): Promise<{ readonly rest: readonly string[]; readonly root?: string }> => {
  const index = args.indexOf(AGENTS_ROOT_FLAG);
  if (index === -1) {
    return { rest: args };
  }
  const root = args[index + 1] ?? '';
  const problem = await rootProblem(root, listDirectory);
  if (problem !== '') {
    throw new Error(`${AGENTS_ROOT_FLAG} must be ${problem}: got "${root}".`);
  }
  const rest = args.filter((_arg, position) => position !== index && position !== index + 1);
  return { rest, root };
};
