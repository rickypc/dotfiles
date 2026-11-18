import { agentsRootOf } from '../../utils/agents-root.js';
import type { CommandDeclaration } from '../../utils/cli/declaration.js';
import { runMain } from '../../utils/cli/index.js';
import { nodeFileSystem } from '../../utils/filesystem.js';
import {
  type SkillSuiteValidationReceipt,
  validateAllSkills,
} from '../../utils/skill-manager/index.js';

export interface SkillsValidationDependencies {
  readonly agentsRoot: string;
  readonly validate: typeof validateAllSkills;
}

export const validReceiptLine = (receipt: SkillSuiteValidationReceipt): string =>
  `skill-validation: passed - ${receipt.skillCount} skills, ${receipt.matrixCount} matrix cases, ${receipt.prose.prosePaths.length} prose paths, ${receipt.prose.checkedLocalLinkTargets} local links checked.`;

export const createCommand = (
  dependencies: SkillsValidationDependencies = {
    agentsRoot: agentsRootOf(import.meta.dir),
    validate: validateAllSkills,
  },
): CommandDeclaration<SkillSuiteValidationReceipt> => ({
  arity: [0, 0],
  renderText: validReceiptLine,
  run: (input) =>
    dependencies.validate(nodeFileSystem, `${input.agentsRoot ?? dependencies.agentsRoot}/skills`),
  script: 'scripts/validate/skills.ts',
  summary: 'Validate every skill matrix, rubric, and prose link under the agents skills root.',
});

export const command = createCommand();

void runMain(command, import.meta.main);
