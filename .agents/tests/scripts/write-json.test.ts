import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { JsonPathApi, WriteJsonDependencies } from '../../scripts/write-json.js';
import { command, createCommand, writeJson } from '../../scripts/write-json.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';
import type { FileSystem } from '../../utils/filesystem.js';

const pathApi: JsonPathApi = {
  isAbsolute: (value) => value.startsWith('/'),
  relative: (from, to) => {
    if (from === to) {
      return '';
    }
    return to.startsWith(`${from}/`) ? to.slice(from.length + 1) : '../outside.json';
  },
  resolve: (...paths) => paths.at(-1) ?? '',
};

const fileSystem: FileSystem = {
  exists: async () => false,
  mkdir: async () => undefined,
  readFile: async () => '',
  rm: async () => undefined,
  writeFile: async () => undefined,
};

const makeContext = (stdin: string) => {
  const out: string[] = [];
  const codes: number[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => stdin,
    setExitCode: (code) => codes.push(code),
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  return { codes, context, out };
};

const makeDependencies = (writes: string[]): WriteJsonDependencies => ({
  fileSystem,
  pathApi,
  temporaryRoot: '/tmp',
  writeText: async (_fileSystem, outputPath, content) => {
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

  test.each([
    ['nested objects', '{"a":{"b":1}}', '"b": 1'],
    ['arrays', '[1,2]', '1,\n  2'],
    ['null values', '{"v":null}', 'null'],
    ['booleans', '{"t":true,"f":false}', '"f": false'],
    ['an empty object', '{}', '{}'],
    ['an empty array', '[]', '[]'],
  ])('writes %s', async (_label, input, fragment) => {
    const writes: string[] = [];
    await writeJson('/tmp/value.json', input, makeDependencies(writes));
    expect(writes[0]).toContain(fragment);
  });

  test('rejects invalid JSON before a write', async () => {
    const writes: string[] = [];
    await expect(writeJson('/tmp/r.json', '{bad', makeDependencies(writes))).rejects.toThrow(
      'JSON input is invalid',
    );
    expect(writes).toHaveLength(0);
  });

  test('rejects relative and outside-temporary output paths before a write', async () => {
    const writes: string[] = [];
    const dependencies = makeDependencies(writes);
    await expect(writeJson('r.json', '{}', dependencies)).rejects.toThrow('must be absolute');
    await expect(writeJson('/var/r.json', '{}', dependencies)).rejects.toThrow(
      'inside the operating-system temporary directory',
    );
    expect(writes).toHaveLength(0);
  });
});

describe('write-json command', () => {
  test('reads stdin, writes the file, and prints the envelope with the resolved path', async () => {
    const writes: string[] = [];
    const { codes, context, out } = makeContext('{"ok":true}');
    const exit = await runCommand(
      createCommand(makeDependencies(writes)),
      ['/tmp/r.json'],
      context,
    );
    expect(exit).toBe(0);
    expect(writes).toEqual(['/tmp/r.json\n{\n  "ok": true\n}\n']);
    expect(JSON.parse(out[0] ?? '')).toEqual({
      command: 'scripts/write-json.ts',
      data: { path: '/tmp/r.json' },
      diagnostics: [],
      exitCode: 0,
      ok: true,
    });
    expect(codes).toEqual([0]);
  });

  test('prints only the path with --format text', async () => {
    const { context, out } = makeContext('{}');
    await runCommand(
      createCommand(makeDependencies([])),
      ['/tmp/r.json', '--format', 'text'],
      context,
    );
    expect(out).toEqual(['/tmp/r.json']);
  });

  test('maps invalid stdin to exit 1 without writing', async () => {
    const writes: string[] = [];
    const { context, out } = makeContext('{bad');
    const exit = await runCommand(
      createCommand(makeDependencies(writes)),
      ['/tmp/r.json'],
      context,
    );
    expect(exit).toBe(1);
    expect(writes).toHaveLength(0);
    expect(JSON.parse(out[0] ?? '').diagnostics[0]).toContain('JSON input is invalid');
  });

  test('maps a wrong argument count to usage exit 2 before reading stdin', async () => {
    for (const args of [[], ['/tmp/a.json', '/tmp/b.json']]) {
      const { context } = makeContext('{}');
      expect(await runCommand(createCommand(makeDependencies([])), args, context)).toBe(2);
    }
  });

  test('answers --help, -h, and --usage with exit 0 and the usage text', async () => {
    for (const flag of ['--help', '-h', '--usage']) {
      const { codes, context, out } = makeContext('{}');
      expect(await runCommand(command, [flag], context)).toBe(0);
      expect(out[0]).toContain('Usage: bun <agents-root>/scripts/write-json.ts');
      expect(codes).toEqual([0]);
    }
  });

  test('uses the operating-system temporary directory and real path module by default', async () => {
    const { context } = makeContext('{bad');
    const exit = await runCommand(command, [path.join(tmpdir(), 'write-json-probe.json')], context);
    expect(exit).toBe(1);
  });
});
