import { agentsRootOf } from '../../utils/agents-root.js';
import type { CommandDeclaration } from '../../utils/cli/declaration.js';
import { CliError } from '../../utils/cli/errors.js';
import { runMain } from '../../utils/cli/index.js';
import {
  checkImmutableAgentsConfig,
  type ImmutableAgentsConfigReceipt,
} from '../../utils/immutable-agents-config.js';
import { bunExecutor } from '../../utils/process.js';

export interface ImmutableConfigDependencies {
  readonly agentsRoot: string;
  readonly executor: typeof bunExecutor;
}

export const createCommand = (
  dependencies: ImmutableConfigDependencies = {
    agentsRoot: agentsRootOf(import.meta.dir),
    executor: bunExecutor,
  },
): CommandDeclaration<ImmutableAgentsConfigReceipt> => ({
  arity: [0, 0],
  renderText: (receipt) => receipt.detail,
  run: async (input) => {
    const receipt = await checkImmutableAgentsConfig(
      dependencies.executor,
      input.agentsRoot ?? dependencies.agentsRoot,
    );
    if (receipt.status === 'failed') {
      throw new CliError(receipt.detail);
    }
    return receipt;
  },
  script: 'scripts/validate/immutable-agents-config.ts',
  summary: 'Fail when a protected .agents configuration file differs from the Git index.',
});

export const command = createCommand();

void runMain(command, import.meta.main);
