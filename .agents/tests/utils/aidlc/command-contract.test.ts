import { expect, test } from 'bun:test';

import {
  aidlcCommandContract,
  renderAidlcCommandContract,
} from '../../../utils/aidlc/command-contract.js';

test('renders one complete public AIDLC command contract', () => {
  const contract = renderAidlcCommandContract();
  expect(aidlcCommandContract()).toContain(
    'Priority 1 — start one intent from the selected project root',
  );
  expect(contract).toContain(
    'Priority 4 — approve and record established post-approval evidence together',
  );
  expect(contract).toContain(
    'Priority 9 — run the final gate, close out without a durable lesson, and retire',
  );
  expect(contract).toContain('capture-and-begin');
  expect(contract).toContain('finalize-and-recover');
  expect(contract).not.toContain('...');
  expect(contract).not.toContain('[--');
  expect(renderAidlcCommandContract()).not.toContain('prepare ');
});
