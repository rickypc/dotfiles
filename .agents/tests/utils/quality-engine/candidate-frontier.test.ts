import { expect, test } from 'bun:test';
import * as sut from '../../../utils/quality-engine/candidate-frontier.js';

type CaseResult = sut.CandidateCaseResult;
type Snapshot = Parameters<typeof sut.paretoFrontierFor>[0][number];

const snapshotWith = (snapshotValue: Snapshot, override: Record<string, unknown>): Snapshot =>
  ({ ...snapshotValue, ...override }) as Snapshot;

const sourceFingerprintFor = (candidateId: string): string =>
  candidateId
    .split('')
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(64, '0')
    .slice(0, 64);

const candidateSnapshot = (
  candidateId: string,
  validationCases: Snapshot['validationCases'] = {
    'case-a': {
      axes: {
        'negative-constraint-adherence': 'pass',
        'schema-diff-integrity': 'pass',
        'scope-discipline': 'pass',
        'step-sequence-compliance': 'pass',
      },
      evidencePath: '/tmp/validation/bounded-file-edit.json',
      hardAssertionsPass: true,
      taskFamily: 'bounded-file-edit',
    },
  },
  overrides: Record<string, unknown> = {},
): Snapshot =>
  ({
    candidateId,
    matrixFingerprint: 'a'.repeat(64),
    snapshotPath: `/tmp/snapshots/${candidateId}.json`,
    sourceFingerprint: sourceFingerprintFor(candidateId),
    validationCases,
    ...overrides,
  }) as Snapshot;

const statuses = (status: 'fail' | 'pass') => ({
  'negative-constraint-adherence': status,
  'schema-diff-integrity': status,
  'scope-discipline': status,
  'step-sequence-compliance': status,
});

const validationCaseResult = (
  taskFamily: string,
  axes: CaseResult['axes'] = {
    'negative-constraint-adherence': 'pass',
    'schema-diff-integrity': 'pass',
    'scope-discipline': 'pass',
    'step-sequence-compliance': 'pass',
  },
  overrides: Record<string, unknown> = {},
): CaseResult =>
  ({
    axes,
    evidencePath: `/tmp/validation/${taskFamily}.json`,
    hardAssertionsPass: true,
    taskFamily,
    ...overrides,
  }) as CaseResult;

test('returns an empty frontier and no selection when no snapshots exist', () => {
  const baseline = candidateSnapshot('baseline', {
    'case-a': validationCaseResult('bounded-file-edit'),
  });
  expect(sut.paretoFrontierFor([])).toEqual([]);
  expect(sut.selectValidationCandidate([], baseline)).toBeNull();
});

test('rejects a non-array candidate collection', () => {
  expect(() => sut.paretoFrontierFor(null as unknown as Snapshot[])).toThrow(
    'Candidate snapshots must be an array',
  );
});

test('removes a strictly dominated candidate across every task-family axis', () => {
  const weaker = candidateSnapshot('candidate-a', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('fail')),
  });
  const stronger = candidateSnapshot('candidate-b', {
    'case-a': validationCaseResult('bounded-file-edit', {
      ...statuses('fail'),
      'negative-constraint-adherence': 'pass',
    }),
  });
  expect(sut.paretoFrontierFor([weaker, stronger])).toEqual([stronger]);
});

test('retains candidates with trade-offs across task families and rubric axes', () => {
  const first = candidateSnapshot('candidate-b', {
    'case-a': validationCaseResult('bounded-file-edit', {
      ...statuses('fail'),
      'schema-diff-integrity': 'pass',
    }),
    'case-b': validationCaseResult('tool-sequence', statuses('fail')),
  });
  const second = candidateSnapshot('candidate-a', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('fail')),
    'case-b': validationCaseResult('tool-sequence', {
      ...statuses('fail'),
      'step-sequence-compliance': 'pass',
    }),
  });
  expect(sut.paretoFrontierFor([first, second])).toEqual([second, first]);
});

test('excludes hard-failing snapshots from the Pareto frontier', () => {
  const hardFailure = candidateSnapshot('candidate-a', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('pass'), {
      hardAssertionsPass: false,
    }),
  });
  const partial = candidateSnapshot('candidate-b', {
    'case-a': validationCaseResult('bounded-file-edit', {
      ...statuses('pass'),
      'scope-discipline': 'fail',
    }),
  });
  expect(sut.paretoFrontierFor([hardFailure, partial])).toEqual([partial]);
});

test('selects only fully passing validation candidates and uses a stable id tie-break', () => {
  const baseline = candidateSnapshot('baseline', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('fail')),
    'case-b': validationCaseResult('tool-sequence', statuses('fail')),
    'case-c': validationCaseResult('tool-sequence', statuses('pass')),
  });
  const fewerGains = candidateSnapshot('candidate-z', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('pass')),
    'case-b': validationCaseResult('tool-sequence', statuses('fail')),
    'case-c': validationCaseResult('tool-sequence', statuses('pass')),
  });
  const tieWinner = candidateSnapshot('candidate-a', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('pass')),
    'case-b': validationCaseResult('tool-sequence', statuses('pass')),
    'case-c': validationCaseResult('tool-sequence', statuses('pass')),
  });
  const tieLater = candidateSnapshot('candidate-b', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('pass')),
    'case-b': validationCaseResult('tool-sequence', statuses('pass')),
    'case-c': validationCaseResult('tool-sequence', statuses('pass')),
  });
  const regresses = candidateSnapshot('candidate-0', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('pass')),
    'case-b': validationCaseResult('tool-sequence', statuses('pass')),
    'case-c': validationCaseResult('tool-sequence', statuses('fail')),
  });
  const hardFailure = candidateSnapshot('candidate-hard', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('pass')),
    'case-b': validationCaseResult('tool-sequence', statuses('pass')),
    'case-c': validationCaseResult('tool-sequence', statuses('pass'), {
      hardAssertionsPass: false,
    }),
  });

  expect(
    sut.selectValidationCandidate(
      [fewerGains, tieLater, regresses, hardFailure, tieWinner],
      baseline,
    ),
  ).toEqual(tieWinner);
  expect(sut.selectValidationCandidate([fewerGains], baseline)).toBeNull();
});

test('does not select an unchanged validation vector without a gain', () => {
  const baseline = candidateSnapshot('baseline', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('pass')),
  });
  const unchanged = candidateSnapshot('candidate-a', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('pass')),
  });
  expect(sut.selectValidationCandidate([unchanged], baseline)).toBeNull();
});

const incomparableSnapshots = [
  {
    label: 'different matrix fingerprints',
    snapshots: [
      candidateSnapshot('candidate-a'),
      snapshotWith(candidateSnapshot('candidate-b'), { matrixFingerprint: 'b'.repeat(64) }),
    ],
  },
  {
    label: 'different validation case coverage',
    snapshots: [
      candidateSnapshot('candidate-a'),
      candidateSnapshot('candidate-b', { 'case-b': validationCaseResult('tool-sequence') }),
    ],
  },
  {
    label: 'different task-family coverage',
    snapshots: [
      candidateSnapshot('candidate-a'),
      candidateSnapshot('candidate-b', {
        'case-a': validationCaseResult('tool-sequence'),
      }),
    ],
  },
];

test.each(incomparableSnapshots)('rejects incomparable snapshots: $label', ({ snapshots }) => {
  expect(() => sut.paretoFrontierFor(snapshots)).toThrow();
});

test('requires the baseline to pass hard assertions before selecting candidates', () => {
  const failingBaseline = candidateSnapshot('baseline', {
    'case-a': validationCaseResult('bounded-file-edit', statuses('fail'), {
      hardAssertionsPass: false,
    }),
  });
  expect(() => sut.selectValidationCandidate([], failingBaseline)).toThrow(
    'Baseline validation requires passing hard assertions',
  );
});

const invalidSnapshots = [
  { label: 'non-object snapshot', snapshots: [null as unknown as Snapshot] },
  {
    label: 'empty validation case map',
    snapshots: [snapshotWith(candidateSnapshot('candidate-a'), { validationCases: {} })],
  },
  {
    label: 'non-object validation case',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: { 'case-a': null },
      }),
    ],
  },
  {
    label: 'unsupported validation case field',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: {
          'case-a': validationCaseResult('bounded-file-edit', statuses('pass'), {
            unsupported: true,
          }),
        },
      }),
    ],
  },
  {
    label: 'blank case id',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: { '': validationCaseResult('bounded-file-edit') },
      }),
    ],
  },
  {
    label: 'blank task family',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: { 'case-a': validationCaseResult(' ') },
      }),
    ],
  },
  {
    label: 'invalid hard-assertion result',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: {
          'case-a': validationCaseResult('bounded-file-edit', statuses('pass'), {
            hardAssertionsPass: 'yes',
          }),
        },
      }),
    ],
  },
  {
    label: 'blank evidence path',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: {
          'case-a': validationCaseResult('bounded-file-edit', statuses('pass'), {
            evidencePath: ' ',
          }),
        },
      }),
    ],
  },
  {
    label: 'unknown axis',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: {
          'case-a': validationCaseResult('bounded-file-edit', {
            ...statuses('pass'),
            'invented-axis': 'pass',
          } as CaseResult['axes']),
        },
      }),
    ],
  },
  {
    label: 'invalid axis status',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: {
          'case-a': validationCaseResult('bounded-file-edit', {
            ...statuses('pass'),
            'schema-diff-integrity': 'unknown',
          } as unknown as CaseResult['axes']),
        },
      }),
    ],
  },
  {
    label: 'missing axis',
    snapshots: [
      snapshotWith(candidateSnapshot('candidate-a'), {
        validationCases: {
          'case-a': validationCaseResult('bounded-file-edit', {
            'negative-constraint-adherence': 'pass',
            'schema-diff-integrity': 'pass',
            'scope-discipline': 'pass',
          } as CaseResult['axes']),
        },
      }),
    ],
  },
  {
    label: 'duplicate candidate id',
    snapshots: [
      candidateSnapshot('candidate-a'),
      snapshotWith(candidateSnapshot('candidate-b'), { candidateId: 'candidate-a' }),
    ],
  },
  {
    label: 'blank candidate id',
    snapshots: [snapshotWith(candidateSnapshot('candidate-a'), { candidateId: ' ' })],
  },
  {
    label: 'invalid matrix fingerprint',
    snapshots: [snapshotWith(candidateSnapshot('candidate-a'), { matrixFingerprint: 'stale' })],
  },
  {
    label: 'duplicate source fingerprint',
    snapshots: [
      candidateSnapshot('candidate-a'),
      snapshotWith(candidateSnapshot('candidate-b'), {
        sourceFingerprint: candidateSnapshot('candidate-a').sourceFingerprint,
      }),
    ],
  },
  {
    label: 'extra snapshot field',
    snapshots: [snapshotWith(candidateSnapshot('candidate-a'), { score: 1 })],
  },
];

test.each(invalidSnapshots)('rejects malformed candidate evidence: $label', ({ snapshots }) => {
  expect(() => sut.paretoFrontierFor(snapshots)).toThrow();
});
