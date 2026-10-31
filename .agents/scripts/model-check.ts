// bun scripts/model-check.ts

import { runWhenMain as runCliWhenMain } from '../utils/cli.js';

export interface BenchResult {
  'Model Name': string;
  'Response / Error Detail': string;
  'Status Code': string | number;
  'Total Time (ms)': string | number;
  'TTFT (ms)': string | number;
}

export interface DeltaChunk {
  content: string;
  reasoning: number;
}

export type EnvReader = (source: Readonly<Record<string, string | undefined>>) => ModelCheckEnv;

export interface ModelCheckBoundaries {
  readonly clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
  readonly error: (message: string) => void;
  readonly exit: (code: number) => void;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly log: (message: string) => void;
  readonly now: () => number;
  readonly random: () => number;
  readonly setTimeout: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly table: (rows: readonly BenchResult[]) => void;
}

export interface ModelCheckEnv {
  readonly API_KEY?: string;
  readonly API_URL?: string;
  readonly MODELS?: string;
  readonly PROMPT?: string;
  readonly THINKING_MODELS?: string;
}

export interface StreamStats {
  contentParts: string[];
  reasoningChars: number;
  startTime: number;
  ttftMs: string | number;
}

export const BENCH_COLUMNS = [
  'Model Name',
  'Status Code',
  'TTFT (ms)',
  'Total Time (ms)',
  'Response / Error Detail',
] as const;

const FALLBACK_PROMPT = 'Respond with exactly the single word: Pong.';
const MISSING_CONFIG = 'Missing endpoint configuration; check the .env file for this project.';
const TIMEOUT_MS = 30_000;
const USAGE =
  'Usage: bun <agents-root>/scripts/model-check.ts   # benchmark the configured endpoint models';

export const chunkDelta = (dataStr: string): DeltaChunk | null => {
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

export const errorDetail = (envelope: unknown): string | null => {
  if (typeof envelope !== 'object' || envelope === null || !('error' in envelope)) {
    return null;
  }
  const detail = (envelope as { error: unknown }).error;
  if (typeof detail === 'object' && detail !== null && 'message' in detail) {
    return String((detail as { message: unknown }).message);
  }
  return typeof detail === 'string' ? detail : null;
};

export const failureFor = (err: unknown): { detail: string; status: string } => {
  if (err instanceof Error && err.name === 'AbortError') {
    return { detail: 'Stream or connection boundary crossed 30s limit.', status: 'TIMEOUT' };
  }
  if (err instanceof Error && err.message !== '') {
    return { detail: err.message, status: 'CONN_ERR' };
  }
  return { detail: 'Network exception occurred.', status: 'CONN_ERR' };
};

const helpRequested = (args: readonly string[]): boolean =>
  args.some((arg) => arg === '--help' || arg === '-h');

export const parsedMessage = (payload: string): string | null => {
  try {
    return errorDetail(JSON.parse(payload));
  } catch {
    // An unparseable payload yields no message; the caller keeps scanning.
    return null;
  }
};

export const errorMessageFrom = (body: string): string => {
  for (const line of body.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('data: ') && trimmedLine.slice(6) !== '[DONE]') {
      const message = parsedMessage(trimmedLine.slice(6));
      if (message !== null) {
        return message;
      }
    }
  }

  const whole = parsedMessage(body);
  return whole ?? 'Unknown API error.';
};

export const pendingResultFor = (modelName: string): BenchResult => ({
  'Model Name': modelName,
  'Response / Error Detail': 'None',
  'Status Code': 'UNKNOWN',
  'Total Time (ms)': 'N/A',
  'TTFT (ms)': 'N/A',
});

export const processExitCode = (
  code: number,
  target: { exitCode?: number | string | null } = process,
): void => {
  target.exitCode = code;
};

export const readEnv: EnvReader = (source) => ({
  API_KEY: source.API_KEY,
  API_URL: source.API_URL,
  MODELS: source.MODELS,
  PROMPT: source.PROMPT,
  THINKING_MODELS: source.THINKING_MODELS,
});

export const readLog = (message: string, writer: (message: string) => void): void => {
  writer(message);
};

export const cliBoundaries = (
  out: { readonly error: (message: string) => void; readonly log: (message: string) => void } = {
    error: console.error,
    log: console.log,
  },
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
): ModelCheckBoundaries => ({
  clearTimeout,
  error: (message) => readLog(message, out.error),
  exit: processExitCode,
  fetch: send,
  log: (message) => readLog(message, out.log),
  now: () => performance.now(),
  random: Math.random,
  setTimeout,
  table: console.table,
});

export const recordChunk = (stats: StreamStats, dataStr: string, now: () => number): void => {
  const delta = chunkDelta(dataStr);
  if (delta === null) {
    return;
  }

  stats.reasoningChars += delta.reasoning;
  if (delta.content.length > 0) {
    stats.contentParts.push(delta.content);
    if (stats.ttftMs === 'N/A') {
      stats.ttftMs = Math.round(now() - stats.startTime);
    }
  }
};

export const consumeChunk = (stats: StreamStats, dataStr: string, now: () => number): boolean => {
  if (dataStr === '[DONE]') {
    return true;
  }
  recordChunk(stats, dataStr, now);
  return false;
};

export const consumeLines = (
  lines: readonly string[],
  stats: StreamStats,
  now: () => number,
): boolean => {
  for (const line of lines) {
    const cleaned = line.trim();
    if (cleaned.startsWith('data:')) {
      const finished = consumeChunk(stats, cleaned.slice(5).trim(), now);
      if (finished) {
        return true;
      }
    }
  }
  return false;
};

export const splitList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const trimmed = (value: string | undefined): string => (value ?? '').trim();

export const missingConfigFrom = (env: ModelCheckEnv): string[] =>
  [
    ['MODELS', trimmed(env.MODELS)],
    ['API_URL', trimmed(env.API_URL)],
    ['API_KEY', trimmed(env.API_KEY)],
  ]
    .filter(([, value]) => value.length === 0)
    .map(([key]) => key as string);

export const promptFrom = (env: ModelCheckEnv): string => {
  const prompt = trimmed(env.PROMPT);
  return prompt.length === 0 ? FALLBACK_PROMPT : prompt;
};

export const readDrain = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  stats: StreamStats,
  now: () => number,
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
    if (consumeLines(lines, stats, now)) {
      return;
    }
  }

  const tail = trimmed(buffer);
  if (tail.startsWith('data:')) {
    consumeChunk(stats, tail.slice(5).trim(), now);
  }
};

export const finalizeStream = async (
  result: BenchResult,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  startTime: number,
  timeoutId: ReturnType<typeof setTimeout>,
  boundaries: ModelCheckBoundaries,
): Promise<BenchResult> => {
  const stats: StreamStats = {
    contentParts: [],
    reasoningChars: 0,
    startTime,
    ttftMs: 'N/A',
  };
  await readDrain(reader, stats, boundaries.now);
  boundaries.clearTimeout(timeoutId);

  result['TTFT (ms)'] = stats.ttftMs;
  result['Total Time (ms)'] = Math.round(boundaries.now() - startTime);
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

export const uniqueList = (value: string | undefined): string[] => [...new Set(splitList(value))];

export const modelsFrom = (env: ModelCheckEnv): string[] => uniqueList(env.MODELS);

export const thinkingModelsFrom = (env: ModelCheckEnv): string[] => uniqueList(env.THINKING_MODELS);

export const payloadFor = (modelName: string, env: ModelCheckEnv): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    max_tokens: 500,
    messages: [{ content: promptFrom(env), role: 'user' }],
    model: modelName,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    top_p: 0.9,
  };

  if (thinkingModelsFrom(env).includes(modelName)) {
    payload.max_tokens = 2048;
    payload.reasoning_effort = 'low';
  }

  return payload;
};

export const benchmarkModel = async (
  modelName: string,
  env: ModelCheckEnv,
  boundaries: ModelCheckBoundaries,
): Promise<BenchResult> => {
  const result = pendingResultFor(modelName);
  const startTime = boundaries.now();
  const controller = new AbortController();
  const timeoutId = boundaries.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await boundaries.fetch(trimmed(env.API_URL), {
      body: JSON.stringify(payloadFor(modelName, env)),
      headers: {
        Authorization: `Bearer ${trimmed(env.API_KEY)}`,
        'Content-Type': 'application/json',
      },
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

    return await finalizeStream(result, reader, startTime, timeoutId, boundaries);
  } catch (err: unknown) {
    const failure = failureFor(err);
    result['Status Code'] = failure.status;
    result['Response / Error Detail'] = failure.detail;
  } finally {
    boundaries.clearTimeout(timeoutId);
  }

  return result;
};

export const runBenchmark = async (
  env: ModelCheckEnv,
  boundaries: ModelCheckBoundaries,
): Promise<number> => {
  const missing = missingConfigFrom(env);
  if (missing.length > 0) {
    boundaries.error(`❌ Error: ${missing.join(', ')} is missing. ${MISSING_CONFIG}`);
    return 1;
  }

  const selectedModels = modelsFrom(env).sort(() => 0.5 - boundaries.random());
  boundaries.log(`\n🚀 Initializing benchmark across ${selectedModels.length} endpoint targets...`);
  boundaries.log(`📝 Using prompt: "${promptFrom(env)}"\n`);
  const results = await Promise.all(
    selectedModels.map((model) => benchmarkModel(model, env, boundaries)),
  );
  boundaries.table(results);
  return 0;
};

export const runCli = async (
  isMain: boolean,
  boundaries: ModelCheckBoundaries,
  env: ModelCheckEnv,
): Promise<void> => {
  if (!isMain) {
    return;
  }
  boundaries.exit(await runBenchmark(env, boundaries));
};

export const usage = (): string => USAGE;

export const run = async (
  args: readonly string[],
  injected?: ModelCheckBoundaries,
  source?: ModelCheckEnv,
): Promise<number> => {
  const boundaries: ModelCheckBoundaries = injected ?? cliBoundaries();
  const env: ModelCheckEnv = source ?? readEnv(Bun.env);
  if (helpRequested(args)) {
    boundaries.log(usage());
    return 0;
  }
  await runCli(true, boundaries, env);
  return 0;
};

export const runWhenMain = runCliWhenMain;

void runWhenMain(import.meta.main, Bun.argv.slice(2), run);
