import { expect, mock, test } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  createBuiltinMcpClient,
  createSdkMcpClient,
  parseBackendEnvelope,
  probeRepoSearchTransport,
  type RepoSearchBackendResult,
  type RepoSearchTransport,
  redactBackendStorePaths,
  repoSearchBackendBinary,
  repoSearchCliCommand,
} from '../../utils/repo-search-transport.js';

const fixtureServer = join(import.meta.dir, '..', 'fixtures', 'fake-mcp-server.ts');

const envelopeLine = (text: string, isError = false) =>
  JSON.stringify({ content: [{ text, type: 'text' }], isError });

const result = (stdout: string, code = 0) => ({ code, stderr: '', stdout });

test('renders one backend operation as the CLI transport command', () => {
  const command = repoSearchCliCommand({
    args: { project: 'repo', query: 'needle' },
    tool: 'search_graph',
  });
  expect(command.command).toBe('codebase-memory-mcp');
  expect(command.args).toEqual([
    'cli',
    '--quiet',
    '--json',
    'search_graph',
    '--project',
    'repo',
    '--query',
    'needle',
  ]);
  expect(command.environment).toEqual({ REPO_SEARCH_LOG_LEVEL: 'error' });
});

test('parses MCP result envelopes and falls back to raw text', () => {
  expect(parseBackendEnvelope(envelopeLine('projects: 1'))).toEqual({
    error: null,
    isError: false,
    text: 'projects: 1',
  });
  expect(parseBackendEnvelope(`noise\n${envelopeLine('failed', true)}`)).toEqual({
    error: 'failed',
    isError: true,
    text: 'failed',
  } satisfies RepoSearchBackendResult);
  expect(parseBackendEnvelope('plain backend text')).toEqual({
    error: null,
    isError: false,
    text: 'plain backend text',
  });
  expect(parseBackendEnvelope('')).toEqual({
    error: 'empty backend response',
    isError: false,
    text: '',
  });
});

test('probes the MCP stdio transport first against a controlled server', async () => {
  const executor = mock(async () => result(''));
  const probe = await probeRepoSearchTransport({
    binary: 'bun',
    executor,
    serverArgs: [fixtureServer],
  });
  expect(probe.attempt.status).toBe('found');
  expect(probe.attempt.strategy).toBe('transport-probe');
  expect(probe.transport?.kind).toBe('mcp');
  expect(executor).not.toHaveBeenCalled();
  const transport = probe.transport;
  if (!transport) {
    throw new Error('Expected a probed MCP transport.');
  }
  const answered = await transport.call({ args: {}, tool: 'list_projects' });
  expect(answered.text).toBe('fixture:list_projects');
  expect(answered.isError).toBeFalse();
  await transport.close();
});

test('the built-in MCP client speaks the fixture protocol directly', async () => {
  const client = await createBuiltinMcpClient('bun', [fixtureServer]);
  if (!client) {
    throw new Error('Expected the built-in MCP client to connect.');
  }
  const answered = await client.callTool('list_projects', {});
  expect(answered.text).toBe('fixture:list_projects');
  await client.close();
  await client.close();
});

test('the SDK MCP client speaks the fixture protocol directly', async () => {
  const client = await createSdkMcpClient('bun', [fixtureServer]);
  if (!client) {
    throw new Error('Expected the SDK MCP client to connect.');
  }
  const answered = await client.callTool('search_graph', { project: 'repo' });
  expect(answered.text).toBe('fixture:search_graph');
  await client.close();
});

test('both MCP clients return undefined for unavailable servers', async () => {
  await expect(
    createSdkMcpClient('definitely-missing-repo-search-binary', []),
  ).resolves.toBeUndefined();
  await expect(
    createBuiltinMcpClient('definitely-missing-repo-search-binary', []),
  ).resolves.toBeUndefined();
  await expect(createBuiltinMcpClient('bun', ['-e', 'Bun.exit(0)'])).resolves.toBeUndefined();
});

test('the mcp transport settles its close even when the client close fails', async () => {
  const probe = await probeRepoSearchTransport({
    executor: mock(async () => result(envelopeLine('projects: 0'))),
    mcpClientFactory: () => [
      async () => ({
        callTool: async () => ({ error: null, isError: false, text: 'probe ok' }),
        close: async () => {
          throw new Error('close failed');
        },
      }),
    ],
  });
  expect(probe.transport?.kind).toBe('mcp');
  await expect(probe.transport?.close()).resolves.toBeUndefined();
});

test('the probe moves past failing and throwing MCP clients', async () => {
  const failing: RepoSearchTransport = {
    call: mock(async () => ({ error: 'denied', isError: true, text: '' })),
    close: mock(async () => undefined),
    kind: 'mcp',
  };
  const executor = mock(async () => result(envelopeLine('projects: 0')));
  const probe = await probeRepoSearchTransport({
    executor,
    mcpClientFactory: () => [
      async () => {
        throw new Error('client creation failed');
      },
      async () => ({
        callTool: async () => {
          throw new Error('probe call failed');
        },
        close: failing.close,
      }),
      async () => ({
        callTool: async () => ({ error: 'denied', isError: true, text: '' }),
        close: async () => undefined,
      }),
    ],
  });
  expect(probe.transport?.kind).toBe('cli');
  expect(probe.attempt.detail).toContain('CLI transport is the fallback');
});

test('falls back to the CLI transport when no MCP client can answer', async () => {
  const executor = mock(async () => result(envelopeLine('projects: 0')));
  const probe = await probeRepoSearchTransport({
    binary: 'definitely-missing-repo-search-binary',
    executor,
  });
  expect(probe.transport?.kind).toBe('cli');
  expect(probe.attempt.status).toBe('found');
  expect(probe.attempt.detail).toContain('CLI transport is the fallback');
  const answered = await probe.transport?.call({ args: {}, tool: 'list_projects' });
  expect(answered?.text).toBe('projects: 0');
});

test('reports a missing transport when both MCP and CLI fail', async () => {
  const executor = mock(async () => result('denied', 1));
  const probe = await probeRepoSearchTransport({
    binary: 'definitely-missing-repo-search-binary',
    executor,
  });
  expect(probe.transport).toBeNull();
  expect(probe.attempt.status).toBe('error');
  expect(probe.attempt.detail).toContain('No backend transport answered');
});

test('honors forced transports for deterministic routing', async () => {
  const none = await probeRepoSearchTransport({
    executor: mock(async () => result('')),
    force: 'none',
  });
  expect(none.transport).toBeNull();
  expect(none.attempt.status).toBe('skipped');
  const cliExecutor = mock(async () => result(envelopeLine('ok')));
  const cli = await probeRepoSearchTransport({ executor: cliExecutor, force: 'cli' });
  expect(cli.transport?.kind).toBe('cli');
  const mcpExecutor = mock(async () => result(envelopeLine('ok')));
  const missingMcp = await probeRepoSearchTransport({
    binary: 'definitely-missing-repo-search-binary',
    executor: mcpExecutor,
    force: 'mcp',
  });
  expect(missingMcp.transport).toBeNull();
  expect(missingMcp.attempt.status).toBe('error');
  expect(missingMcp.attempt.detail).toContain('MCP transport forced but unavailable');
  expect(mcpExecutor).not.toHaveBeenCalled();
});

test('the CLI transport maps exit codes and backend errors onto the envelope', async () => {
  const outputs = [
    result(envelopeLine('probe answer')),
    result(envelopeLine('first answer')),
    result('plain text answer'),
    result(envelopeLine('backend refused', true), 1),
    result('denied without envelope', 3),
  ];
  const executor = mock(async () => outputs.shift() ?? result('', 1));
  const transport = (await probeRepoSearchTransport({ executor, force: 'cli' })).transport;
  if (!transport) {
    throw new Error('Expected a CLI transport.');
  }
  expect(await transport.call({ args: {}, tool: 'list_projects' })).toEqual({
    error: null,
    isError: false,
    text: 'first answer',
  });
  expect(await transport.call({ args: {}, tool: 'list_projects' })).toMatchObject({
    isError: false,
    text: 'plain text answer',
  });
  expect(await transport.call({ args: {}, tool: 'list_projects' })).toMatchObject({
    error: 'backend refused',
    isError: true,
  });
  expect(await transport.call({ args: {}, tool: 'list_projects' })).toMatchObject({
    error: 'denied without envelope',
    isError: true,
  });
  await transport.close();
  let throwingCalls = 0;
  const throwing = mock(async () => {
    throwingCalls += 1;
    if (throwingCalls === 1) {
      return result(envelopeLine('probe ok'));
    }
    throw new Error('spawn failed');
  });
  const failing = (await probeRepoSearchTransport({ executor: throwing, force: 'cli' })).transport;
  await expect(failing?.call({ args: {}, tool: 'list_projects' })).resolves.toMatchObject({
    error: 'spawn failed',
    isError: true,
  });
});

test('redacts the backend storage directory from every text surface', () => {
  const home = `${homedir()}/.cache/codebase-memory-mcp/projects.db`;
  expect(redactBackendStorePaths(home)).toBe('<backend-store>/projects.db');
  expect(redactBackendStorePaths('path /x/.cache/codebase-memory-mcp/y end')).toBe(
    'path /x<backend-store>/y end',
  );
  expect(redactBackendStorePaths('clean text')).toBe('clean text');
});

test('resolves the backend binary from options and environment', () => {
  const previous = Bun.env.REPO_SEARCH_BACKEND_BINARY;
  try {
    Bun.env.REPO_SEARCH_BACKEND_BINARY = '/env/bin/backend';
    expect(repoSearchBackendBinary()).toBe('/env/bin/backend');
    expect(repoSearchBackendBinary('/opt/other')).toBe('/opt/other');
    delete Bun.env.REPO_SEARCH_BACKEND_BINARY;
    expect(repoSearchBackendBinary()).toBe('codebase-memory-mcp');
  } finally {
    if (previous === undefined) {
      delete Bun.env.REPO_SEARCH_BACKEND_BINARY;
    } else {
      Bun.env.REPO_SEARCH_BACKEND_BINARY = previous;
    }
  }
});

test('parseBackendEnvelope skips malformed JSON lines', () => {
  expect(parseBackendEnvelope('{not json\nplain tail')).toEqual({
    error: null,
    isError: false,
    text: '{not json\nplain tail',
  });
});

test('the built-in client rejects a server error response after ignoring noise', async () => {
  const noisyServer = [
    // biome-ignore lint/security/noSecrets: deterministic test or regex fixture content, not a credential
    'Bun.stdout.write(\'{"jsonrpc":"2.0","method":"log"}\\n\');',
    // biome-ignore lint/security/noSecrets: deterministic test or regex fixture content, not a credential
    'Bun.stdout.write(\'{"jsonrpc":"2.0","id":999,"result":{}}\\n\');',
    // biome-ignore lint/security/noSecrets: deterministic test or regex fixture content, not a credential
    'Bun.stdout.write(\'{"jsonrpc":"2.0","id":1,"error":{"message":"boom"}}\\n\');',
  ].join('');
  await expect(createBuiltinMcpClient('bun', ['-e', noisyServer])).resolves.toBeUndefined();
});

test('the built-in client times out a hanging tool call', async () => {
  const client = await createBuiltinMcpClient('bun', [fixtureServer]);
  if (!client) {
    throw new Error('Expected the built-in MCP client to connect.');
  }
  await expect(client.callTool('hang', {}, 50)).rejects.toThrow('timed out');
  await client.close();
});
