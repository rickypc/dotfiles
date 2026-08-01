export interface AidlcGateConfig {
  readonly finalGate?: string;
}

export const finalGateFor = (config: AidlcGateConfig): string => {
  const gate = config.finalGate?.trim();
  return gate || defaultFinalGate;
};

export const finalGateReceipt = (gate: string, exitCode: number): string =>
  `final gate: ${gate} ${exitCode === 0 ? 'passed' : 'failed'} (exit ${exitCode})`;

export const parseAidlcGateConfig = (content: string): AidlcGateConfig => {
  if (!content.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AIDLC gate configuration must be valid JSON.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    ('finalGate' in parsed &&
      typeof (parsed as { finalGate?: unknown }).finalGate !== 'string')
  ) {
    throw new Error(
      'AIDLC gate configuration must contain a string finalGate.',
    );
  }
  return parsed as AidlcGateConfig;
};

export const defaultFinalGate = 'bun run test';
