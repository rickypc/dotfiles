import type { CommandDeclaration } from '../utils/cli/declaration.js';
import { runMain } from '../utils/cli/index.js';
import { UsageError } from '../utils/cli/usage-error.js';

export type CodingAssistant = 'claude-code' | 'codex' | 'kiro-ide' | 'opencode' | 'vscode';

const assistantLabels: Readonly<Record<CodingAssistant, string>> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'kiro-ide': 'Kiro IDE',
  opencode: 'OpenCode',
  vscode: 'VS Code',
};

export const isCodingAssistant = (value: string): value is CodingAssistant =>
  value in assistantLabels;

export const renderAdapterHandoff = (assistant: CodingAssistant, agentsRoot: string): string =>
  [
    `# ${assistantLabels[assistant]} universal-agent handoff`,
    '',
    `Load universal skills, prompts, role cards, scripts, and utilities from ${agentsRoot}.`,
    'Do not copy, install, symlink, or modify assistant-native configuration.',
    ...(assistant === 'kiro-ide'
      ? ['Use this handoff in the active Kiro IDE session; do not create native .kiro assets.']
      : assistant === 'vscode'
        ? [
            'Use this handoff in the active VS Code session; its universal runtime boundary is the same as Kiro IDE.',
          ]
        : []),
    'Use canonical skill names; invocation aliases resolve only to their canonical skill.',
    'For active lifecycle, run the stage packet script before every stage and read every returned asset.',
    'Resolve private organization, team, and project KB context at Reverse Engineering (2.1).',
    'Run deterministic scripts before claiming a workflow state or validation result.',
  ].join('\n');

export const command: CommandDeclaration<string> = {
  arity: [2, 2],
  positionals: '<claude-code|codex|kiro-ide|opencode|vscode> <agents-root>',
  renderText: (handoff) => handoff,
  run: (input) => {
    const [assistant = '', agentsRoot = ''] = input.positionals;
    if (!isCodingAssistant(assistant)) {
      throw new UsageError(`Unknown coding assistant "${assistant}".`);
    }
    return renderAdapterHandoff(assistant, agentsRoot);
  },
  script: 'scripts/adapter.ts',
  summary: 'Print the manual adapter handoff for one coding assistant.',
};

void runMain(command, import.meta.main);
