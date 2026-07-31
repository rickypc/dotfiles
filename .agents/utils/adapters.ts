export type CodingAssistant = 'claude-code' | 'codex' | 'kiro-ide' | 'opencode';

const assistantLabels: Readonly<Record<CodingAssistant, string>> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'kiro-ide': 'Kiro IDE',
  opencode: 'OpenCode',
};

export const isCodingAssistant = (value: string): value is CodingAssistant =>
  value in assistantLabels;

export const renderAdapterHandoff = (
  assistant: CodingAssistant,
  agentsRoot: string,
): string =>
  [
    `# ${assistantLabels[assistant]} universal-agent handoff`,
    '',
    `Load universal skills, prompts, role cards, scripts, and utilities from ${agentsRoot}.`,
    'Do not copy, install, symlink, or modify assistant-native configuration.',
    ...(assistant === 'kiro-ide'
      ? [
          'Use this handoff in the active Kiro IDE session; do not create native .kiro assets.',
        ]
      : []),
    'Use canonical skill names; invocation aliases resolve only to their canonical skill.',
    'For AIDLC, run the stage packet script before every stage and read every returned asset.',
    'Resolve private organization, team, and project KB context at practices-discovery.',
    'Run deterministic scripts before claiming a workflow state or validation result.',
  ].join('\n');
