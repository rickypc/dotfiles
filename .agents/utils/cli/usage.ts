import type { CommandBody, CommandDeclaration, OptionDeclaration } from './declaration.js';

const SHARED_LINES = [
  '  -h, --help, --usage  Print this usage text and exit 0.',
  '  --format <json|text>  Print the envelope as JSON (default) or the human view.',
  '  --agents-root <path>  Select the agents root; an absolute directory with skills or evals.',
];

const invocation = <Data>(script: string, body: CommandBody<Data>, command?: string): string =>
  [`bun <agents-root>/${script}`, command, body.positionals, '[options]']
    .filter((part) => part !== undefined && part !== '')
    .join(' ');

const optionLine = (name: string, option: OptionDeclaration): string => {
  const flag = `${option.short ? `-${option.short}, ` : ''}--${name}`;
  const placeholder = option.type === 'string' ? ` <${option.value ?? 'value'}>` : '';
  const repeat = option.multiple ? ' (repeatable)' : '';
  return `  ${flag}${placeholder}  ${option.description}${repeat}`;
};

const optionLines = <Data>(body: CommandBody<Data>): string[] =>
  Object.entries(body.options ?? {}).map(([name, option]) => optionLine(name, option));

export const usageText = <Data>(declaration: CommandDeclaration<Data>): string => {
  if (declaration.commands === undefined) {
    return [
      `Usage: ${invocation(declaration.script, declaration)}`,
      declaration.summary,
      'Options:',
      ...optionLines(declaration),
      ...SHARED_LINES,
    ].join('\n');
  }
  const sections = Object.entries(declaration.commands).flatMap(([name, body]) => [
    `  ${invocation(declaration.script, body, name)}`,
    `    ${body.summary}`,
    ...optionLines(body).map((line) => `  ${line}`),
  ]);
  const note =
    declaration.defaultCommand === undefined
      ? []
      : [`The command name "${declaration.defaultCommand}" may be omitted.`];
  return ['Usage:', ...sections, ...note, declaration.summary, 'Options:', ...SHARED_LINES].join(
    '\n',
  );
};
