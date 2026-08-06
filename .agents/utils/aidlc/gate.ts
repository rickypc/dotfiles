import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AidlcGateConfig {
  readonly finalGate?: string;
}

export type AidlcGateExecutor = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly stdio: 'pipe' },
) => SpawnSyncReturns<Buffer>;

export interface AidlcGateResult {
  readonly diagnostics: readonly string[];
  readonly exitCode: number;
  readonly gate: string;
  readonly receipt: string;
}

export interface AidlcResolvedGate {
  readonly command: string;
  readonly configPath: string;
  readonly source: 'default' | 'project-config';
}

export const aidlcGateConfigPathFor = (projectRoot: string): string =>
  join(projectRoot, 'aidlc.config.json');

export const finalGateFor = (config: AidlcGateConfig): string => {
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
  execute: AidlcGateExecutor = spawnSync,
): AidlcGateResult => {
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

export const parseAidlcGateConfig = (content: string): AidlcGateConfig => {
  if (!content.trim()) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AIDLC gate configuration must be valid JSON.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    ('finalGate' in parsed &&
      typeof (parsed as { finalGate?: unknown }).finalGate !== 'string')
  ) {
    throw new Error(
      'AIDLC gate configuration must contain a string finalGate.',
    );
  }
  return parsed as AidlcGateConfig;
};

export const resolveAidlcGate = (projectRoot: string): AidlcResolvedGate => {
  if (!projectRoot.startsWith('/')) {
    throw new Error('AIDLC gate requires an absolute project root.');
  }
  const configPath = aidlcGateConfigPathFor(projectRoot);
  const configured = existsSync(configPath);
  return {
    command: finalGateFor(
      configured ? parseAidlcGateConfig(readFileSync(configPath, 'utf8')) : {},
    ),
    configPath,
    source: configured ? 'project-config' : 'default',
  };
};

export const resolveFinalGate = (projectRoot: string): string =>
  resolveAidlcGate(projectRoot).command;

export const defaultFinalGate = 'bun run test';
