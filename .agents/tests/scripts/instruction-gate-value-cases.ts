import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { Measurement, Receipt } from '../../scripts/instruction-gate.js';

interface GateValueContext {
  readonly currentFingerprint: typeof import('../../scripts/instruction-gate.js').currentFingerprint;
  readonly DOCUMENT: string;
  readonly fingerprintMatches: typeof import('../../scripts/instruction-gate.js').fingerprintMatches;
  readonly formatReceipt: typeof import('../../scripts/instruction-gate.js').formatReceipt;
  readonly hash: (value: string) => string;
  readonly measurement: (
    passed: readonly string[],
    failed: readonly string[],
    valid?: number,
  ) => Measurement;
  readonly RECEIPT_DIRECTORY: string;
  readonly ROOT_DOCUMENT_PATTERN: RegExp;
  readonly receiptPathFor: typeof import('../../scripts/instruction-gate.js').receiptPathFor;
  readonly SET: string;
  readonly SET_TEXT: string;
  readonly sealed: (overrides?: Partial<Omit<Receipt, 'selfSha256'>>) => Receipt;
  readonly sealReceipt: typeof import('../../scripts/instruction-gate.js').sealReceipt;
  readonly setPathFor: typeof import('../../scripts/instruction-gate.js').setPathFor;
}

export const registerGateValueCases = (context: GateValueContext): void => {
  const {
    DOCUMENT,
    RECEIPT_DIRECTORY,
    ROOT_DOCUMENT_PATTERN,
    SET,
    SET_TEXT,
    currentFingerprint,
    fingerprintMatches,
    formatReceipt,
    hash,
    measurement,
    receiptPathFor,
    sealReceipt,
    sealed,
    setPathFor,
  } = context;

  describe('paths and fingerprints', () => {
    test('maps a document to its receipt and comprehension set', () => {
      expect(receiptPathFor('skills/aidp/SKILL.md')).toBe(
        path.join(RECEIPT_DIRECTORY, 'skills--aidp--SKILL.json'),
      );
      expect(setPathFor('AGENTS.md')).toBe(path.join('evals', 'comprehension', 'AGENTS.json'));
      expect(setPathFor('skills/aidp/SKILL.md')).toBe(SET);
      expect(setPathFor('skills/aidp/references/deep/guide.md')).toBe(
        path.join('skills', 'aidp', 'evals', 'comprehension', 'references-deep-guide.json'),
      );
    });

    test('the root document pattern accepts instruction files only', () => {
      for (const name of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'AGENTS.local.md']) {
        expect(ROOT_DOCUMENT_PATTERN.test(name)).toBe(true);
      }
      for (const name of ['README.md', 'agents.md', 'AGENTS.json', 'MYAGENTS.md']) {
        expect(ROOT_DOCUMENT_PATTERN.test(name)).toBe(false);
      }
    });

    test.each(['bundleSha256', 'maxNewTokens', 'modelRevision', 'readerVersion'] as const)(
      'a different %s is a different reader',
      (field) => {
        const current = currentFingerprint();
        const other = { ...current, [field]: typeof current[field] === 'number' ? 999 : 'other' };

        expect(fingerprintMatches(current, current)).toBe(true);
        expect(fingerprintMatches(current, other)).toBe(false);
      },
    );

    test('a sealed receipt has sorted keys at every depth, whatever the construction order', () => {
      const shuffled = sealReceipt(
        {
          baseline: null,
          decision: 'baseline',
          document: DOCUMENT,
          documentSha256: hash('document text'),
          fingerprint: {
            bundleSha256: 'b',
            maxNewTokens: 8,
            modelRevision: 'm',
            readerVersion: 'v',
          },
          measurement: {
            trainFailed: ['t2'],
            trainPassed: ['t1'],
            validationPassed: 2,
            validationTotal: 3,
          },
          reason: '',
          schema: 1,
          setPath: SET,
          setSha256: hash(SET_TEXT),
        },
        hash,
      );

      expect(Object.keys(shuffled)).toEqual(Object.keys(shuffled).sort());
      expect(Object.keys(shuffled.measurement)).toEqual(Object.keys(shuffled.measurement).sort());
      expect(Object.keys(shuffled.fingerprint)).toEqual(Object.keys(shuffled.fingerprint).sort());
      expect(shuffled.selfSha256).toBe(
        sealReceipt(
          { ...shuffled, selfSha256: undefined } as unknown as Omit<Receipt, 'selfSha256'>,
          hash,
        ).selfSha256,
      );
    });

    test('sealing is deterministic and depends on every field', () => {
      expect(sealed().selfSha256).toBe(sealed().selfSha256);
      expect(sealed({ reason: 'x' }).selfSha256).not.toBe(sealed().selfSha256);
    });
  });

  describe('formatReceipt', () => {
    const many = Array.from(
      { length: 30 },
      (_value, index) => `train-${String(index).padStart(2, '0')}`,
    );

    test('keeps short arrays on one line, expands long ones, and ends with a newline', () => {
      const text = formatReceipt(sealed({ measurement: measurement(many, []) }));

      expect(text.endsWith('\n')).toBe(true);
      expect(text).toContain('"trainFailed": [],');
      expect(text).toContain('"trainPassed": [\n      "train-00",\n');
      expect(formatReceipt(sealed())).toContain('"trainFailed": ["t2"],');
      const lines = text.split('\n').filter((line) => !line.includes('Sha256'));
      expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(100);
    });

    test('round-trips through JSON and expands arrays that hold objects', () => {
      const odd = { ...sealed(), empty: {}, nested: [{ a: 1 }, [2, 3]] } as unknown as Receipt;
      const text = formatReceipt(odd);

      expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(odd)));
      expect(text).toContain('"empty": {},');
      expect(text).toContain('"nested": [\n    {\n      "a": 1\n    },\n    [2, 3]\n  ]');
    });
  });
};
