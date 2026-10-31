export type BoundaryAnswer = (prompt: RouterPrompt) => Promise<string>;

export interface ResponderProblem {
  readonly expectedInput: string;
  readonly nextAction: string;
  readonly problem: string;
}

export type ResponderResult =
  | { readonly raw: string; readonly skillName: string; readonly status: 'answered' }
  | ({ readonly raw: string; readonly status: 'unparseable' } & ResponderProblem)
  | ({ readonly status: 'unavailable' } & ResponderProblem);

export type ResponderStatus = 'answered' | 'unparseable' | 'unavailable';

export interface RouterPrompt {
  readonly catalog: readonly SkillCatalogEntry[];
  readonly instructions: string;
  readonly query: string;
}

/**
 * In-session LLM boundary for skill-manager trigger training.
 *
 * The boundary is the in-session model of the executing agent, or a child spawned
 * from that session inheriting its model, endpoint, and authentication. No
 * endpoint, credential variable, model identifier, or vendor literal is
 * configured, read from any file, or embedded in this module.
 */

export interface SkillCatalogEntry {
  readonly description: string;
  readonly name: string;
}

export const NO_SKILL_ANSWER = 'NO_SKILL';

export const DOCUMENT_INSTRUCTIONS =
  'You are a reader with no other knowledge. Use only the document in this bundle. Each prompt '
  + 'is a question with lettered options. Answer with exactly one option letter and nothing else.';

export const ROUTER_INSTRUCTIONS =
  'You are the skill router of an agent runtime. The catalog lists every skill that can be '
  + 'loaded. For the user query, answer with exactly one skill name from the catalog that the '
  + `agent should load, or ${NO_SKILL_ANSWER} when no catalog skill applies. Reply with `
  + 'that single token and nothing else.';

export const answeredMatches = (result: ResponderResult, targetSkillName: string): boolean =>
  result.status === 'answered' && result.skillName === targetSkillName;

const normalizedAnswer = (raw: string): string =>
  raw
    .replaceAll('`', ' ')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';

export const parseRouterAnswer = (
  raw: string,
  catalog: readonly SkillCatalogEntry[],
): ResponderResult => {
  const answer = normalizedAnswer(raw).replace(/^[\s"'`*]+|[\s"'`*]+$/gu, '');
  if (answer === NO_SKILL_ANSWER) {
    return { raw, skillName: NO_SKILL_ANSWER, status: 'answered' };
  }
  const match = catalog.find((entry) => entry.name === answer);
  if (match) {
    return { raw, skillName: match.name, status: 'answered' };
  }
  return {
    expectedInput: `exactly one catalog skill name or ${NO_SKILL_ANSWER} on a single line`,
    nextAction:
      're-ask the in-session boundary with the same prompt and record its answer verbatim',
    problem: `Router answer is not one catalog skill name: ${answer || '(empty)'}`,
    raw,
    status: 'unparseable',
  };
};

export const routerPromptFor = (
  query: string,
  catalog: readonly SkillCatalogEntry[],
): RouterPrompt => ({ catalog, instructions: ROUTER_INSTRUCTIONS, query });

export const unavailableBoundary = (
  problem: string,
  expectedInput: string,
  nextAction: string,
): ResponderResult => ({ expectedInput, nextAction, problem, status: 'unavailable' });

export const askRouter = async (
  prompt: RouterPrompt,
  answer: BoundaryAnswer,
): Promise<ResponderResult> => {
  try {
    return parseRouterAnswer(await answer(prompt), prompt.catalog);
  } catch (error) {
    return unavailableBoundary(
      `In-session boundary call failed: ${error instanceof Error ? error.message : String(error)}`,
      'one router prompt answered by the in-session model or an inherited child session',
      'retry through the same in-session boundary; stop the training run on a repeated failure',
    );
  }
};
