import { expect, mock, test } from 'bun:test';

import { run, usage, validReceiptLine } from '../../scripts/validate-skills.js';

const receipt = {
  matrixCount: 15,
  prose: {
    checkedLocalLinkTargets: 7,
    findings: [],
    ignoredPaths: [],
    prosePaths: Array.from({ length: 34 }, (_, index) => `path-${index}`),
    reviewedRoots: ['/tmp/.agents/skills'],
  },
  skillCount: 13,
  status: 'valid' as const,
};

test('renders one concise stable success receipt line', () => {
  expect(validReceiptLine(receipt)).toBe(
    'skill-validation: passed — 13 skills, 15 matrix cases, 34 prose paths, 7 local links checked.',
  );
});

test('runs the validator through its injected boundary and keeps the command contract', async () => {
  const validate = mock(async () => receipt);
  const write = mock();
  await run([], '/tmp/.agents', write, validate);
  expect(validate).toHaveBeenCalledWith(
    expect.anything(),
    '/tmp/.agents/skills',
  );
  expect(write).toHaveBeenCalledWith(validReceiptLine(receipt));
  expect(() => run(['unexpected'])).toThrow(usage());
});
