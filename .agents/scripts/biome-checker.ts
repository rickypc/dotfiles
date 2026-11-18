import { resolve } from 'node:path';
import { agentsRootOf } from '../utils/agents-root.js';
import type { CommandDeclaration } from '../utils/cli/declaration.js';
import { CliError } from '../utils/cli/errors.js';
import { runMain } from '../utils/cli/index.js';
import type { CheckResult, CommandSpec } from '../utils/contracts.js';
import { failed, normalizePaths, passed } from '../utils/contracts.js';
import { declarationOrderCheck } from '../utils/declaration-order.js';
import type { CommandExecutor } from '../utils/process.js';
import { bunExecutor } from '../utils/process.js';
import { hasFailure, summarizeChecks } from '../utils/validation.js';

export interface BiomeCheckerDependencies {
  readonly agentsRoot: string;
  readonly executor: CommandExecutor;
  readonly read: SourceReader;
}

export type SourceReader = (path: string) => Promise<string>;

export interface StaticCheckRequest {
  readonly agentsRoot: string;
  readonly paths: readonly string[];
}

const commandSpec = (executable: string, args: readonly string[], cwd: string): CommandSpec => ({
  args,
  command: executable,
  cwd,
});

const detail = (stdout: string, stderr: string): string =>
  [stdout, stderr].filter(Boolean).join('\n') || 'No diagnostic output.';

const sourcePath = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

const typeScriptPath = /\.(?:[cm]?ts|tsx)$/u;

const declarationOrderResult = async (
  paths: readonly string[],
  read: SourceReader,
): Promise<CheckResult> => {
  if (paths.length === 0) {
    return {
      detail: 'No TypeScript paths selected.',
      name: 'declaration-order',
      status: 'not-applicable',
    };
  }
  const checks = await Promise.all(
    paths.map(async (path) => ({
      path,
      result: declarationOrderCheck(path, await read(path)),
    })),
  );
  const nonPassing = checks.filter(({ result }) => result.status !== 'passed');
  if (nonPassing.length === 0) {
    return passed(
      'declaration-order',
      checks.map(({ path, result }) => `${path}: ${result.detail}`).join('\n'),
    );
  }
  if (nonPassing.some(({ result }) => result.status === 'blocked')) {
    return {
      detail: nonPassing.map(({ path, result }) => `${path}: ${result.detail}`).join('\n'),
      name: 'declaration-order',
      status: 'blocked',
    };
  }
  return failed(
    'declaration-order',
    nonPassing.map(({ path, result }) => `${path}: ${result.detail}`).join('\n'),
  );
};

export const runStaticChecks = async (
  executor: CommandExecutor,
  request: StaticCheckRequest,
  read: SourceReader = (path) => Bun.file(path).text(),
): Promise<CheckResult[]> => {
  const paths = request.paths.map((path) => resolve(path));
  const biome = executor(
    commandSpec(
      `${request.agentsRoot}/node_modules/.bin/biome`,
      [
        'check',
        '--config-path',
        `${request.agentsRoot}/biome.jsonc`,
        '--vcs-use-ignore-file=false',
        ...paths,
      ],
      request.agentsRoot,
    ),
  );
  const sourcePaths = paths.filter((path) => sourcePath.test(path));
  const typeScriptPaths = paths.filter((path) => typeScriptPath.test(path));
  const typeCheck =
    typeScriptPaths.length === 0
      ? undefined
      : executor(commandSpec('bun', ['check', ...typeScriptPaths], request.agentsRoot));
  const [biomeCommandResult, declarationOrder, typeCheckResult] = await Promise.all([
    biome,
    declarationOrderResult(sourcePaths, read),
    typeCheck ?? Promise.resolve(undefined),
  ]);
  const biomeResult =
    biomeCommandResult.code === 0
      ? passed('biome', detail(biomeCommandResult.stdout, biomeCommandResult.stderr))
      : failed('biome', detail(biomeCommandResult.stdout, biomeCommandResult.stderr));
  if (typeScriptPaths.length === 0) {
    return [
      biomeResult,
      {
        detail: 'No TypeScript paths selected.',
        name: 'bun-check',
        status: 'not-applicable',
      },
      declarationOrder,
    ];
  }
  return [
    biomeResult,
    typeCheckResult?.code === 0
      ? passed('bun-check', detail(typeCheckResult.stdout, typeCheckResult.stderr))
      : failed('bun-check', detail(typeCheckResult?.stdout ?? '', typeCheckResult?.stderr ?? '')),
    declarationOrder,
  ];
};

const defaultDependencies: BiomeCheckerDependencies = {
  agentsRoot: agentsRootOf(import.meta.dir),
  executor: bunExecutor,
  read: (path) => Bun.file(path).text(),
};

export const createCommand = (
  overrides: Partial<BiomeCheckerDependencies> = {},
): CommandDeclaration<readonly CheckResult[]> => {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    arity: [1, Number.POSITIVE_INFINITY],
    positionals: '<path>...',
    renderText: summarizeChecks,
    run: async (input) => {
      const results = await runStaticChecks(
        dependencies.executor,
        {
          agentsRoot: input.agentsRoot ?? dependencies.agentsRoot,
          paths: normalizePaths(input.positionals),
        },
        dependencies.read,
      );
      if (hasFailure(results)) {
        throw new CliError('Static checks failed.', 1, results);
      }
      return results;
    },
    script: 'scripts/biome-checker.ts',
    summary:
      'Run Biome, bun check, and declaration-order checks on selected JavaScript or TypeScript paths.',
  };
};

export const command = createCommand();

void runMain(command, import.meta.main);
