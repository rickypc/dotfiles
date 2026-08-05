import { describe, expect, mock, test } from 'bun:test';
import type { FileSystem } from '../../utils/filesystem.js';
import type { JsonPathApi } from '../../utils/write-json.js';

mock.module('./filesystem.js', () => ({}));

const { writeJson } = await import('../../utils/write-json.js');

const pathApi: JsonPathApi = {
  isAbsolute: (value: string) => value.startsWith('/'),
  relative: (from: string, to: string) => {
    if (from === to) {
      return '';
    }
    if (to.startsWith(`${from}/`)) {
      return to.slice(from.length + 1);
    }
    return '../outside.json';
  },
  resolve: (...paths: readonly string[]) => paths.at(-1) ?? '',
};

const makeFileSystem = (): FileSystem => ({
  mkdir: async () => undefined,
  readFile: async () => '',
  rm: async () => undefined,
  writeFile: async () => undefined,
});

const makeDependencies = (
  writes: string[],
): Parameters<typeof writeJson>[2] => ({
  fileSystem: makeFileSystem(),
  pathApi,
  temporaryRoot: '/tmp',
  writeText: async (
    _fileSystem: FileSystem,
    outputPath: string,
    content: string,
  ) => {
    writes.push(`${outputPath}\n${content}`);
  },
});

describe('writeJson', () => {
  test('writes valid JSON as a string-safe canonical document', async () => {
    const writes: string[] = [];

    await writeJson(
      '/tmp/request.json',
      '{"body":"Markdown `code` and $HOME stay literal"}',
      makeDependencies(writes),
    );

    expect(writes).toEqual([
      '/tmp/request.json\n{\n  "body": "Markdown `code` and $HOME stay literal"\n}\n',
    ]);
  });

  test('rejects invalid JSON before a write', async () => {
    const writes: string[] = [];

    await expect(
      writeJson('/tmp/request.json', '{invalid', makeDependencies(writes)),
    ).rejects.toThrow('JSON input is invalid');
    expect(writes).toHaveLength(0);
  });

  test('rejects relative and outside-temporary output paths before a write', async () => {
    const writes: string[] = [];
    const dependencies = makeDependencies(writes);

    await expect(writeJson('request.json', '{}', dependencies)).rejects.toThrow(
      'JSON output path must be absolute',
    );
    await expect(
      writeJson('/var/request.json', '{}', dependencies),
    ).rejects.toThrow('inside the operating-system temporary directory');
    expect(writes).toHaveLength(0);
  });
});
