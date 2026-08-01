import { expect, test } from 'bun:test';

import {
  aidlcCommandContract,
  renderAidlcCommandContract,
} from '../../../utils/aidlc/command-contract.js';

test('renders one complete public AIDLC command contract', () => {
  expect(aidlcCommandContract()).toContain(
    '  start <intent-summary> [--ui] [--initial-record <json>]',
  );
  expect(renderAidlcCommandContract()).toContain('  approve <intent-path>');
  expect(renderAidlcCommandContract()).toContain('  recover <intent-path>');
  expect(renderAidlcCommandContract()).not.toContain('prepare ');
});
