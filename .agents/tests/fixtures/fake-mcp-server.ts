// Test fixture: a minimal stdio MCP server. It reads newline-delimited JSON-RPC from
// stdin, answers `initialize`, `tools/list`, and `tools/call` with fixed results, and
// exits when stdin closes. It exists only to exercise the wrapper's MCP clients.

const write = (message: Record<string, unknown>): void => {
  Bun.stdout.write(`${JSON.stringify(message)}\n`);
};

let buffer = '';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the fixture dispatch keeps every protocol branch explicit.
const dispatch = (line: string): void => {
  let message: { readonly id?: unknown; readonly method?: unknown; readonly params?: unknown };
  try {
    message = JSON.parse(line) as typeof message;
  } catch {
    return;
  }
  if (message.method === 'initialize' && message.id !== undefined) {
    const params = (message.params ?? {}) as { readonly protocolVersion?: string };
    write({
      id: message.id,
      jsonrpc: '2.0',
      result: {
        capabilities: {},
        protocolVersion: params.protocolVersion ?? '2025-06-18',
        serverInfo: { name: 'fixture', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/list' && message.id !== undefined) {
    write({ id: message.id, jsonrpc: '2.0', result: { tools: [] } });
    return;
  }
  if (message.method === 'tools/call' && message.id !== undefined) {
    const params = (message.params ?? {}) as { readonly name?: string };
    if (params.name === 'hang') {
      return;
    }
    write({
      id: message.id,
      jsonrpc: '2.0',
      result: {
        content: [{ text: `fixture:${params.name ?? 'unknown'}`, type: 'text' }],
        isError: false,
      },
    });
  }
};

const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) {
    break;
  }
  buffer += decoder.decode(value);
  let newline = buffer.indexOf('\n');
  while (newline >= 0) {
    dispatch(buffer.slice(0, newline));
    buffer = buffer.slice(newline + 1);
    newline = buffer.indexOf('\n');
  }
}
