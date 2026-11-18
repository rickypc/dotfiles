import type { CommandDeclaration } from '../utils/cli/declaration.js';
import { CliError } from '../utils/cli/errors.js';
import { runMain } from '../utils/cli/index.js';
import { UsageError } from '../utils/cli/usage-error.js';
import { normalizePaths } from '../utils/contracts.js';
import {
  declarationOrderDetail,
  declarationOrderResult,
  fixDeclarationOrder,
  inspectDeclarationOrder,
} from '../utils/declaration-order.js';

export type DeclarationOrderData =
  | { readonly checks: readonly DeclarationOrderScriptCheck[] }
  | { readonly errors: readonly DeclarationOrderScriptCheck[]; readonly summary: string };

export interface DeclarationOrderDependencies {
  readonly read: (path: string) => Promise<string>;
  readonly save: (path: string, source: string) => Promise<unknown>;
}

export interface DeclarationOrderScriptCheck {
  readonly actionPacket: NonNullable<ReturnType<typeof inspectDeclarationOrder>['packet']> | null;
  readonly detail: string;
  readonly path: string;
  readonly status: 'blocked' | 'failed' | 'passed';
}

const checkPath = async (
  path: string,
  apply: boolean,
  dependencies: DeclarationOrderDependencies,
): Promise<DeclarationOrderScriptCheck> => {
  const source = await dependencies.read(path);
  const fixed = apply ? fixDeclarationOrder(path, source) : undefined;
  const report = fixed?.report ?? inspectDeclarationOrder(path, source);
  const check = declarationOrderResult(report);
  if (fixed?.changed && check.status === 'passed') {
    await dependencies.save(path, fixed.source);
  }
  return {
    actionPacket: report.packet ?? null,
    detail: declarationOrderDetail(report),
    path,
    status: check.status,
  };
};

const failureOf = (checks: readonly DeclarationOrderScriptCheck[]): string | undefined => {
  if (checks.some((check) => check.status === 'failed')) {
    return 'Declaration ordering requires the emitted action packet.';
  }
  return checks.some((check) => check.status === 'blocked')
    ? 'Declaration ordering is blocked by the reported dependency.'
    : undefined;
};

const renderData = (data: DeclarationOrderData): string => {
  if (!('summary' in data)) {
    return JSON.stringify(data, null, 2);
  }
  return data.errors.length === 0
    ? data.summary
    : `${data.summary}\n${JSON.stringify({ errors: data.errors }, null, 2)}`;
};

const summaryData = (checks: readonly DeclarationOrderScriptCheck[]): DeclarationOrderData => {
  const errors = checks.filter((check) => check.status !== 'passed');
  return {
    errors,
    summary:
      errors.length === 0
        ? `declaration-order: passed - ${checks.length} file(s) checked.`
        : `declaration-order: failed - ${errors.length} of ${checks.length} file(s) need attention.`,
  };
};

export const createCommand = (
  dependencies: DeclarationOrderDependencies = {
    read: (path) => Bun.file(path).text(),
    save: Bun.write,
  },
): CommandDeclaration<DeclarationOrderData> => ({
  arity: [1, Number.POSITIVE_INFINITY],
  options: {
    apply: {
      description: 'Execute the emitted safe action packet for exactly one allowed path.',
      type: 'boolean',
    },
    summary: {
      description: 'Print the concise gate summary and only the non-passing checks.',
      type: 'boolean',
    },
  },
  positionals: '<path>...',
  renderText: renderData,
  run: async (input) => {
    const apply = input.values.apply === true;
    const paths = normalizePaths(input.positionals);
    if (apply && paths.length !== 1) {
      throw new UsageError(
        'Declaration-order --apply accepts exactly one file; inspect all files first and apply one emitted packet at a time.',
      );
    }
    const checks: DeclarationOrderScriptCheck[] = [];
    for (const path of paths) {
      checks.push(await checkPath(path, apply, dependencies));
    }
    const data = input.values.summary === true ? summaryData(checks) : { checks };
    const failure = failureOf(checks);
    if (failure) {
      throw new CliError(failure, 1, data);
    }
    return data;
  },
  script: 'scripts/declaration-order.ts',
  summary:
    'Check top-level declaration order; use --apply only to execute the emitted safe action packet for one allowed path, then rerun the identical check.',
});

export const command = createCommand();

void runMain(command, import.meta.main);
