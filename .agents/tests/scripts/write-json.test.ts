import { describe, expect, mock, test } from 'bun:test';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { JsonPathApi } from '../../scripts/write-json.js';
import type { FileSystem } from '../../utils/filesystem.js';
import { nodeFileSystem, writeText } from '../../utils/filesystem.js';

mock.module('./filesystem.js', () => ({}));
const { processExit, run, runCli, writeJson } = await import(
  '../../scripts/write-json.js'
);

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

const defaultDependencies = {
  fileSystem: nodeFileSystem,
  pathApi: path,
  readInput: async () => '{invalid}',
  temporaryRoot: tmpdir(),
  writeText,
};

describe('writeJson', () => {
  test('writes exit status through a supplied process target', () => {
    const target: { exitCode?: number } = {};
    processExit.setExitCode(1, target);
    expect(target.exitCode).toBe(1);
  });

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

  test('runs the stdin command boundary with injected dependencies', async () => {
    const writes: string[] = [];
    await run(['/tmp/request.json'], {
      ...makeDependencies(writes),
      readInput: async () => '{"ok":true}',
    });
    expect(writes).toHaveLength(1);
  });

  test('rejects an invalid command shape before reading stdin', async () => {
    await expect(run([])).rejects.toThrow('Usage:');
  });

  test('reads the process stdin through the default command dependency', async () => {
    // Mock stdin to return invalid JSON so the test doesn't hang waiting for real stdin
    const mockStdin = mock(async () => '{invalid');
    await expect(
      run([`${tmpdir()}/coverage-probe.json`], {
        ...defaultDependencies,
        readInput: mockStdin,
      }),
    ).rejects.toThrow('JSON input is invalid');
    expect(mockStdin).toHaveBeenCalled();
  });

  test('reports CLI failures through the mocked process-exit boundary', async () => {
    const consoleError = mock();
    const runner = mock(async () => {
      throw new Error('synthetic CLI failure');
    });
    const setExitCode = mock();
    const originalConsoleError = console.error;
    const originalSetExitCode = processExit.setExitCode;
    console.error = consoleError;
    processExit.setExitCode = setExitCode;
    try {
      await runCli([], runner);
      expect(consoleError).toHaveBeenCalledWith('synthetic CLI failure');
      expect(runner).toHaveBeenCalledWith([]);
      expect(setExitCode).toHaveBeenCalledWith(1);
    } finally {
      console.error = originalConsoleError;
      processExit.setExitCode = originalSetExitCode;
    }
  });

  test('handles CLI help without reading stdin or writing output', async () => {
    const consoleLog = mock();
    const runner = mock(async () => undefined);
    const setExitCode = mock();
    const originalConsoleLog = console.log;
    console.log = consoleLog;

    try {
      await runCli(['--help'], runner, setExitCode);

      expect(consoleLog).toHaveBeenCalled();
      expect(runner).not.toHaveBeenCalled();
      expect(setExitCode).not.toHaveBeenCalled();
    } finally {
      console.log = originalConsoleLog;
    }
  });

  test('usage returns correct usage string', async () => {
    const { usage } = await import('../../scripts/write-json.js');
    expect(usage()).toContain('Usage: bun');
    expect(usage()).toContain('write-json.ts');
  });

  test('isWithinRoot checks path containment', async () => {
    const { writeJson } = await import('../../scripts/write-json.js');
    // Test that paths within temp root are allowed
    const writes: string[] = [];
    await writeJson(
      '/tmp/subdir/request.json',
      '{"ok":true}',
      makeDependencies(writes),
    );
    expect(writes.length).toBe(1);
  });

  test('runCli handles -h flag', async () => {
    const consoleLog = mock();
    const runner = mock(async () => undefined);
    const setExitCode = mock();
    const originalConsoleLog = console.log;
    console.log = consoleLog;

    try {
      await runCli(['-h'], runner, setExitCode);

      expect(consoleLog).toHaveBeenCalled();
      expect(runner).not.toHaveBeenCalled();
      expect(setExitCode).not.toHaveBeenCalled();
    } finally {
      console.log = originalConsoleLog;
    }
  });

  test('runCli passes through runner errors', async () => {
    const consoleError = mock();
    const runner = mock(async () => {
      throw new Error('runner error');
    });
    const setExitCode = mock();
    const originalConsoleError = console.error;
    console.error = consoleError;

    try {
      await runCli(['/tmp/test.json'], runner, setExitCode);
      expect(consoleError).toHaveBeenCalledWith('runner error');
      expect(setExitCode).toHaveBeenCalledWith(1);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test('writeJson handles nested objects', async () => {
    const writes: string[] = [];
    await writeJson(
      '/tmp/nested.json',
      '{"a":{"b":{"c":1}}}',
      makeDependencies(writes),
    );
    expect(writes[0]).toContain('"a":');
    expect(writes[0]).toContain('"b":');
    expect(writes[0]).toContain('"c": 1');
  });

  test('writeJson handles arrays', async () => {
    const writes: string[] = [];
    await writeJson(
      '/tmp/array.json',
      '[1,2,3]',
      makeDependencies(writes),
    );
    expect(writes[0]).toContain('1');
    expect(writes[0]).toContain('2');
    expect(writes[0]).toContain('3');
  });

  test('writeJson handles null values', async () => {
    const writes: string[] = [];
    await writeJson(
      '/tmp/null.json',
      '{"value":null}',
      makeDependencies(writes),
    );
    expect(writes[0]).toContain('null');
  });

  test('writeJson handles boolean values', async () => {
    const writes: string[] = [];
    await writeJson(
      '/tmp/bool.json',
      '{"true":true,"false":false}',
      makeDependencies(writes),
    );
    expect(writes[0]).toContain('true');
    expect(writes[0]).toContain('false');
  });

  test('writeJson handles empty object', async () => {
    const writes: string[] = [];
    await writeJson(
      '/tmp/empty.json',
      '{}',
      makeDependencies(writes),
    );
    expect(writes[0]).toContain('{}');
  });

  test('writeJson handles empty array', async () => {
    const writes: string[] = [];
    await writeJson(
      '/tmp/empty-array.json',
      '[]',
      makeDependencies(writes),
    );
    expect(writes[0]).toContain('[]');
  });

  test('run with multiple args throws Usage error', async () => {
    await expect(run(['/tmp/a.json', '/tmp/b.json'])).rejects.toThrow('Usage:');
  });

  test('run with no args throws Usage error', async () => {
    await expect(run([])).rejects.toThrow('Usage:');
  });

  test('processExit.setExitCode modifies target', () => {
    const target = { exitCode: 0 };
    processExit.setExitCode(42, target);
    expect(target.exitCode).toBe(42);
  });

  test('runCli with --help writes usage', async () => {
    const consoleLog = mock();
    const originalConsoleLog = console.log;
    console.log = consoleLog;
    try {
      await runCli(['--help']);
      expect(consoleLog).toHaveBeenCalled();
      expect(consoleLog.mock.calls[0][0]).toContain('Usage:');
    } finally {
      console.log = originalConsoleLog;
    }
  });

  test('runCli with -h writes usage', async () => {
    const consoleLog = mock();
    const originalConsoleLog = console.log;
    console.log = consoleLog;
    try {
      await runCli(['-h']);
      expect(consoleLog).toHaveBeenCalled();
      expect(consoleLog.mock.calls[0][0]).toContain('Usage:');
    } finally {
      console.log = originalConsoleLog;
    }
  });
});
