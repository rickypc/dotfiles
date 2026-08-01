import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  finalGateFor,
  finalGateReceipt,
  parseAidlcGateConfig,
} from '../../utils/aidlc/gate.js';
import { runWhenMain as runCliWhenMain } from '../../utils/cli.js';

const configPathFor = (projectRoot: string): string =>
  join(projectRoot, 'aidlc.config.json');

export const resolveFinalGate = (projectRoot: string): string => {
  if (!projectRoot.startsWith('/')) {
    throw new Error('AIDLC gate requires an absolute project root.');
  }
  const configPath = configPathFor(projectRoot);
  return finalGateFor(
    existsSync(configPath)
      ? parseAidlcGateConfig(readFileSync(configPath, 'utf8'))
      : {},
  );
};

export const usage = (): string =>
  'Usage: bun ~/.agents/scripts/aidlc/gate.ts <resolve|run> <absolute-project-root>';

export const run = (
  args: readonly string[],
  write: (message: string) => void = console.log,
  execute: typeof spawnSync = spawnSync,
): void => {
  const [command, projectRoot] = args;
  if (
    !projectRoot ||
    args.length !== 2 ||
    !['resolve', 'run'].includes(command)
  ) {
    throw new Error(usage());
  }
  const gate = resolveFinalGate(projectRoot);
  if (command === 'resolve') {
    write(gate);
    return;
  }
  const result = execute('/bin/sh', ['-lc', gate], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  const exitCode = result.status ?? 1;
  write(finalGateReceipt(gate, exitCode));
  if (exitCode !== 0) process.exitCode = exitCode;
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
