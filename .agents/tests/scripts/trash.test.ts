import { afterEach, describe, expect, mock, test } from 'bun:test';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const renameMock = mock((_src: string, _dest: string) => Promise.resolve());
const accessMock = mock((_path: string) => Promise.resolve());
const rmMock = mock((_path: string, _options?: { force?: boolean }) =>
  Promise.resolve(),
);
const readFileMock = mock((_path: string, _encoding?: string) =>
  Promise.resolve(''),
);
const writeFileMock = mock(
  (_path: string, _content: string, _encoding?: string) => Promise.resolve(),
);
const mkdirMock = mock((_path: string, _options?: { recursive?: boolean }) =>
  Promise.resolve(),
);

mock.module('node:fs/promises', () => ({
  access: accessMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  rename: renameMock,
  rm: rmMock,
  writeFile: writeFileMock,
}));

const { trashRoot, defaultMoveSourceToTrash } = await import(
  '../../scripts/trash.js'
);

const testTrashRoot = resolve(homedir(), '.Trash');
const testSource = resolve(homedir(), 'work/plan.md');

describe('trashRoot', () => {
  test('returns ~/.Trash resolved from homedir', () => {
    expect(trashRoot()).toBe(testTrashRoot);
  });
});

describe('defaultMoveSourceToTrash', () => {
  afterEach(() => {
    renameMock.mockClear();
    accessMock.mockClear();
    rmMock.mockClear();
    readFileMock.mockClear();
    writeFileMock.mockClear();
    mkdirMock.mockClear();
  });

  test('rejects a relative source path', async () => {
    await expect(defaultMoveSourceToTrash('relative/file.md')).rejects.toThrow(
      'Plan retirement requires an absolute source path.',
    );
  });

  test('moves source to ~/.Trash/<base> on a free slot and returns the destination', async () => {
    renameMock.mockImplementation(() => Promise.resolve());
    const dest = await defaultMoveSourceToTrash(testSource);
    expect(dest).toBe(resolve(testTrashRoot, 'plan.md'));
    expect(renameMock).toHaveBeenCalledTimes(1);
    expect(renameMock.mock.calls[0]).toEqual([
      testSource,
      resolve(testTrashRoot, 'plan.md'),
    ]);
  });

  test('appends numeric suffix when the primary destination is busy', async () => {
    let first = true;
    renameMock.mockImplementation(() => {
      if (first) {
        first = false;
        return Promise.reject(
          Object.assign(new Error('EEXIST'), { code: 'EEXIST' }),
        );
      }
      return Promise.resolve();
    });
    const dest = await defaultMoveSourceToTrash(testSource);
    expect(dest).toBe(resolve(testTrashRoot, 'plan.md.1'));
    expect(renameMock).toHaveBeenCalledTimes(2);
  });

  test('throws when all 201 destination slots are busy', async () => {
    renameMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('EEXIST'), { code: 'EEXIST' })),
    );
    await expect(defaultMoveSourceToTrash(testSource)).rejects.toThrow(
      `Trash destination collision limit reached: ${resolve(testTrashRoot, 'plan.md')}`,
    );
    expect(renameMock).toHaveBeenCalledTimes(201);
  });

  test('throws when the trash directory is on an unsupported filesystem', async () => {
    renameMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('EXDEV'), { code: 'EXDEV' })),
    );
    await expect(defaultMoveSourceToTrash(testSource)).rejects.toThrow(
      `Trash directory unavailable at ${testTrashRoot}: EXDEV`,
    );
  });

  test('throws when source is gone on ENOENT', async () => {
    renameMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    );
    accessMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    );
    await expect(defaultMoveSourceToTrash(testSource)).rejects.toThrow(
      `Plan retirement source not found: ${testSource}.`,
    );
  });

  test('rethrows unknown error codes without retrying', async () => {
    renameMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })),
    );
    await expect(defaultMoveSourceToTrash(testSource)).rejects.toThrow(
      'EACCES',
    );
    expect(renameMock).toHaveBeenCalledTimes(1);
  });

  test('retries the next suffix when destination parent vanishes but source still exists', async () => {
    let first = true;
    renameMock.mockImplementation(() => {
      if (first) {
        first = false;
        return Promise.reject(
          Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );
      }
      return Promise.resolve();
    });
    accessMock.mockImplementation(() => Promise.resolve());
    const dest = await defaultMoveSourceToTrash(testSource);
    expect(dest).toBe(resolve(testTrashRoot, 'plan.md.1'));
    expect(accessMock).toHaveBeenCalledTimes(1);
    expect(renameMock).toHaveBeenCalledTimes(2);
  });
});
