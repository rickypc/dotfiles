import { describe, expect, mock, test } from 'bun:test';

import {
  type BunSpawner,
  createBunExecutor,
  execute,
  requireSuccess,
} from '../../utils/process.js';

describe('process', () => {
  const spec = { args: ['--version'], command: 'tool' };

  test('returns a successful command result', () => {
    const result = { code: 0, stderr: '', stdout: 'ok' };
    expect(requireSuccess(spec, result)).toBe(result);
  });

  test.each([
    [{ code: 1, stderr: '', stdout: '' }, 'tool exited with code 1'],
    [
      { code: 2, stderr: 'bad', stdout: 'partial' },
      'tool exited with code 2: partial\nbad',
    ],
  ])('reports failed command output', (result, message) => {
    expect(() => requireSuccess(spec, result)).toThrow(message);
  });

  test('uses a mocked executor and returns its successful result', async () => {
    const result = { code: 0, stderr: '', stdout: 'ok' };
    const executor = mock(async () => result);
    await expect(execute(executor, spec)).resolves.toBe(result);
    expect(executor).toHaveBeenCalledWith(spec);
  });

  test('merges a command environment into the Bun process environment', async () => {
    const calls: Parameters<BunSpawner>[0][] = [];
    const spawn: BunSpawner = (options) => {
      calls.push(options);
      return { exited: Promise.resolve(0), stderr: null, stdout: null };
    };
    await createBunExecutor(spawn)({
      ...spec,
      environment: { CBM_LOG_LEVEL: 'error' },
    });
    expect(calls[0]).toMatchObject({
      env: { CBM_LOG_LEVEL: 'error' },
    });
  });

  test.each([
    [null, 'out', '', undefined],
    ['err', null, 'err', '/work'],
  ])(
    'runs a command through a mocked Bun spawn boundary',
    async (stderr, stdout, expectedStderr, cwd) => {
      const toStream = (
        value: string | null,
      ): ReadableStream<Uint8Array> | null => {
        if (value === null) {
          return null;
        }
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(value));
            controller.close();
          },
        });
      };
      const spawn = mock(() => ({
        exited: Promise.resolve(0),
        stderr: toStream(stderr),
        stdout: toStream(stdout),
      }));
      const executor = createBunExecutor(spawn);
      await expect(executor({ ...spec, cwd })).resolves.toEqual({
        code: 0,
        stderr: expectedStderr,
        stdout: stdout ?? '',
      });
      expect(spawn).toHaveBeenCalledWith({
        cmd: ['tool', '--version'],
        cwd,
        stderr: 'pipe',
        stdout: 'pipe',
      });
    },
  );
});
