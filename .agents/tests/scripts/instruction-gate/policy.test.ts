import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';
import * as realGate from '../../../scripts/instruction-gate/index.js';
import * as realOkf from '../../../utils/okf.js';
import * as realAtoms from '../../../utils/quality-engine/atom/index.js';
import * as realHeldOut from '../../../utils/quality-engine/heldout.js';

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:crypto', () => realCrypto);
mock.module('./instruction-gate.js', () => realGate);
mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../utils/okf.js', () => realOkf);
mock.module('../utils/quality-engine/atoms.js', () => realAtoms);
mock.module('../utils/quality-engine/heldout.js', () => realHeldOut);

const { HELD_OUT_LOOKS_FILE, policyContext, policyProblems } = await import(
  '../../../scripts/instruction-gate/policy.js'
);

const measurement = (passed: string[], failed: string[], valid = 2) => ({
  trainFailed: failed,
  trainPassed: passed,
  validationPassed: valid,
  validationTotal: 3,
});

const sha = (text: string): string => realCrypto.createHash('sha256').update(text).digest('hex');

test('policyProblems keeps core probes, bounds swaps, and protects held-out counts', () => {
  const baseline = { trainPassed: ['a', 'b', 'c'], validationPassed: 2 };
  const core = ['a'];
  expect(policyProblems(measurement(['a', 'b', 'c'], []), baseline, core, undefined)).toEqual({
    problems: [],
    swapped: false,
  });
  expect(policyProblems(measurement(['b', 'c'], ['a']), baseline, core, 'x').problems).toEqual([
    'Core train probe a passed at baseline and now fails.',
  ]);
  expect(
    policyProblems(measurement(['a', 'c'], ['b']), baseline, core, undefined).problems,
  ).toEqual([
    'Non-core train probe b passed at baseline and now fails; a swap needs --allow-swap <reason>.',
  ]);
  expect(policyProblems(measurement(['a', 'c'], ['b']), baseline, core, 'x').problems).toEqual([
    'A swap must not lose more than it gains: 1 lost against 0 gained.',
  ]);
  expect(policyProblems(measurement(['a', 'c', 'd'], ['b']), baseline, core, 'x')).toEqual({
    problems: [],
    swapped: true,
  });
  expect(
    policyProblems(measurement(['a', 'b', 'c'], [], 1), baseline, core, undefined).problems,
  ).toEqual(['Held-out validation fell from 2 to 1 passing probes.']);
});

const doc = 'skills/demo/SKILL.md';
const target = {
  document: doc,
  receiptPath: 'evals/skills/demo/receipts/SKILL.json',
  setPath: 'evals/skills/demo/comprehension/SKILL.json',
};
const looksFile = `/r/evals/skills/demo/${HELD_OUT_LOOKS_FILE}`;
const poolFile = '/r/evals/skills/demo/pool.md';
const at = '2026-11-17T00:00:00.000Z';
const atomMap = (sensitivity: unknown[]): string =>
  [
    '---',
    'type: atom-map',
    'title: t',
    'description: d',
    'tags: [atoms]',
    'schemaVersion: 1',
    `source: ${doc}`,
    'atoms: []',
    `sensitivity: ${JSON.stringify(sensitivity)}`,
    '---',
    'body',
  ].join('\n');

const lookLine = (text: string) =>
  `${JSON.stringify({ at, document: doc, documentSha256: sha(text), kind: 'look' })}\n`;

const world = (files: Record<string, string> = {}) => {
  const store = new Map(
    Object.entries({ '/r/evals/skills/demo/atoms/SKILL.md': atomMap([]), ...files }),
  );
  const deps = {
    agentsRoot: '/r',
    now: () => new Date(at),
    readText: async (file: string) => store.get(file),
    sha256: sha,
    writeText: async (file: string, content: string) => {
      store.set(file, content);
    },
  };
  return { deps, store };
};

test('outside the global root there is no core and no look accounting', async () => {
  const { deps, store } = world();
  const context = await policyContext(deps, target, 'text', {}, false);
  expect(context).toMatchObject({ blocked: undefined, core: undefined });
  await context.commit();
  expect([...store.keys()]).toEqual(['/r/evals/skills/demo/atoms/SKILL.md']);
});

test('reads the core from the calibrated probes and records each new text once', async () => {
  const sensitivity = [
    { mutantsFlipped: 1, mutantsTried: 2, probeId: 'p1' },
    { mutantsFlipped: 0, mutantsTried: 2, probeId: 'p2' },
  ];
  const { deps, store } = world({
    '/r/evals/skills/demo/atoms/SKILL.md': atomMap(sensitivity),
  });
  const context = await policyContext(deps, target, 'text one', {}, true);
  expect(context.core).toEqual(['p1']);
  expect(context.blocked).toBeUndefined();
  await context.commit();
  expect(store.get(looksFile)).toBe(lookLine('text one'));
  const again = await policyContext(deps, target, 'text one', {}, true);
  await again.commit();
  expect(store.get(looksFile)).toBe(lookLine('text one'));
});

test.each([
  ['no atom map', undefined],
  ['an unreadable atom map', 'not frontmatter'],
])('a document with %s is blocked and never counts a look', async (_name, map) => {
  const { deps, store } = world();
  store.delete('/r/evals/skills/demo/atoms/SKILL.md');
  if (map !== undefined) {
    store.set('/r/evals/skills/demo/atoms/SKILL.md', map);
  }
  const context = await policyContext(deps, target, 'text', {}, true);
  expect(context.blocked).toContain('no readable atom map at evals/skills/demo/atoms/SKILL.md');
  expect(context.core).toBeUndefined();
  await context.commit();
  expect(store.has(looksFile)).toBe(false);
});

test('blocks a third distinct text in an epoch without measuring or recording it', async () => {
  const { deps, store } = world({ [looksFile]: lookLine('one') + lookLine('two') });
  const blocked = await policyContext(deps, target, 'three', {}, true);
  expect(blocked.blocked).toContain(
    'BLOCKED skills/demo/SKILL.md: 2 held-out looks used in epoch 0 (limit 2)',
  );
  expect(blocked.blocked).toContain('--rotate-pool <pool-file>');
  await blocked.commit();
  expect(store.get(looksFile)).toBe(lookLine('one') + lookLine('two'));
  const seen = await policyContext(deps, target, 'two', {}, true);
  expect(seen.blocked).toBeUndefined();
});

test('the epoch limit comes from the root manifest policy', async () => {
  const { deps } = world({
    '/r/evals/manifest.json': JSON.stringify({ policy: { heldOutLooksPerEpoch: 3 } }),
    [looksFile]: lookLine('one') + lookLine('two'),
  });
  expect((await policyContext(deps, target, 'three', {}, true)).blocked).toBeUndefined();
});

test('a sealed pool rotates the epoch and unblocks the next look', async () => {
  const { deps, store } = world({
    [looksFile]: lookLine('one') + lookLine('two'),
    [poolFile]: 'new held-out probes',
  });
  const context = await policyContext(
    deps,
    target,
    'three',
    { rotatePoolPath: 'evals/skills/demo/pool.md' },
    true,
  );
  expect(context.blocked).toBeUndefined();
  expect(store.get(looksFile)).toContain(
    JSON.stringify({ at, document: doc, kind: 'rotation', poolSha256: sha('new held-out probes') }),
  );
  await context.commit();
  expect(store.get(looksFile)?.trim().split('\n')).toHaveLength(4);
});

test.each([
  ['a missing pool file', undefined],
  ['a blank pool file', '  \n'],
])('rotation rejects %s', async (_name, pool) => {
  const { deps } = world(pool === undefined ? {} : { [poolFile]: pool });
  await expect(
    policyContext(deps, target, 'text', { rotatePoolPath: 'evals/skills/demo/pool.md' }, true),
  ).rejects.toThrow('The sealed held-out pool is missing or blank: evals/skills/demo/pool.md.');
});

test('a malformed look ledger stops the record', async () => {
  const { deps } = world({ [looksFile]: 'not json\n' });
  await expect(policyContext(deps, target, 'text', {}, true)).rejects.toThrow(
    'evals/skills/demo/held-out-looks.jsonl line 1 is not valid JSON.',
  );
});

test('root documents keep their look ledger beside the root receipts', async () => {
  const root = {
    document: 'AGENTS.md',
    receiptPath: 'evals/receipts/AGENTS.json',
    setPath: 'evals/comprehension/AGENTS.json',
  };
  const { deps, store } = world({ '/r/evals/atoms/AGENTS.md': atomMap([]) });
  await (await policyContext(deps, root, 'text', {}, true)).commit();
  expect(store.has('/r/evals/held-out-looks.jsonl')).toBe(true);
});

test('a pool given by absolute path outside the agents root also rotates the epoch', async () => {
  const { deps, store } = world({
    [looksFile]: lookLine('one') + lookLine('two'),
    '/elsewhere/pool.json': 'absolute pool',
  });
  const context = await policyContext(
    deps,
    target,
    'three',
    { rotatePoolPath: '/elsewhere/pool.json' },
    true,
  );
  expect(context.blocked).toBeUndefined();
  expect(store.get(looksFile)).toContain(sha('absolute pool'));
});
