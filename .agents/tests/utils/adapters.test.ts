import { expect, test } from 'bun:test';

import {
  isCodingAssistant,
  renderAdapterHandoff,
} from '../../utils/adapters.js';

test.each(['opencode', 'codex', 'claude-code', 'kiro-ide'])(
  'renders a manual %s handoff',
  (assistant) => {
    expect(isCodingAssistant(assistant)).toBeTrue();
    expect(renderAdapterHandoff(assistant, '/agents')).toContain('/agents');
  },
);

test('limits native Kiro IDE instructions to the Kiro adapter', () => {
  expect(renderAdapterHandoff('kiro-ide', '/agents')).toContain('.kiro assets');
  expect(renderAdapterHandoff('codex', '/agents')).not.toContain(
    '.kiro assets',
  );
});

test('rejects unknown adapter names through the type guard', () => {
  expect(isCodingAssistant('unknown')).toBeFalse();
});
