import { afterEach, beforeAll, expect, mock, test } from 'bun:test';
import type { command as ProseCueCommand } from '../../scripts/prose-cues.js';
import type { CliContext } from '../../utils/cli/context.js';
import type { ProseCueReport } from '../../utils/prose-cues.js';

type ScanBody = NonNullable<NonNullable<typeof ProseCueCommand.commands>['scan']>;

let readError: Error | undefined;
let readResult = '';
const readTextStub = mock(async (_fileSystem: unknown, input: string): Promise<string> => {
  if (readError !== undefined) {
    throw readError;
  }
  return `${readResult}:${input}`;
});
const scanTextStub = mock(
  (text: string): ProseCueReport => ({
    flaggedLineCount: 0,
    lineCount: text === '' ? 0 : 1,
    matches: [],
    schemaVersion: 1,
  }),
);

let scanBody: ScanBody;

const makeContext = (stdin: string, onRead: () => void = () => undefined): CliContext => ({
  listDirectory: async () => [],
  readStdin: async () => {
    onRead();
    return stdin;
  },
  setExitCode: () => undefined,
  write: () => undefined,
  writeError: () => undefined,
});

beforeAll(async () => {
  mock.module('../../utils/cli/errors.js', () => ({
    errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  }));
  mock.module('../../utils/cli/index.js', () => ({ runMain: () => undefined }));
  mock.module('../../utils/filesystem.js', () => ({ nodeFileSystem: {}, readText: readTextStub }));
  mock.module('../../utils/prose-cues.js', () => ({
    PROSE_CUE_SET_VERSION: 2,
    scanText: scanTextStub,
  }));

  const { command } = await import('../../scripts/prose-cues.js');
  const candidate = command.commands?.scan;

  if (candidate === undefined) {
    throw new Error('The prose-cues command has no scan route.');
  }

  scanBody = candidate;
});

const runScan = async (positionals: readonly string[], context: CliContext) =>
  scanBody.run({ agentsRoot: undefined, command: 'scan', positionals, values: {} }, context);

afterEach(() => {
  readError = undefined;
  readResult = '';
  readTextStub.mockClear();
  scanTextStub.mockClear();
});

test('scans file and stdin inputs through injected boundaries', async () => {
  readResult = 'file contents';
  let readCount = 0;

  const result = await runScan(
    ['draft.md', '-'],
    makeContext('stdin contents', () => (readCount += 1)),
  );

  expect(readTextStub).toHaveBeenCalledTimes(1);
  expect(readTextStub.mock.calls[0]?.[1]).toBe('draft.md');
  expect(readCount).toBe(1);
  expect(scanTextStub.mock.calls.map(([text]) => text)).toEqual([
    'file contents:draft.md',
    'stdin contents',
  ]);
  expect(result.results.map(({ input }) => input)).toEqual(['draft.md', '<stdin>']);
  expect(result.networkAccess).toBe(false);
  expect(result.rewritePerformed).toBe(false);
});

test('reads stdin once when multiple positions refer to stdin', async () => {
  let readCount = 0;

  const result = await runScan(
    ['-', '-'],
    makeContext('same stdin', () => (readCount += 1)),
  );

  expect(readCount).toBe(1);
  expect(scanTextStub.mock.calls.map(([text]) => text)).toEqual(['same stdin', 'same stdin']);
  expect(result.results.map(({ input }) => input)).toEqual(['<stdin>', '<stdin>']);
});

test('adds input context and recovery guidance when a file read fails', async () => {
  readError = new Error('permission denied');

  await expect(runScan(['private.md'], makeContext('unused'))).rejects.toThrow(
    'Cannot read UTF-8 input private.md: permission denied. Check that the file exists and is readable.',
  );
});

test('renders the scan receipt as JSON text', async () => {
  const result = await runScan(['draft.md'], makeContext('unused'));
  const renderText = scanBody.renderText;

  if (renderText === undefined) {
    throw new Error('The prose-cues scan command has no text renderer.');
  }

  expect(renderText(result)).toBe(JSON.stringify(result));
});
