import { afterEach, describe, expect, mock, test } from 'bun:test';

const renameMock = mock((_src: string, _dest: string) => Promise.resolve());
const accessMock = mock((_path: string) => Promise.resolve());
const homedirMock = mock(() => '/home/tester');

mock.module('node:fs/promises', () => ({
  access: accessMock,
  rename: renameMock,
}));
mock.module('node:os', () => ({
  homedir: homedirMock,
}));

const { trashRoot, defaultMoveSourceToTrash } = await import(
  '../../scripts/trash.js'
);

describe('trashRoot', () => {
  afterEach(() => {
    homedirMock.mockClear();
  });

  test('returns ~/.Trash resolved from homedir', () => {
    homedirMock.mockImplementation(() => '/home/tester');
    expect(trashRoot()).toBe('/home/tester/.Trash');
  });
});

describe('defaultMoveSourceToTrash', () => {
  afterEach(() => {
    renameMock.mockClear();
    accessMock.mockClear();
    homedirMock.mockClear();
    homedirMock.mockImplementation(() => '/home/tester');
  });

  test('rejects a relative source path', async () => {
    await expect(defaultMoveSourceToTrash('relative/file.md')).rejects.toThrow(
      'Plan retirement requires an absolute source path.',
    );
  });

  test('moves source to ~/.Trash/<base> on a free slot and returns the destination', async () => {
    const source = '/home/tester/work/plan.md';
    renameMock.mockImplementation(() => Promise.resolve());
    const dest = await defaultMoveSourceToTrash(source);
    expect(dest).toBe('/home/tester/.Trash/plan.md');
    expect(renameMock).toHaveBeenCalledTimes(1);
    expect(renameMock.mock.calls[0]).toEqual([
      source,
      '/home/tester/.Trash/plan.md',
    ]);
  });

  test('appends numeric suffix when the primary destination is busy', async () => {
    const source = '/home/tester/work/plan.md';
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
    const dest = await defaultMoveSourceToTrash(source);
    expect(dest).toBe('/home/tester/.Trash/plan.md.1');
    expect(renameMock).toHaveBeenCalledTimes(2);
  });

  test('throws when all 201 destination slots are busy', async () => {
    const source = '/home/tester/work/plan.md';
    renameMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('EEXIST'), { code: 'EEXIST' })),
    );
    await expect(defaultMoveSourceToTrash(source)).rejects.toThrow(
      'Trash destination collision limit reached: /home/tester/.Trash/plan.md',
    );
    expect(renameMock).toHaveBeenCalledTimes(201);
  });

  test('throws when the trash directory is on an unsupported filesystem', async () => {
    const source = '/home/tester/work/plan.md';
    renameMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('EXDEV'), { code: 'EXDEV' })),
    );
    await expect(defaultMoveSourceToTrash(source)).rejects.toThrow(
      'Trash directory unavailable at /home/tester/.Trash: EXDEV',
    );
  });

  test('throws when source is gone on ENOENT', async () => {
    const source = '/home/tester/work/plan.md';
    renameMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    );
    accessMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    );
    await expect(defaultMoveSourceToTrash(source)).rejects.toThrow(
      'Plan retirement source not found: /home/tester/work/plan.md.',
    );
  });

  test('rethrows unknown error codes without retrying', async () => {
    const source = '/home/tester/work/plan.md';
    renameMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })),
    );
    await expect(defaultMoveSourceToTrash(source)).rejects.toThrow('EACCES');
    expect(renameMock).toHaveBeenCalledTimes(1);
  });

  test('retries the next suffix when destination parent vanishes but source still exists', async () => {
    const source = '/home/tester/work/plan.md';
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
    const dest = await defaultMoveSourceToTrash(source);
    expect(dest).toBe('/home/tester/.Trash/plan.md.1');
    expect(accessMock).toHaveBeenCalledTimes(1);
    expect(renameMock).toHaveBeenCalledTimes(2);
  });
});
