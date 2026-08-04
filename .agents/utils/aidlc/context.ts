import type { FileSystem } from '../filesystem.js';
import { readText } from '../filesystem.js';
import { isKbConceptPath, parseOkfConcept } from '../knowledge-base.js';
import type { AidlcIntent, AidlcKnowledgeContext } from './intent.js';

const contextOrder = ['organization', 'team', 'project'] as const;

export const assertAidlcKnowledgeContextResolvable = (
  intent: AidlcIntent,
): void => {
  if (intent.stage !== 'reverse-engineering') {
    throw new Error(
      'AIDLC knowledge context can be resolved only at reverse-engineering.',
    );
  }
  if (intent.kbContext.resolvedAt) {
    throw new Error('AIDLC knowledge context has already been resolved.');
  }
};

const conflictKeyFor = (
  rule: string,
): { readonly mode: string; readonly subject: string } => {
  const match = /^(ALWAYS|NEVER)\s+(.+)$/u.exec(rule) as RegExpExecArray;
  return { mode: match[1], subject: match[2].toLowerCase() };
};

const definedBindings = (
  bindings: AidlcKnowledgeContext['bindings'],
): AidlcKnowledgeContext['bindings'] =>
  Object.fromEntries(
    Object.entries(bindings).filter(([, value]) => value !== undefined),
  );

export const knowledgeBindingFor = (value: string): string | undefined =>
  value === '-' ? undefined : value;

export const knowledgeBindingsFor = (
  organization: string,
  team: string,
  project: string,
): AidlcKnowledgeContext['bindings'] => ({
  organization: knowledgeBindingFor(organization),
  project: knowledgeBindingFor(project),
  team: knowledgeBindingFor(team),
});

const optionalRead = async (
  fileSystem: FileSystem,
  path: string,
): Promise<string | undefined> => {
  try {
    return await readText(fileSystem, path);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
};

export const renderAidlcKnowledgeSnapshot = (
  context: AidlcKnowledgeContext,
): string =>
  [
    '## Resolved practice context',
    '',
    `Sources: ${context.sources.length ? context.sources.join(', ') : 'None configured or found.'}`,
    '',
    ...(context.rules.length
      ? context.rules.map((rule) => `- ${rule}`)
      : ['- No affirmed rules resolved.']),
    '',
  ].join('\n');

const rulesFor = (content: string): string[] =>
  [...content.matchAll(/^\s*[-*]\s+((?:ALWAYS|NEVER)\s+.+)$/gmu)].map((match) =>
    match[1].trim(),
  );

export const validateKnowledgeBindings = (
  bindings: AidlcKnowledgeContext['bindings'],
  cbmIndex?: string,
): void => {
  const expectedPrefixes = {
    organization: 'shared/organization/',
    project: cbmIndex ? `${cbmIndex}/` : undefined,
    team: 'shared/team/',
  } as const;
  for (const [layer, path] of Object.entries(bindings)) {
    const expectedPrefix =
      expectedPrefixes[layer as keyof typeof expectedPrefixes];
    if (
      path !== undefined &&
      (!isKbConceptPath(path) ||
        (expectedPrefix !== undefined && !path.startsWith(expectedPrefix)))
    ) {
      throw new Error(`Invalid AIDLC knowledge binding: ${path}`);
    }
  }
};

export const resolveAidlcKnowledgeContext = async (
  fileSystem: FileSystem,
  kbRoot: string,
  bindings: AidlcKnowledgeContext['bindings'],
  resolvedAt: string,
  cbmIndex?: string,
): Promise<AidlcKnowledgeContext> => {
  if (!kbRoot.startsWith('/')) {
    throw new Error('AIDLC knowledge root must be absolute.');
  }
  validateKnowledgeBindings(bindings, cbmIndex);
  const root = kbRoot.replace(/\/$/u, '');
  const contents = new Map(
    await Promise.all(
      contextOrder.map(async (layer) => {
        const binding = bindings[layer];
        return [
          layer,
          binding
            ? await optionalRead(fileSystem, `${root}/${binding}`)
            : undefined,
        ] as const;
      }),
    ),
  );
  const sources: string[] = [];
  const rules: string[] = [];
  for (const layer of contextOrder) {
    const binding = bindings[layer];
    if (!binding) {
      continue;
    }
    const content = contents.get(layer);
    if (!content) {
      continue;
    }
    parseOkfConcept(content);
    sources.push(binding);
    rules.push(...rulesFor(content));
  }
  const resolved = new Map<string, string>();
  for (const rule of rules) {
    const { mode, subject } = conflictKeyFor(rule);
    const earlier = resolved.get(subject);
    if (earlier && earlier !== mode) {
      throw new Error(`Conflicting AIDLC knowledge rules for: ${subject}`);
    }
    resolved.set(subject, mode);
  }
  return { bindings: definedBindings(bindings), resolvedAt, rules, sources };
};

export const resolveAidlcKnowledgeContextForIntent = async (
  fileSystem: FileSystem,
  intent: AidlcIntent,
  kbRoot: string,
  bindings: AidlcKnowledgeContext['bindings'],
  now: string,
): Promise<AidlcKnowledgeContext> => {
  assertAidlcKnowledgeContextResolvable(intent);
  return resolveAidlcKnowledgeContext(
    fileSystem,
    kbRoot,
    bindings,
    now,
    intent.cbmIndex,
  );
};
