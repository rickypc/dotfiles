import { describe, expect, mock, test } from 'bun:test';

import {
  createNodeFileSystem,
  parentDirectory,
  readText,
  removeFile,
  writeText,
} from '../../utils/filesystem.js';

describe('filesystem', () => {
  test('creates the node filesystem adapter from injected operations', async () => {
    const readDirectory = mock(async () => []);
    const readFile = mock(async () => 'content');
    const fileSystem = createNodeFileSystem({
      mkdir: mock(async () => undefined),
      readDirectory,
      readFile,
      rm: mock(async () => undefined),
      writeFile: mock(async () => undefined),
    });
    await expect(
      fileSystem.readdir?.('/directory', { withFileTypes: true }),
    ).resolves.toEqual([]);
    await expect(readText(fileSystem, '/file.txt')).resolves.toBe('content');
    expect(readDirectory).toHaveBeenCalledWith('/directory', {
      withFileTypes: true,
    });
    expect(readFile).toHaveBeenCalledWith('/file.txt', 'utf8');
  });

  test.each([
    ['/one/two.txt', '/one'],
    ['/one.txt', '/'],
  ])('finds the parent directory for %s', (path, expected) => {
    expect(parentDirectory(path)).toBe(expected);
  });

  test.each(['file.txt', ''])('rejects a non-absolute file path', (path) => {
    expect(() => parentDirectory(path)).toThrow(
      'An absolute file path is required',
    );
  });

  test('reads text through the injected filesystem boundary', async () => {
    const readFile = mock(async () => 'content');
    const fileSystem = {
      mkdir: mock(),
      readFile,
      rm: mock(),
      writeFile: mock(),
    };
    await expect(readText(fileSystem, '/one.txt')).resolves.toBe('content');
    expect(readFile).toHaveBeenCalledWith('/one.txt', 'utf8');
  });

  test('creates the parent before writing text', async () => {
    const mkdir = mock(async () => undefined);
    const writeFile = mock(async () => undefined);
    const fileSystem = { mkdir, readFile: mock(), rm: mock(), writeFile };
    await writeText(fileSystem, '/one/two.txt', 'content');
    expect(mkdir).toHaveBeenCalledWith('/one', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith('/one/two.txt', 'content', 'utf8');
  });

  test('removes a file through the injected filesystem boundary', async () => {
    const rm = mock(async () => undefined);
    const fileSystem = {
      mkdir: mock(),
      readFile: mock(),
      rm,
      writeFile: mock(),
    };
    await removeFile(fileSystem, '/one.txt');
    expect(rm).toHaveBeenCalledWith('/one.txt', { force: true });
  });
});
