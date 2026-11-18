import { describe, expect, mock, test } from 'bun:test';

import {
  createNodeFileSystem,
  nodeFileSystem,
  parentDirectory,
  readText,
  removeFile,
  writeText,
} from '../../utils/filesystem.js';

const realFs = { ...(await import('node:fs/promises')) };
const present = new Set<string>();

// Delegates every path outside /memory/ to the real module, so same-process suites are unaffected.
mock.module('node:fs/promises', () => ({
  ...realFs,
  access: mock(async (path: string, mode?: number) => {
    if (!path.startsWith('/memory/')) {
      return realFs.access(path, mode);
    }
    if (!present.has(path)) {
      throw new Error('ENOENT');
    }
    return undefined;
  }),
}));

describe('filesystem', () => {
  test('creates the node filesystem adapter from injected operations', async () => {
    const readDirectory = mock(async () => []);
    const readFile = mock(async () => 'content');
    const fileSystem = createNodeFileSystem({
      exists: async () => false,
      mkdir: mock(async () => undefined),
      readDirectory,
      readFile,
      rm: mock(async () => undefined),
      writeFile: mock(async () => undefined),
    });
    await expect(fileSystem.readdir?.('/directory', { withFileTypes: true })).resolves.toEqual([]);
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
    expect(() => parentDirectory(path)).toThrow('An absolute file path is required');
  });

  test('reads text through the injected filesystem boundary', async () => {
    const readFile = mock(async () => 'content');
    const fileSystem = {
      exists: async () => false,
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
    const fileSystem = {
      exists: async () => false,
      mkdir,
      readFile: mock(),
      rm: mock(),
      writeFile,
    };
    await writeText(fileSystem, '/one/two.txt', 'content');
    expect(mkdir).toHaveBeenCalledWith('/one', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith('/one/two.txt', 'content', 'utf8');
  });

  test('removes a file through the injected filesystem boundary', async () => {
    const rm = mock(async () => undefined);
    const fileSystem = {
      exists: async () => false,
      mkdir: mock(),
      readFile: mock(),
      rm,
      writeFile: mock(),
    };
    await removeFile(fileSystem, '/one.txt');
    expect(rm).toHaveBeenCalledWith('/one.txt', { force: true });
  });

  test('the node adapter exists probe answers for present and missing paths', async () => {
    const path = '/memory/exists.txt';
    await expect(nodeFileSystem.exists(path)).resolves.toBeFalse();
    present.add(path);
    await expect(nodeFileSystem.exists(path)).resolves.toBeTrue();
    present.delete(path);
    await expect(nodeFileSystem.exists('/definitely/missing/real-path.txt')).resolves.toBeFalse();
  });
});
