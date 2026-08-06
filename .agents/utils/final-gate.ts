import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface FinalGateConfig {
  readonly finalGate?: string;
}

export type FinalGateExecutor = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly stdio: 'pipe' | 'inherit' },
) => SpawnSyncReturns<Buffer>;

export interface FinalGateResult {
  readonly diagnostics: readonly string[];
  readonly exitCode: number;
  readonly gate: string;
  readonly receipt: string;
}

export interface ResolvedFinalGate {
  readonly command: string;
  readonly configPath: string;
  readonly source: 'default' | 'aidx-config-json';
}

export const defaultFinalGate = 'bun run test';

export const aidxConfigJsonPathFor = (projectRoot: string): string =>
  join(projectRoot, 'aidx.json');

const configError = (message: string): Error =>
  new Error(`AIDX final-gate configuration ${message}`);

export const finalGateFor = (config: FinalGateConfig): string => {
  const gate = config.finalGate?.trim();
  return gate || defaultFinalGate;
};

export const finalGateReceipt = (
  gate: string,
  exitCode: number,
  diagnostics: readonly string[] = [],
): string => {
  const status = `final gate: ${gate} ${exitCode === 0 ? 'passed' : 'failed'} (exit ${exitCode})`;
  return diagnostics.length > 0
    ? `${status}; diagnostics: ${diagnostics.join(' | ')}`
    : status;
};

export const gateDiagnosticsFor = (output: string): readonly string[] =>
  output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) =>
      /(?:error|fail(?:ed|ure)?|exception|coverage|exited with code|no tests)/iu.test(
        line,
      ),
    )
    .slice(-8);

export const executeFinalGate = (
  projectRoot: string,
  gate: string,
  execute: FinalGateExecutor = spawnSync,
): FinalGateResult => {
  const result = execute('/bin/sh', ['-lc', gate], {
    cwd: projectRoot,
    stdio: 'pipe',
  });
  const exitCode = result.status ?? 1;
  const output = [result.stdout?.toString(), result.stderr?.toString()]
    .filter(Boolean)
    .join('\n');
  const diagnostics = gateDiagnosticsFor(output);
  return {
    diagnostics,
    exitCode,
    gate,
    receipt: finalGateReceipt(gate, exitCode, diagnostics),
  };
};

const loadJsonConfig = async (configPath: string): Promise<FinalGateConfig> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
  } catch (error: unknown) {
    throw configError(
      `file could not be loaded: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  const value = parsed;
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    ('finalGate' in value &&
      typeof (value as { finalGate?: unknown }).finalGate !== 'string')
  ) {
    throw configError('file must contain an object with a string finalGate.');
  }
  return value as FinalGateConfig;
};

export const resolveFinalGate = async (
  projectRoot: string,
): Promise<ResolvedFinalGate> => {
  if (!projectRoot.startsWith('/')) {
    throw configError('requires an absolute project root.');
  }
  const jsonPath = aidxConfigJsonPathFor(projectRoot);
  if (existsSync(jsonPath)) {
    return {
      command: finalGateFor(await loadJsonConfig(jsonPath)),
      configPath: jsonPath,
      source: 'aidx-config-json',
    };
  }
  return {
    command: defaultFinalGate,
    configPath: jsonPath,
    source: 'default',
  };
};
