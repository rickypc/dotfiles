import { expect, test } from 'bun:test';

import {
  answeredMatches,
  askRouter,
  type BoundaryAnswer,
  NO_SKILL_ANSWER,
  parseRouterAnswer,
  type ResponderResult,
  ROUTER_INSTRUCTIONS,
  routerPromptFor,
  unavailableBoundary,
} from '../../../utils/quality-engine/provider.js';

const answeredName = (result: ResponderResult): string =>
  result.status === 'answered' ? result.skillName : '';

const catalog = [
  { description: 'Owns skill lifecycle work.', name: 'skill-manager' },
  { description: 'Owns durable knowledge retrieval.', name: 'knowledge-base' },
];

const answer =
  (value: string): BoundaryAnswer =>
  async () =>
    value;

test('builds one router prompt carrying the catalog, instructions, and query verbatim', () => {
  const prompt = routerPromptFor('Optimize this skill description.', catalog);
  expect(prompt).toEqual({
    catalog,
    instructions: ROUTER_INSTRUCTIONS,
    query: 'Optimize this skill description.',
  });
  expect(prompt.instructions).toContain(NO_SKILL_ANSWER);
});

test('answers with the exact catalog skill name', () => {
  expect(parseRouterAnswer('skill-manager', catalog)).toEqual({
    raw: 'skill-manager',
    skillName: 'skill-manager',
    status: 'answered',
  });
});

test('answers with the no-skill sentinel when no catalog skill applies', () => {
  expect(parseRouterAnswer(` ${NO_SKILL_ANSWER} `, catalog)).toEqual({
    raw: ` ${NO_SKILL_ANSWER} `,
    skillName: NO_SKILL_ANSWER,
    status: 'answered',
  });
});

test('normalizes fenced, quoted, and multi-line answers to the first token line', () => {
  expect(answeredName(parseRouterAnswer('```\nknowledge-base\n```', catalog))).toBe(
    'knowledge-base',
  );
  expect(answeredName(parseRouterAnswer('"knowledge-base"', catalog))).toBe('knowledge-base');
  expect(answeredName(parseRouterAnswer('\n\n  *knowledge-base*\nignored', catalog))).toBe(
    'knowledge-base',
  );
});

test('reports an unparseable answer with the problem, expected input, and next action', () => {
  const result = parseRouterAnswer('Skill Manager maybe?', catalog);
  expect(result.status).toBe('unparseable');
  if (result.status !== 'unparseable') {
    throw new Error('Expected an unparseable router answer.');
  }
  expect(result.raw).toBe('Skill Manager maybe?');
  expect(result.problem).toContain('Skill Manager maybe?');
  expect(result.expectedInput).toContain(NO_SKILL_ANSWER);
  expect(result.nextAction).toContain('in-session boundary');
});

test('reports an empty answer as unparseable rather than a silent miss', () => {
  const result = parseRouterAnswer('   \n  ', catalog);
  expect(result.status).toBe('unparseable');
  if (result.status !== 'unparseable') {
    throw new Error('Expected an unparseable router answer.');
  }
  expect(result.problem).toContain('(empty)');
  expect(result.raw).toBe('   \n  ');
});

test('describes an unavailable boundary with the typed problem fields', () => {
  expect(unavailableBoundary('The session model is not answering.', 'one prompt', 'retry')).toEqual(
    {
      expectedInput: 'one prompt',
      nextAction: 'retry',
      problem: 'The session model is not answering.',
      status: 'unavailable',
    },
  );
});

test('asks the in-session boundary and classifies its answer', async () => {
  const prompt = routerPromptFor('Create a new skill.', catalog);
  const boundary = answer('knowledge-base');
  await expect(askRouter(prompt, boundary)).resolves.toEqual({
    raw: 'knowledge-base',
    skillName: 'knowledge-base',
    status: 'answered',
  });
  await expect(askRouter(prompt, answer('not-a-skill'))).resolves.toMatchObject({
    status: 'unparseable',
  });
});

test('converts a thrown boundary failure into the unavailable result', async () => {
  const thrown: BoundaryAnswer = async () => {
    throw new Error('Session boundary is down.');
  };
  const result = await askRouter(routerPromptFor('Review this diff.', catalog), thrown);
  expect(result.status).toBe('unavailable');
  if (result.status !== 'unavailable') {
    throw new Error('Expected an unavailable boundary result.');
  }
  expect(result.problem).toContain('Session boundary is down.');
  expect(result.nextAction).toContain('stop the training run');
});

test('converts a non-error thrown value into the unavailable result without leaking secrets', async () => {
  const thrown: BoundaryAnswer = async () => {
    throw 'raw failure';
  };
  const result = await askRouter(routerPromptFor('Review this diff.', catalog), thrown);
  expect(result.status).toBe('unavailable');
  if (result.status !== 'unavailable') {
    throw new Error('Expected an unavailable boundary result.');
  }
  expect(result.problem).toContain('raw failure');
});

test('matches an answered run against the target skill only on an exact name', () => {
  const hit = parseRouterAnswer('skill-manager', catalog);
  const other = parseRouterAnswer('knowledge-base', catalog);
  const miss = parseRouterAnswer('unparseable answer here', catalog);
  expect(answeredMatches(hit, 'skill-manager')).toBeTrue();
  expect(answeredMatches(other, 'skill-manager')).toBeFalse();
  expect(answeredMatches(miss, 'skill-manager')).toBeFalse();
  expect(answeredMatches(parseRouterAnswer(NO_SKILL_ANSWER, catalog), 'skill-manager')).toBeFalse();
});
