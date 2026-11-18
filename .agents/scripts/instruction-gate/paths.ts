import { homedir } from 'node:os';
import path from 'node:path';

export interface GateTarget {
  readonly document: string;
  readonly receiptPath: string;
  readonly setPath: string;
  readonly skill?: string;
}

export interface InstructionPathDependencies {
  readonly agentsRoot: string;
  readonly listDirectory: (directory: string) => Promise<
    readonly {
      readonly isDirectory: boolean;
      readonly name: string;
    }[]
  >;
}

export const RECEIPT_DIRECTORY = path.join('evals', 'receipts');
export const DESCRIPTION_PREFIX = 'description:';
export const ROUTING_TOKEN = 'descriptions';
export const ROUTING_RECEIPT = path.join(RECEIPT_DIRECTORY, 'activation.json');
export const CATALOG_ROUTING_RECEIPT = path.join(
  'evals',
  'skills',
  '_catalog',
  'receipts',
  'activation.json',
);
export const ROOT_DOCUMENT_PATTERN = /^(AGENTS|CLAUDE|GEMINI)[^/]*\.md$/u;

export const isGlobalAgentsRoot = (agentsRoot: string): boolean =>
  path.resolve(agentsRoot) === path.join(homedir(), '.agents');

export const receiptPathFor = (document: string, central = false): string => {
  const rubricMatch = central ? /^evals\/skills\/([^/]+)\/rubric\.md$/u.exec(document) : null;
  if (rubricMatch?.[1]) {
    return path.join('evals', 'skills', rubricMatch[1], 'receipts', 'rubric.json');
  }
  const skillMatch = central ? /^skills\/([^/]+)\/(.+)\.md$/u.exec(document) : null;
  if (skillMatch?.[1] && skillMatch[2]) {
    const sourceKey = skillMatch[2] === 'SKILL' ? 'SKILL' : skillMatch[2].replaceAll('/', '--');
    return path.join('evals', 'skills', skillMatch[1], 'receipts', `${sourceKey}.json`);
  }
  return path.join(
    RECEIPT_DIRECTORY,
    `${document.replace(/\.md$/u, '').replaceAll('/', '--')}.json`,
  );
};

export const routingReceiptPathFor = (central = false): string =>
  central ? CATALOG_ROUTING_RECEIPT : ROUTING_RECEIPT;

export const routingSkillTarget = (skill: string, central = false): GateTarget => ({
  document: path.join('skills', skill, 'SKILL.md'),
  receiptPath: routingReceiptPathFor(central),
  setPath: central
    ? path.join('evals', 'skills', skill, 'trigger-queries.json')
    : path.join('skills', skill, 'evals', 'trigger-queries.json'),
  skill,
});

export const setPathFor = (document: string, central = false): string => {
  if (!document.includes('/')) {
    return path.join('evals', 'comprehension', `${document.replace(/\.md$/u, '')}.json`);
  }
  const rubricMatch = central ? /^evals\/skills\/([^/]+)\/rubric\.md$/u.exec(document) : null;
  if (rubricMatch?.[1]) {
    return path.join('evals', 'skills', rubricMatch[1], 'comprehension', 'evals-rubric.json');
  }
  const skillMatch = central ? /^skills\/([^/]+)\/(.+)\.md$/u.exec(document) : null;
  if (skillMatch?.[1] && skillMatch[2]) {
    const sourceKey = skillMatch[2].replaceAll('/', '-');
    return path.join('evals', 'skills', skillMatch[1], 'comprehension', `${sourceKey}.json`);
  }
  const [, skill, ...rest] = document.split('/');
  return path.join(
    'skills',
    skill ?? '',
    'evals',
    'comprehension',
    `${rest.join('-').replace(/\.md$/u, '')}.json`,
  );
};

const walk = async (
  deps: InstructionPathDependencies,
  relative: string,
  excludeLegacyEvalDirectories = false,
): Promise<readonly string[]> => {
  const items = await deps.listDirectory(path.join(deps.agentsRoot, relative));
  const nested = await Promise.all(
    items.map(async (item) => {
      const child = path.join(relative, item.name);
      if (item.isDirectory) {
        return excludeLegacyEvalDirectories && item.name === 'evals'
          ? []
          : walk(deps, child, excludeLegacyEvalDirectories);
      }
      return item.name.endsWith('.md') ? [child] : [];
    }),
  );
  return nested.flat();
};

export const instructionDocuments = async (
  deps: InstructionPathDependencies,
): Promise<readonly string[]> => {
  const central = isGlobalAgentsRoot(deps.agentsRoot);
  const root = await deps.listDirectory(deps.agentsRoot);
  const rootDocuments = root
    .filter((item) => !item.isDirectory && ROOT_DOCUMENT_PATTERN.test(item.name))
    .map((item) => item.name);
  const skills = await deps.listDirectory(path.join(deps.agentsRoot, 'skills'));
  const skillDocuments = await Promise.all(
    skills
      .filter((item) => item.isDirectory)
      .map(async (item) => {
        const relative = path.join('skills', item.name);
        const documents = await walk(deps, relative, central);
        if (!central) {
          return documents;
        }
        const entries = await deps.listDirectory(path.join(deps.agentsRoot, relative));
        return entries.some((entry) => entry.name === 'SKILL.md')
          ? [...documents, path.join('evals', 'skills', item.name, 'rubric.md')]
          : documents;
      }),
  );
  return [...rootDocuments, ...skillDocuments.flat()].sort();
};
