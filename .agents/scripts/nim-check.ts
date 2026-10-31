// bun scripts/nim-check.ts

const { NVIDIA_API_KEY } = Bun.env;

interface BenchResult {
  'Model Name': string;
  'Response / Error Detail': string;
  'Status Code': string | number;
  'Total Time (ms)': string | number;
  'TTFT (ms)': string | number;
}

interface DeltaChunk {
  content: string;
  reasoning: number;
}

interface StreamStats {
  contentParts: string[];
  reasoningChars: number;
  startTime: number;
  ttftMs: string | number;
}

const GLM_THINKING_MODELS = ['z-ai/glm-5.3-flash'];
const MODELS: string[] = [
  'deepseek-ai/deepseek-v4.1-flash',
  'google/gemma-4-31b-it',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'stepfun-ai/step-5-preview',
  'z-ai/glm-5.3-flash',
];
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const TEST_PROMPT = 'Respond with exactly the single word: Pong.';
const USAGE =
  'Usage: bun <agents-root>/scripts/nim-check.ts   # benchmark the configured NIM models';

const chunkDelta = (dataStr: string): DeltaChunk | null => {
  let chunk: unknown;
  try {
    chunk = JSON.parse(dataStr);
  } catch {
    // A malformed chunk contributes no content.
    return null;
  }

  const choices = (chunk as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const delta = (choices[0] as { delta?: unknown }).delta;
  if (typeof delta !== 'object' || delta === null) {
    return null;
  }

  const fields = delta as Record<string, unknown>;
  const content = fields.content;
  const reasoning = fields.reasoning_content;
  return {
    content: typeof content === 'string' ? content : '',
    reasoning: typeof reasoning === 'string' ? reasoning.length : 0,
  };
};

const errorDetail = (envelope: unknown): string | null => {
  if (typeof envelope !== 'object' || envelope === null || !('error' in envelope)) {
    return null;
  }
  const detail = (envelope as { error: unknown }).error;
  if (typeof detail === 'object' && detail !== null && 'message' in detail) {
    return String((detail as { message: unknown }).message);
  }
  return typeof detail === 'string' ? detail : null;
};

const failureFor = (err: unknown): { detail: string; status: string } => {
  if (err instanceof Error && err.name === 'AbortError') {
    return { detail: 'Stream or connection boundary crossed 30s limit.', status: 'TIMEOUT' };
  }
  if (err instanceof Error && err.message !== '') {
    return { detail: err.message, status: 'CONN_ERR' };
  }
  return { detail: 'Network exception occurred.', status: 'CONN_ERR' };
};

const helpRequested = (): boolean =>
  Bun.argv.slice(2).some((arg) => arg === '--help' || arg === '-h');

const parsedMessage = (payload: string): string | null => {
  try {
    return errorDetail(JSON.parse(payload));
  } catch {
    // An unparseable payload yields no message; the caller keeps scanning.
    return null;
  }
};

const errorMessageFrom = (body: string): string => {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
      const message = parsedMessage(trimmed.slice(6));
      if (message !== null) {
        return message;
      }
    }
  }

  const whole = parsedMessage(body);
  return whole ?? 'Unknown API error.';
};

const payloadFor = (modelName: string): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    max_tokens: 500,
    messages: [{ content: TEST_PROMPT, role: 'user' }],
    model: modelName,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    top_p: 0.9,
  };

  if (GLM_THINKING_MODELS.includes(modelName)) {
    payload.max_tokens = 2048;
    payload.reasoning_effort = 'low';
  }

  return payload;
};

const pendingResultFor = (modelName: string): BenchResult => ({
  'Model Name': modelName,
  'Response / Error Detail': 'None',
  'Status Code': 'UNKNOWN',
  'Total Time (ms)': 'N/A',
  'TTFT (ms)': 'N/A',
});

const recordChunk = (stats: StreamStats, dataStr: string): void => {
  const delta = chunkDelta(dataStr);
  if (delta === null) {
    return;
  }

  stats.reasoningChars += delta.reasoning;
  if (delta.content.length > 0) {
    stats.contentParts.push(delta.content);
    if (stats.ttftMs === 'N/A') {
      stats.ttftMs = Math.round(performance.now() - stats.startTime);
    }
  }
};

const consumeChunk = (stats: StreamStats, dataStr: string): boolean => {
  if (dataStr === '[DONE]') {
    return true;
  }
  recordChunk(stats, dataStr);
  return false;
};

const consumeLines = (lines: readonly string[], stats: StreamStats): boolean => {
  for (const line of lines) {
    const cleaned = line.trim();
    if (cleaned.startsWith('data:')) {
      const finished = consumeChunk(stats, cleaned.slice(5).trim());
      if (finished) {
        return true;
      }
    }
  }
  return false;
};

const readDrain = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  stats: StreamStats,
): Promise<void> => {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    if (consumeLines(lines, stats)) {
      return;
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith('data:')) {
    consumeChunk(stats, tail.slice(5).trim());
  }
};

const finalizeStream = async (
  result: BenchResult,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  startTime: number,
  timeoutId: ReturnType<typeof setTimeout>,
): Promise<BenchResult> => {
  const stats: StreamStats = {
    contentParts: [],
    reasoningChars: 0,
    startTime,
    ttftMs: 'N/A',
  };
  await readDrain(reader, stats);
  clearTimeout(timeoutId);

  result['TTFT (ms)'] = stats.ttftMs;
  result['Total Time (ms)'] = Math.round(performance.now() - startTime);
  const content = stats.contentParts.join('').trim();
  if (content.length > 0) {
    result['Response / Error Detail'] = content;
  } else {
    result['Response / Error Detail'] =
      stats.reasoningChars > 0
        ? 'No final content in response (reasoning only)'
        : 'No content in response';
  }
  return result;
};

async function benchmarkModel(modelName: string): Promise<BenchResult> {
  const result = pendingResultFor(modelName);
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(NVIDIA_API_URL, {
      body: JSON.stringify(payloadFor(modelName)),
      headers: { Authorization: `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    });

    result['Status Code'] = response.status;
    if (!response.ok) {
      result['Response / Error Detail'] = errorMessageFrom(await response.text());
      return result;
    }

    const reader = response.body?.getReader();
    if (reader === undefined) {
      result['Response / Error Detail'] = 'Readable stream unreadable.';
      return result;
    }

    return await finalizeStream(result, reader, startTime, timeoutId);
  } catch (err: unknown) {
    const failure = failureFor(err);
    result['Status Code'] = failure.status;
    result['Response / Error Detail'] = failure.detail;
  } finally {
    clearTimeout(timeoutId);
  }

  return result;
}

async function main() {
  const selectedModels = [...MODELS].sort(() => 0.5 - Math.random());
  console.log(`\n🚀 Initializing benchmark across ${selectedModels.length} NIM targets...`);
  console.log(`📝 Using prompt: "${TEST_PROMPT}"\n`);
  const results = await Promise.all(selectedModels.map((model) => benchmarkModel(model)));
  console.table(results, [
    'Model Name',
    'Status Code',
    'TTFT (ms)',
    'Total Time (ms)',
    'Response / Error Detail',
  ]);
}

if (helpRequested()) {
  console.log(USAGE);
  process.exit(0);
}

if (!NVIDIA_API_KEY) {
  console.error('❌ Error: NVIDIA_API_KEY is missing. Make sure Bun is picking up your env file.');
  process.exit(1);
}

await main();
