import { runWhenMain as runCliWhenMain } from '../utils/cli.js';
import { normalizePaths } from '../utils/contracts.js';
import {
  declarationOrderDetail,
  declarationOrderResult,
  fixDeclarationOrder,
  inspectDeclarationOrder,
} from '../utils/declaration-order.js';

interface DeclarationOrderScriptCheck {
  readonly actionPacket: NonNullable<
    ReturnType<typeof inspectDeclarationOrder>['packet']
  > | null;
  readonly detail: string;
  readonly path: string;
  readonly status: 'blocked' | 'failed' | 'passed';
}

const checkPath = async (
  path: string,
  apply: boolean,
  read: (path: string) => Promise<string>,
  save: (path: string, source: string) => Promise<unknown>,
): Promise<DeclarationOrderScriptCheck> => {
  const source = await read(path);
  const fixed = apply ? fixDeclarationOrder(path, source) : undefined;
  const report = fixed?.report ?? inspectDeclarationOrder(path, source);
  const check = declarationOrderResult(report);
  if (fixed?.changed && check.status === 'passed') {
    await save(path, fixed.source);
  }
  return {
    actionPacket: report.packet ?? null,
    detail: declarationOrderDetail(report),
    path,
    status: check.status,
  };
};

export const usage = (): string =>
  'Usage: bun <agents-root>/scripts/declaration-order.ts <path>; use the biome-tsc-checker command catalog for apply and summary variants.';

export const run = async (
  args: readonly string[],
  read: (path: string) => Promise<string> = (path) => Bun.file(path).text(),
  write: (message: string) => void = console.log,
  save: (path: string, source: string) => Promise<unknown> = Bun.write,
): Promise<void> => {
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  if ([...flags].some((flag) => flag !== '--apply' && flag !== '--summary')) {
    throw new Error(usage());
  }
  const apply = flags.has('--apply');
  const summary = flags.has('--summary');
  const paths = normalizePaths(args.filter((arg) => !arg.startsWith('--')));
  if (apply && paths.length !== 1) {
    throw new Error(
      'Declaration-order --apply accepts exactly one file; inspect all files first and apply one emitted packet at a time.',
    );
  }
  const checks: DeclarationOrderScriptCheck[] = [];
  for (const path of paths) {
    checks.push(await checkPath(path, apply, read, save));
  }
  const nonPassing = checks.filter((check) => check.status !== 'passed');
  if (summary) {
    write(
      nonPassing.length === 0
        ? `declaration-order: passed — ${checks.length} file(s) checked.`
        : `declaration-order: failed — ${nonPassing.length} of ${checks.length} file(s) need attention.\n${JSON.stringify({ errors: nonPassing }, null, 2)}`,
    );
  } else {
    write(JSON.stringify({ checks }, null, 2));
  }
  if (nonPassing.some((check) => check.status === 'failed')) {
    throw new Error('Declaration ordering requires the emitted action packet.');
  }
  if (nonPassing.some((check) => check.status === 'blocked')) {
    throw new Error(
      'Declaration ordering is blocked by the reported dependency.',
    );
  }
};

export const runWhenMain = runCliWhenMain;

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
