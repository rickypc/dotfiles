import { homedir } from 'node:os';
import type { CommandSpec } from './contracts.js';
import { bunExecutor, type CommandExecutor } from './process.js';
import { commandText, type SearchAttempt } from './search-fallback.js';

interface JsonRpcMessage {
  readonly error?: { readonly message?: unknown };
  readonly id?: unknown;
  readonly result?: unknown;
}

interface McpClientLike {
  readonly callTool: (
    name: string,
    args: Readonly<Record<string, string>>,
    timeoutMs?: number,
  ) => Promise<RepoSearchBackendResult>;
  readonly close: () => Promise<void>;
}

export type McpClientThunk = () => Promise<McpClientLike | undefined>;

/** One backend operation, rendered as MCP tool arguments or CLI flags by the transport. */
export interface RepoSearchBackendCall {
  readonly args: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly tool: string;
}

/** The normalized MCP result envelope both transports return. */
export interface RepoSearchBackendResult {
  readonly error: string | null;
  readonly isError: boolean;
  readonly text: string;
}

export interface RepoSearchTransport {
  readonly call: (call: RepoSearchBackendCall) => Promise<RepoSearchBackendResult>;
  readonly close: () => Promise<void>;
  readonly kind: RepoSearchTransportKind;
}

export type RepoSearchTransportKind = 'cli' | 'mcp';

export interface RepoSearchTransportOptions {
  readonly binary?: string;
  readonly executor?: CommandExecutor;
  readonly force?: 'cli' | 'mcp' | 'none';
  readonly mcpClientFactory?: (
    binary: string,
    serverArgs: readonly string[],
  ) => readonly McpClientThunk[];
  readonly serverArgs?: readonly string[];
}

export interface RepoSearchTransportProbe {
  readonly attempt: SearchAttempt;
  readonly transport: RepoSearchTransport | null;
}

const initializeTimeoutMs = 10_000;
const defaultCallTimeoutMs = 5 * 60_000;
const mcpProtocolVersion = '2025-06-18';

const backendResult = (
  content: ReadonlyArray<{ readonly text?: unknown; readonly type?: unknown }>,
  isError: boolean,
): RepoSearchBackendResult => {
  const text = content
    .map((item) => (typeof item.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n');
  return { error: isError ? text || 'backend error' : null, isError, text };
};

const fromSdkResult = (result: unknown): RepoSearchBackendResult => {
  const record = (result ?? {}) as {
    readonly content?: unknown;
    readonly isError?: unknown;
  };
  const content = Array.isArray(record.content) ? record.content : [];
  return backendResult(
    content as ReadonlyArray<{ readonly text?: unknown }>,
    record.isError === true,
  );
};

/** The zero-dependency stdio JSON-RPC client used when the SDK cannot be loaded. */
export const createBuiltinMcpClient = async (
  binary: string,
  serverArgs: readonly string[],
): Promise<McpClientLike | undefined> => {
  let server: ReturnType<typeof Bun.spawn> | undefined;
  try {
    server = Bun.spawn({
      cmd: [binary, ...serverArgs],
      stderr: 'pipe',
      stdin: 'pipe',
      stdout: 'pipe',
    });
  } catch {
    return undefined;
  }
  const process = server;
  let nextMessageId = 0;
  const pending = new Map<
    number,
    { readonly reject: (error: Error) => void; readonly resolve: (value: unknown) => void }
  >();
  const settle = (message: JsonRpcMessage): boolean => {
    if (typeof message.id !== 'number') {
      return false;
    }
    const waiter = pending.get(message.id);
    if (!waiter) {
      return false;
    }
    pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(String(message.error.message ?? 'MCP request failed.')));
    } else {
      waiter.resolve(message.result);
    }
    return true;
  };
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the stdio pump keeps framing, settle, and EOF transitions explicit.
  const pump = (async () => {
    const reader = (process.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            try {
              settle(JSON.parse(line) as JsonRpcMessage);
            } catch {
              // Ignore non-JSON server output.
            }
          }
          newline = buffer.indexOf('\n');
        }
      }
    } catch {
      // A failed read still ends the connection for every pending request.
    } finally {
      for (const waiter of [...pending.values()]) {
        waiter.reject(new Error('MCP server closed the connection.'));
      }
    }
  })();
  const writer = process.stdin as import('bun').FileSink;
  const request = async (
    method: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> => {
    const id = ++nextMessageId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      pending.set(id, {
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });
      writer.write(
        new TextEncoder().encode(
          `${JSON.stringify({ id, jsonrpc: '2.0', method, params: args })}\n`,
        ),
      );
      writer.flush();
    });
  };
  try {
    await request(
      'initialize',
      {
        capabilities: {},
        clientInfo: { name: 'repo-search', version: '1.0.0' },
        protocolVersion: mcpProtocolVersion,
      },
      initializeTimeoutMs,
    );
    writer.write(
      new TextEncoder().encode(
        `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
      ),
    );
    writer.flush();
  } catch {
    await process.kill(9);
    return undefined;
  }
  return {
    callTool: async (name, args, timeoutMs) =>
      fromSdkResult(
        await request('tools/call', { arguments: args, name }, timeoutMs ?? defaultCallTimeoutMs),
      ),
    close: async () => {
      await process.kill(9);
      await pump;
    },
  };
};

/** Loads the official MCP SDK client when the dependency is installed. */
export const createSdkMcpClient = async (
  binary: string,
  serverArgs: readonly string[],
): Promise<McpClientLike | undefined> => {
  try {
    const { Client } = (await import('@modelcontextprotocol/sdk/client/index.js')) as {
      readonly Client: new (
        info: { readonly name: string; readonly version: string },
        options?: { readonly capabilities?: Record<string, unknown> },
      ) => {
        readonly callTool: (request: {
          readonly arguments?: Record<string, string>;
          readonly name: string;
        }) => Promise<unknown>;
        readonly close: () => Promise<void>;
        readonly connect: (transport: unknown) => Promise<void>;
      };
    };
    const { StdioClientTransport } = (await import(
      '@modelcontextprotocol/sdk/client/stdio.js'
    )) as {
      readonly StdioClientTransport: new (options: {
        readonly args?: readonly string[];
        readonly command: string;
      }) => unknown;
    };
    const client = new Client({ name: 'repo-search', version: '1.0.0' }, { capabilities: {} });
    await client.connect(new StdioClientTransport({ args: serverArgs, command: binary }));
    return {
      callTool: async (name, args) =>
        fromSdkResult(await client.callTool({ arguments: args, name })),
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return undefined;
  }
};

const mcpTransport = (client: McpClientLike): RepoSearchTransport => ({
  call: (call) => client.callTool(call.tool, call.args, call.timeoutMs),
  close: async () => {
    try {
      await client.close();
    } catch {
      // Close failures are ignored so callers always settle.
    }
  },
  kind: 'mcp',
});

/** Parses the raw MCP result envelope the CLI prints and the SDK returns. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the line scanner keeps the envelope, noise, and raw-text transitions explicit.
export const parseBackendEnvelope = (raw: string): RepoSearchBackendResult => {
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as {
        readonly content?: unknown;
        readonly isError?: unknown;
      };
      if (!parsed || typeof parsed !== 'object' || !('content' in parsed)) {
        continue;
      }
      const content = Array.isArray(parsed.content) ? parsed.content : [];
      return backendResult(
        content as ReadonlyArray<{ readonly text?: unknown }>,
        parsed.isError === true,
      );
    } catch {
      // A non-JSON line is transport noise; keep scanning.
    }
  }
  return { error: raw.trim() ? null : 'empty backend response', isError: false, text: raw };
};

export const repoSearchBackendBinary = (override?: string): string =>
  override ?? Bun.env.REPO_SEARCH_BACKEND_BINARY ?? 'codebase-memory-mcp';

/** Renders one backend operation as the CLI transport command specification. */
export const repoSearchCliCommand = (
  call: RepoSearchBackendCall,
  binary?: string,
): CommandSpec => ({
  args: [
    'cli',
    '--quiet',
    '--json',
    call.tool,
    ...Object.entries(call.args).flatMap(([name, value]) => [`--${name}`, value]),
  ],
  command: binary ?? repoSearchBackendBinary(),
  environment: { REPO_SEARCH_LOG_LEVEL: 'error' },
  ...(call.timeoutMs ? { timeoutMs: call.timeoutMs } : {}),
});

const cliTransport = (executor: CommandExecutor, binary: string): RepoSearchTransport => ({
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the CLI adapter keeps the exit-code and envelope transitions explicit.
  call: async (call) => {
    let executed: Awaited<ReturnType<CommandExecutor>>;
    try {
      executed = await executor(repoSearchCliCommand(call, binary));
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        isError: true,
        text: '',
      };
    }
    const output = [executed.stdout, executed.stderr].filter(Boolean).join('\n');
    if (executed.code !== 0) {
      const envelope = parseBackendEnvelope(output);
      return envelope.isError
        ? envelope
        : { error: output || `Exit code ${executed.code}.`, isError: true, text: '' };
    }
    return parseBackendEnvelope(output);
  },
  close: async () => undefined,
  kind: 'cli',
});

const listProjectsCall: RepoSearchBackendCall = { args: {}, tool: 'list_projects' };

const defaultMcpClientFactory = (
  binary: string,
  serverArgs: readonly string[],
): readonly McpClientThunk[] => [
  () => createSdkMcpClient(binary, serverArgs),
  () => createBuiltinMcpClient(binary, serverArgs),
];

/**
 * Probes the backend transports once per run: the MCP stdio transport is primary and the
 * CLI transport is the fallback. The probe itself is the availability receipt.
 */
export const probeRepoSearchTransport = async (
  options: RepoSearchTransportOptions = {},
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the probe keeps the forced-transport, client-chain, and CLI fallback order explicit.
): Promise<RepoSearchTransportProbe> => {
  const binary = repoSearchBackendBinary(options.binary);
  const executor = options.executor ?? bunExecutor;
  const force = options.force ?? Bun.env.REPO_SEARCH_TRANSPORT_FORCE;
  if (force === 'none') {
    return {
      attempt: {
        command: `${binary} (stdio MCP / cli)`,
        detail: 'Skipped: transport disabled (REPO_SEARCH_TRANSPORT_FORCE=none).',
        status: 'skipped',
        strategy: 'transport-probe',
      },
      transport: null,
    };
  }
  if (force !== 'cli') {
    const serverArgs = options.serverArgs ?? [];
    const factory = options.mcpClientFactory ?? defaultMcpClientFactory;
    for (const createClient of factory(binary, serverArgs)) {
      let client: McpClientLike | undefined;
      try {
        client = await createClient();
      } catch {
        client = undefined;
      }
      if (!client) {
        continue;
      }
      try {
        const probe = await client.callTool(listProjectsCall.tool, listProjectsCall.args);
        if (!probe.isError) {
          return {
            attempt: {
              command: `${binary} (stdio MCP)`,
              detail: 'MCP stdio transport is primary and available (list_projects answered).',
              status: 'found',
              strategy: 'transport-probe',
            },
            transport: mcpTransport(client),
          };
        }
      } catch {
        // The probe call failed; fall through to the next client or transport.
      }
      try {
        await client.close();
      } catch {
        // A failed client close never blocks the next transport candidate.
      }
    }
    if (force === 'mcp') {
      return {
        attempt: {
          command: `${binary} (stdio MCP)`,
          detail: 'MCP transport forced but unavailable.',
          status: 'error',
          strategy: 'transport-probe',
        },
        transport: null,
      };
    }
  }
  const cli = cliTransport(executor, binary);
  const probe = await cli.call(listProjectsCall);
  if (!probe.isError) {
    return {
      attempt: {
        command: commandText(repoSearchCliCommand(listProjectsCall, binary)),
        detail:
          'MCP transport unavailable; CLI transport is the fallback and answered list_projects.',
        status: 'found',
        strategy: 'transport-probe',
      },
      transport: cli,
    };
  }
  return {
    attempt: {
      command: commandText(repoSearchCliCommand(listProjectsCall, binary)),
      detail: `No backend transport answered: ${probe.error ?? 'no response'}.`,
      status: 'error',
      strategy: 'transport-probe',
    },
    transport: null,
  };
};

const backendStorePatterns = [
  `${homedir()}/.cache/codebase-memory-mcp`,
  '/.cache/codebase-memory-mcp',
] as const;

/** Redacts backend storage paths so callers can never see or visit them. */
export const redactBackendStorePaths = (text: string): string => {
  let redacted = text;
  for (const pattern of backendStorePatterns) {
    redacted = redacted.split(pattern).join('<backend-store>');
  }
  return redacted;
};
