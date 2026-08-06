import { expect, test } from 'bun:test';

import {
  declarationOrderCheck,
  evaluateDeclarationOrderLifecycle,
  fixDeclarationOrder,
  inspectDeclarationOrder,
} from '../../utils/declaration-order.js';

test('orders types after imports and runtime declarations by dependency then name', () => {
  const report = inspectDeclarationOrder(
    '/repo/example.ts',
    [
      "import { z } from './z.js';",
      'type Zebra = string;',
      'interface Alpha { value: string }',
      'function zebra() { return alpha(); }',
      'const beta = () => alpha();',
      'function alpha() { return z; }',
    ].join('\n'),
  );
  expect(report.blockers).toEqual([]);
  expect(report.groups).toEqual([
    expect.objectContaining({
      currentOrder: ['Zebra', 'Alpha'],
      desiredOrder: ['Alpha', 'Zebra'],
      id: 'types-after-imports',
    }),
    expect.objectContaining({
      currentOrder: ['zebra', 'beta', 'alpha'],
      desiredOrder: ['alpha', 'beta', 'zebra'],
      id: 'runtime-1',
    }),
  ]);
  expect(report.packet).toEqual(
    expect.objectContaining({
      forbiddenActions: expect.arrayContaining([
        expect.stringContaining('declaration body'),
      ]),
      requiredActionGroups: [
        expect.objectContaining({ id: 'types-after-imports' }),
        expect.objectContaining({ id: 'runtime-1' }),
      ],
      state: 'candidate_requested',
    }),
  );
  expect(
    declarationOrderCheck('/repo/example.ts', 'function alpha() {}'),
  ).toEqual({
    detail: 'Top-level declarations are canonical.',
    name: 'declaration-order',
    status: 'passed',
  });
});

test('makes type placement actionable and reports runtime dependency uncertainty', () => {
  const report = inspectDeclarationOrder(
    '/repo/blocked.ts',
    [
      "import { value } from './value.js';",
      'const visible = value;',
      'interface Zeta { value: string }',
      'type Alpha = string;',
      'function alpha(beta: () => void) { beta(); }',
      'function beta() { alpha(beta); }',
    ].join('\n'),
  );
  expect(report.blockers).toEqual([
    'Runtime declaration alpha shadows sortable names: beta.',
  ]);
  expect(report.packet).toEqual(
    expect.objectContaining({
      requiredActionGroups: [
        expect.objectContaining({
          id: 'types-after-imports',
          title: expect.stringContaining('Move and reorder'),
        }),
      ],
    }),
  );
  expect(
    declarationOrderCheck(
      '/repo/blocked.ts',
      [
        "import { value } from './value.js';",
        'const visible = value;',
        'interface Zeta { value: string }',
        'type Alpha = string;',
      ].join('\n'),
    ),
  ).toEqual(
    expect.objectContaining({
      detail: expect.stringContaining('immediately after imports'),
      status: 'failed',
    }),
  );
  expect(
    declarationOrderCheck(
      '/repo/blocked.ts',
      'function zebra() {}\nfunction alpha() {}',
    ),
  ).toEqual(
    expect.objectContaining({
      detail: expect.stringContaining('runtime-1 must be alpha, zebra'),
      status: 'failed',
    }),
  );
});

test('recognizes typed arrow functions without comment-defined sections', () => {
  const report = inspectDeclarationOrder(
    '/repo/sections.ts',
    [
      "import { value } from './value.js';",
      '',
      'export const indexIsReady = (output: string): boolean => output.length > 0;',
      'const outputFor = (stdout: string, stderr: string): string => [stdout, stderr].join();',
      'const alpha = (): string => { if (zebra()) return value; return value; };',
      'const zebra = (): string => value;',
      'export const assertAllowed = (path: string): void => { canonicalPath(path); };',
      "const canonicalPath = (path: string): string => path.replace(/\\/$/u, '');",
      'export const cbmOutputHasMatches = (): string => value;',
    ].join('\n'),
  );
  expect(report.groups).toEqual([
    expect.objectContaining({
      currentOrder: [
        'indexIsReady',
        'outputFor',
        'alpha',
        'zebra',
        'assertAllowed',
        'canonicalPath',
        'cbmOutputHasMatches',
      ],
      desiredOrder: [
        'canonicalPath',
        'assertAllowed',
        'cbmOutputHasMatches',
        'indexIsReady',
        'outputFor',
        'zebra',
        'alpha',
      ],
    }),
  ]);
  expect(report.packet).toEqual(
    expect.objectContaining({
      requiredActionGroups: expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining('runtime declarations'),
        }),
      ]),
    }),
  );
});

test('parses TSX, preserves comments as source trivia, and blocks syntax errors', () => {
  const tsx = inspectDeclarationOrder(
    '/repo/component.tsx',
    [
      '// documents beta',
      'const beta = () => <div>{alpha()}</div>;',
      'const alpha = () => <span />;',
    ].join('\n'),
  );
  expect(tsx.groups[0]).toEqual(
    expect.objectContaining({ desiredOrder: ['alpha', 'beta'] }),
  );
  expect(tsx.groups[0]?.items[0]?.start).toBe(0);
  expect(
    inspectDeclarationOrder('/repo/broken.ts', 'const = ;').blockers,
  ).toEqual([
    'Source contains syntax errors; declaration order was not evaluated.',
  ]);
  expect(
    inspectDeclarationOrder(
      '/repo/module.js',
      'function zebra() { return alpha(); }\nfunction alpha() {}',
    ).groups[0],
  ).toEqual(expect.objectContaining({ desiredOrder: ['alpha', 'zebra'] }));
});

test('applies only safe type and runtime declaration moves idempotently', () => {
  const source = [
    "import { value } from './value.js';",
    'const runtime = value;',
    '// Beta docs',
    'type Beta = string;',
    'interface Alpha { value: string }',
    'function zebra() { return alpha(); }',
    'function alpha() { return value; }',
  ].join('\n');
  const fixed = fixDeclarationOrder('/repo/fix.ts', source);
  expect(fixed.changed).toBe(true);
  expect(fixed.report).toEqual(
    expect.objectContaining({ blockers: [], violations: [] }),
  );
  expect(fixed.source).toContain('// Beta docs\ntype Beta = string;');
  expect(fixed.source.indexOf('interface Alpha')).toBeLessThan(
    fixed.source.indexOf('const runtime'),
  );
  expect(fixed.source.indexOf('function alpha')).toBeLessThan(
    fixed.source.indexOf('function zebra'),
  );
  expect(fixDeclarationOrder('/repo/fix.ts', fixed.source)).toEqual(
    expect.objectContaining({ changed: false, source: fixed.source }),
  );
  expect(
    fixDeclarationOrder(
      '/repo/types.ts',
      "import { value } from './value.js';\ntype Zebra = typeof value;\ninterface Alpha {}",
    ).source,
  ).toBe(
    "import { value } from './value.js';\ninterface Alpha {}\n\ntype Zebra = typeof value;",
  );
  expect(
    fixDeclarationOrder(
      '/repo/no-import.ts',
      'const value = 1;\ntype Zebra = number;\ninterface Alpha {}',
    ).source.trim(),
  ).toBe('interface Alpha {}\n\ntype Zebra = number;\n\nconst value = 1;');
  expect(
    fixDeclarationOrder(
      '/repo/two-groups.ts',
      'function zebra() {}\nfunction alpha() {}\nconst boundary = 1;\nfunction delta() {}\nfunction charlie() {}',
    ).source,
  ).toContain(
    'function alpha() {}\n\nfunction zebra() {}\nconst boundary = 1;\nfunction charlie() {}\n\nfunction delta() {}',
  );
  const scriptLike = fixDeclarationOrder(
    '/repo/script.ts',
    [
      'interface Entry { readonly name: string }',
      '',
      'export const run = (): string => usage();',
      '',
      "export const usage = (): string => 'Usage';",
      '',
      'const boundary = 1;',
    ].join('\n'),
  );
  expect(scriptLike.report).toEqual(
    expect.objectContaining({ blockers: [], violations: [] }),
  );
  expect(scriptLike.source).toContain(
    "export const usage = (): string => 'Usage';\n\nexport const run = (): string => usage();",
  );
  expect(scriptLike.source).toContain(
    'interface Entry { readonly name: string }',
  );
  expect(
    fixDeclarationOrder(
      '/repo/blocked.ts',
      'function beta() { return alpha(); }\nfunction alpha() { return beta(); }',
    ),
  ).toEqual(
    expect.objectContaining({
      changed: false,
      source:
        'function beta() { return alpha(); }\nfunction alpha() { return beta(); }',
    }),
  );
});

test('rejects a reorder when the source-preservation guard fails', () => {
  const source = 'function zebra() {}\nfunction alpha() {}';
  const fixed = fixDeclarationOrder('/repo/guard.ts', source, () => false);
  expect(fixed).toEqual(expect.objectContaining({ changed: false, source }));
  expect(fixed.report.blockers).toContain(
    'Automatic reorder rejected because top-level source statements changed.',
  );
});

test('does not reorder dependency cycles or declarations separated by barriers', () => {
  const cycle = inspectDeclarationOrder(
    '/repo/cycle.ts',
    'function beta() { return alpha(); }\nfunction alpha() { return beta(); }',
  );
  const separated = inspectDeclarationOrder(
    '/repo/separated.ts',
    'function zebra() {}\nexport const value = 1;\nfunction alpha() {}',
  );
  expect(cycle.blockers).toEqual([
    'Runtime declaration dependencies contain a cycle.',
  ]);
  expect(
    declarationOrderCheck(
      '/repo/cycle.ts',
      'function beta() { return alpha(); }\nfunction alpha() { return beta(); }',
    ),
  ).toEqual(
    expect.objectContaining({
      detail: expect.stringContaining('Not reordered'),
      status: 'blocked',
    }),
  );
  expect(separated.groups).toEqual([]);
});

test('does not reorder duplicate runtime declaration names', () => {
  const report = inspectDeclarationOrder(
    '/repo/duplicate.ts',
    'function alpha() {}\nfunction alpha() {}',
  );
  expect(report.blockers).toEqual([
    'Runtime declarations have duplicate names.',
  ]);
});

test('ignores comments and escaped strings while detecting local shadowing', () => {
  const report = inspectDeclarationOrder(
    '/repo/trivia.ts',
    [
      '// comment',
      'function alpha() {',
      "  const quote = '\\\\';",
      '  /* another comment */',
      '  const beta = () => undefined;',
      '  return beta();',
      '}',
      'function beta() {}',
    ].join('\n'),
  );
  expect(report.blockers).toEqual([
    'Runtime declaration alpha shadows sortable names: beta.',
  ]);
});

test('detects nested function declarations that shadow sortable names', () => {
  const report = inspectDeclarationOrder(
    '/repo/nested.ts',
    [
      'function alpha() { function beta() { return 1; } return beta(); }',
      'function beta() { return 2; }',
    ].join('\n'),
  );
  expect(report.blockers).toEqual([
    'Runtime declaration alpha shadows sortable names: beta.',
  ]);
});

test('ignores declarations without a sortable name', () => {
  expect(
    inspectDeclarationOrder(
      '/repo/default.ts',
      'export default function () {}\nfunction alpha() {}',
    ).groups,
  ).toEqual([]);
});

test('uses the shared evidence controller for baseline, candidate, and challenge', () => {
  const baselineReport = inspectDeclarationOrder(
    '/repo/order.ts',
    'function zebra() {}\nfunction alpha() {}',
  );
  const candidateReport = inspectDeclarationOrder(
    '/repo/order.ts',
    'function alpha() {}\nfunction zebra() {}',
  );
  expect(
    evaluateDeclarationOrderLifecycle({
      phase: 'baseline',
      report: baselineReport,
    }),
  ).toEqual(
    expect.objectContaining({
      decision: expect.objectContaining({ nextStep: 'candidate' }),
      receipt: expect.objectContaining({ state: 'baseline_recorded' }),
    }),
  );
  expect(
    evaluateDeclarationOrderLifecycle({
      phase: 'candidate',
      report: candidateReport,
    }),
  ).toEqual(
    expect.objectContaining({
      decision: expect.objectContaining({ nextStep: 'challenge' }),
      receipt: expect.objectContaining({ state: 'candidate_submitted' }),
    }),
  );
  expect(
    evaluateDeclarationOrderLifecycle({
      phase: 'challenge',
      report: candidateReport,
    }),
  ).toEqual(
    expect.objectContaining({
      decision: expect.objectContaining({ nextStep: 'accept' }),
      receipt: expect.objectContaining({ state: 'challenge_checked' }),
    }),
  );
  expect(
    evaluateDeclarationOrderLifecycle({
      phase: 'candidate',
      report: baselineReport,
    }),
  ).toEqual(
    expect.objectContaining({
      decision: expect.objectContaining({ nextStep: 'repair' }),
    }),
  );
  expect(
    evaluateDeclarationOrderLifecycle({
      phase: 'candidate',
      report: inspectDeclarationOrder(
        '/repo/cycle.ts',
        'function beta() { return alpha(); }\nfunction alpha() { return beta(); }',
      ),
    }),
  ).toEqual(expect.objectContaining({ receipt: expect.any(Object) }));
});
