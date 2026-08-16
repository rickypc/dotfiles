import { access, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';

const sourceFileExists = async (sourcePath: string): Promise<boolean> => {
  try {
    await access(sourcePath);
    return true;
  } catch {
    return false;
  }
};

export const trashRoot = (): string => resolve(homedir(), '.Trash');

const fatalTrashErrors = new Set(['EXDEV', 'ENOTSUP', 'EROFS']);

const classifyRenameError = (
  code: string | undefined,
): 'fatal' | 'retry' | 'rethrow' => {
  if (code && fatalTrashErrors.has(code)) {
    return 'fatal';
  }
  if (code === 'ENOENT' || code === 'EEXIST') {
    return 'retry';
  }
  return 'rethrow';
};

const attemptTrashRename = async (
  sourcePath: string,
  destination: string,
): Promise<boolean> => {
  try {
    await rename(sourcePath, destination);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    const verdict = classifyRenameError(code);
    if (verdict === 'fatal') {
      throw new Error(
        `Trash directory unavailable at ${trashRoot()}: ${code ?? 'unknown error'}.`,
      );
    }
    if (
      verdict === 'retry' &&
      code === 'ENOENT' &&
      !(await sourceFileExists(sourcePath))
    ) {
      throw new Error(`Plan retirement source not found: ${sourcePath}.`);
    }
    if (verdict === 'retry') {
      return false;
    }
    throw error;
  }
};

export const defaultMoveSourceToTrash = async (
  sourcePath: string,
): Promise<string> => {
  if (!sourcePath.startsWith('/')) {
    throw new Error('Plan retirement requires an absolute source path.');
  }
  const trash = trashRoot();
  const base = basename(sourcePath);
  for (let suffix = 0; suffix <= 200; suffix += 1) {
    const destination = resolve(
      trash,
      suffix === 0 ? base : `${base}.${suffix}`,
    );
    if (await attemptTrashRename(sourcePath, destination)) {
      return destination;
    }
  }
  throw new Error(
    `Trash destination collision limit reached: ${trash}/${base}`,
  );
};
