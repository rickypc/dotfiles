import type { CheckResult, CommandSpec } from './contracts.js';
import { failed, passed } from './contracts.js';
import { declarationOrderCheck } from './declaration-order.js';
import type { CommandExecutor } from './process.js';

export type SourceReader = (path: string) => Promise<string>;

export interface StaticCheckRequest {
  readonly agentsRoot: string;
  readonly paths: readonly string[];
}

const command = (executable: string, args: readonly string[]): CommandSpec => ({
  args,
  command: executable,
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
      detail: nonPassing
        .map(({ path, result }) => `${path}: ${result.detail}`)
        .join('\n'),
      name: 'declaration-order',
      status: 'blocked',
    };
  }
  return failed(
    'declaration-order',
    nonPassing
      .map(({ path, result }) => `${path}: ${result.detail}`)
      .join('\n'),
  );
};

export const runStaticChecks = async (
  executor: CommandExecutor,
  request: StaticCheckRequest,
  read: SourceReader = (path) => Bun.file(path).text(),
): Promise<CheckResult[]> => {
  const biome = executor(
    command(`${request.agentsRoot}/node_modules/.bin/biome`, [
      'check',
      '--config-path',
      `${request.agentsRoot}/biome.jsonc`,
      ...request.paths,
    ]),
  );
  const sourcePaths = request.paths.filter((path) => sourcePath.test(path));
  const typeScriptPaths = request.paths.filter((path) =>
    typeScriptPath.test(path),
  );
  const typeCheck =
    typeScriptPaths.length === 0
      ? undefined
      : executor(
          command(`${request.agentsRoot}/node_modules/.bin/tsc`, [
            '--noEmit',
            '--ignoreConfig',
            '--strict',
            '--module',
            'nodenext',
            '--moduleResolution',
            'nodenext',
            '--target',
            'esnext',
            '--typeRoots',
            `${request.agentsRoot}/node_modules/@types`,
            '--types',
            'bun',
            ...typeScriptPaths,
          ]),
        );
  const [biomeCommandResult, declarationOrder, typeCheckResult] =
    await Promise.all([
      biome,
      declarationOrderResult(sourcePaths, read),
      typeCheck ?? Promise.resolve(undefined),
    ]);
  const biomeResult =
    biomeCommandResult.code === 0
      ? passed(
          'biome',
          detail(biomeCommandResult.stdout, biomeCommandResult.stderr),
        )
      : failed(
          'biome',
          detail(biomeCommandResult.stdout, biomeCommandResult.stderr),
        );
  if (typeScriptPaths.length === 0) {
    return [
      biomeResult,
      {
        detail: 'No TypeScript paths selected.',
        name: 'tsc',
        status: 'not-applicable',
      },
      declarationOrder,
    ];
  }
  return [
    biomeResult,
    typeCheckResult?.code === 0
      ? passed('tsc', detail(typeCheckResult.stdout, typeCheckResult.stderr))
      : failed(
          'tsc',
          detail(typeCheckResult?.stdout ?? '', typeCheckResult?.stderr ?? ''),
        ),
    declarationOrder,
  ];
};
