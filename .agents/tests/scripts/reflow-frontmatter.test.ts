/**
 * reflow frontmatter scalar contract - scenarios s53-s62. Pure transform
 * tests over the engine: no filesystem boundary is touched, so no module
 * mocks are registered here. Mutation map: scoring the fit on the value
 * alone instead of the whole key line fails s53 and s55; skipping the
 * quoted-value unwrap fails s54, s55, s57, and s60; applying the normalizer
 * in default mode fails s59; a stale region bound after a fold splice fails
 * s62.
 */

import { describe, expect, test } from 'bun:test';
import { reflowText, verifyInvariants } from '../../utils/reflow-file.js';

const fmDoc = (fm: string) =>
  `---\n${fm}\n---\n\nSingle line body paragraph that band mode leaves authored.\n`;

describe('band mode: frontmatter scalar contract', () => {
  test('s53: a plain scalar whose key line exceeds the width folds to a >- block', () => {
    const authored = fmDoc(
      'name: biome-tsc-checker\ndescription: Run Biome and strict TypeScript checks for explicitly selected JavaScript or TypeScript paths.',
    );
    const r = reflowText(authored, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain(
      'description: >-\n  Run Biome and strict TypeScript checks for explicitly selected JavaScript or TypeScript paths.',
    );
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(authored, r.output)).toEqual([]);
  });

  test('s54: a quoted scalar whose key line fits unwraps to plain', () => {
    const authored = fmDoc(
      'description: "Turn a user request into one explicit six-section execution plan and hand it to /aidx."',
    );
    const r = reflowText(authored, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain(
      'description: Turn a user request into one explicit six-section execution plan and hand it to /aidx.',
    );
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(authored, r.output)).toEqual([]);
  });

  test('s55: a quoted scalar past the width folds instead of unwrapping', () => {
    const authored = fmDoc(
      'description: "Read a user-supplied six-section plan path and execute its instructions deterministically."',
    );
    const r = reflowText(authored, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain(
      'description: >-\n  Read a user-supplied six-section plan path and execute its instructions deterministically.',
    );
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(authored, r.output)).toEqual([]);
  });

  test('s56: a long plain scalar wraps greedily at the width with a two-space indent', () => {
    const authored = fmDoc(
      'description: Generate or convert quality-focused TypeScript Bun tests for one selected JavaScript or TypeScript SUT.',
    );
    const r = reflowText(authored, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain(
      'description: >-\n  Generate or convert quality-focused TypeScript Bun tests for one selected JavaScript or TypeScript\n  SUT.',
    );
    const folded = r.output.split('\n').filter((l) => l.startsWith('  '));
    expect(folded.map((l) => [...l].length)).toEqual([100, 6]);
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(authored, r.output)).toEqual([]);
  });

  test('s57: a quoted argument-hint unwraps when the plain form is safe', () => {
    const authored = fmDoc('argument-hint: "<goal-and-concerns>"');
    const r = reflowText(authored, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain('argument-hint: <goal-and-concerns>');
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(authored, r.output)).toEqual([]);
  });

  test('s58: type-like and escaped scalars keep their authored representation', () => {
    const doc = [
      '---',
      'version: "3"',
      'limit: 7',
      'flag: true',
      'escaped: "a\\tb"',
      'empty: ""',
      'keywords: [one, two]',
      '---',
      '',
      'Single line body paragraph that band mode leaves authored.',
      '',
    ].join('\n');
    const r = reflowText(doc, { band: true });
    expect(r.changed).toBe(false);
    const kept = [
      'version: "3"',
      'limit: 7',
      'flag: true',
      'escaped: "a\\tb"',
      'empty: ""',
      'keywords: [one, two]',
    ];
    for (const line of kept) {
      expect(r.output).toContain(line);
    }
    expect(verifyInvariants(doc, r.output)).toEqual([]);
  });
});

describe('band mode: frontmatter guardrails', () => {
  test('s59: default mode leaves quoted and over-width frontmatter untouched', () => {
    const doc = [
      '---',
      'description: "Read a user-supplied six-section plan path and execute its instructions deterministically."',
      'argument-hint: "<goal-and-concerns>"',
      '---',
      '',
      'A body paragraph that is deliberately long enough to run past one hundred columns so the wrap must move it here.',
      '',
    ].join('\n');
    const r = reflowText(doc);
    expect(r.changed).toBe(true);
    expect(r.output).toContain(
      'description: "Read a user-supplied six-section plan path and execute its instructions deterministically."',
    );
    expect(r.output).toContain('argument-hint: "<goal-and-concerns>"');
  });

  test('s60: a plain-unsafe scalar folds even when the quoted line would fit', () => {
    const authored = fmDoc('description: "Chapter 1: the opening"');
    const r = reflowText(authored, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain('description: >-\n  Chapter 1: the opening');
    expect(verifyInvariants(authored, r.output)).toEqual([]);
  });

  test('s61: an unclosed frontmatter region never triggers normalization', () => {
    const doc = '---\nnever closed frontmatter\n\nBody text stays as-is.';
    const r = reflowText(doc, { band: true });
    expect(r.changed).toBe(false);
    expect(r.output).toBe(doc);
  });

  test('s62: a fold does not hide later frontmatter keys from normalization', () => {
    const authored = fmDoc(
      'name: frontend-design\ndescription: Define or review a user-facing web UI visual direction interaction states responsive behavior and accessibility for the whole interface here.\nargument-hint: "<ui-brief> <design-system>"',
    );
    const r = reflowText(authored, { band: true });
    expect(r.output).toContain('argument-hint: <ui-brief> <design-system>');
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(authored, r.output)).toEqual([]);
  });
});

describe('band mode: frontmatter invariants and edges', () => {
  test('s63: an unbreakable over-width atom stays authored and reports a residual', () => {
    const authored = fmDoc(`token: ${'x'.repeat(120)}`);
    const r = reflowText(authored, { band: true });
    expect(r.changed).toBe(false);
    expect(r.residuals).toHaveLength(1);
    expect(r.residuals[0]?.reason).toBe('fm-scalar-unrepresentable');
    expect(r.residuals[0]?.blockKind).toBe('fm-scalar');
    expect(verifyInvariants(authored, r.output)).toEqual([]);
  });

  test('s64: block scalars, arrays, anchors, and escaped quotes stay verbatim in band mode', () => {
    const doc = [
      '---',
      'folded: >-',
      '  A short narrow folded line',
      '',
      '  second folded paragraph after a blank',
      'literal: |',
      '  kept exactly',
      'tags: [one, two]',
      'anchor: &a value',
      'alias: *a',
      "single: 'unwrap me'",
      "escaped: 'it''s kept'",
      '---',
      '',
      'Single line body paragraph that band mode leaves authored.',
      '',
    ].join('\n');
    const r = reflowText(doc, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain(
      'folded: >-\n  A short narrow folded line\n\n  second folded paragraph after a blank',
    );
    expect(r.output).toContain('literal: |\n  kept exactly');
    expect(r.output).toContain('tags: [one, two]');
    expect(r.output).toContain('anchor: &a value');
    expect(r.output).toContain('alias: *a');
    expect(r.output).toContain("escaped: 'it''s kept'");
    expect(r.output).toContain('single: unwrap me');
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(doc, r.output)).toEqual([]);
  });

  test('s65: verifyInvariants falls back to whole-text compare on unclosed frontmatter', () => {
    const doc = '---\nnever closed frontmatter\n\nBody text stays as-is.';
    expect(verifyInvariants(doc, doc)).toEqual([]);
    expect(
      verifyInvariants(doc, '---\nnever closed frontmatter\n\nBody text stays as-is. edited.'),
    ).toEqual(['whitespace-normalized text changed', 'ordered atom list changed']);
  });

  test('s66: verifyInvariants rejects a changed value while accepting re-representation', () => {
    const authored = fmDoc(
      'description: "Turn a user request into one explicit six-section execution plan."',
    );
    const reflowed = reflowText(authored, { band: true }).output;
    expect(verifyInvariants(authored, reflowed)).toEqual([]);
    const mutated = reflowed.replace('explicit six-section', 'mangled seven-section');
    expect(verifyInvariants(authored, mutated)).toContain('frontmatter resolved scalars changed');
  });

  test('s67: a control character blocks the plain form and a multiline array stays raw', () => {
    const ctrl = String.fromCharCode(1);
    const doc = [
      '---',
      `odd: "a${ctrl}b c"`,
      'keywords: [',
      '  alpha,',
      '  beta,',
      ']',
      '---',
      '',
      'Single line body paragraph that band mode leaves authored.',
      '',
    ].join('\n');
    const r = reflowText(doc, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain(`odd: >-\n  a${ctrl}b c`);
    expect(r.output).toContain('keywords: [\n  alpha,\n  beta,\n]');
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(doc, r.output)).toEqual([]);
  });

  test('s68: normalization stops at the closing delimiter and never reaches the body', () => {
    const doc = [
      '---',
      'name: keeps',
      '---',
      '',
      '```yaml',
      'description: body yaml inside a fence deliberately made over one hundred columns wide right here.',
      'argument-hint: "<never-touched>"',
      '```',
      '',
    ].join('\n');
    const r = reflowText(doc, { band: true });
    expect(r.changed).toBe(false);
    expect(r.output).toBe(doc);
  });
});
