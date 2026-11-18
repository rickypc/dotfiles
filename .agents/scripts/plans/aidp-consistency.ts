interface Exclusion {
  readonly id: string;
  readonly tokens: readonly string[];
}

interface PhaseBlock {
  readonly name: string;
  readonly number: number;
  readonly text: string;
}

export type PlanSections = Readonly<Record<string, string>>;

const NUMBER_WORDS: readonly string[] = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

const LABEL_CLAIM = new RegExp(
  `\\b(\\d+|${NUMBER_WORDS.join('|')})\\s+(?:output\\s+)?labels\\b`,
  'giu',
);
const OUTPUT_LABEL_ROW = /^\s*\d+\.\s+`[^`]+:`/u;
const EXCLUSION_ROW = /Exclusion\s+(E-\d+)\s*\|\s*covers:\s*([^|\n]+)\|/giu;
const INCLUDED_SCOPE = /\*\*Included scope\.?\*\*([\s\S]*?)(?:\n\s*\n|$)/iu;
const TARGET_FIELD = /Target:\s*([^;\n]+)/iu;
const TASK_ITEM = /^\s*- \[[ x-]\]/u;
const READ_ONLY_TARGET = /\b(?:proposed|diff|read-only|report|preview|unchanged|hash)\b/iu;
const COUNT_ROW = /Count\s+C-\d+`?\s*[|:]\s*([A-Za-z][A-Za-z ]*?)\s*=\s*(\d+)/giu;
const CAP_ARITHMETIC = /(\d+)\s*x\s*(\d+)\s*=\s*(\d+)/giu;
const CAP_CLAIM = /\bcap of (\d+)\b/giu;
const EVIDENCE_RECORD = /\*\*Evidence record[^\n]*\n([\s\S]*?)(?=\n\*\*[^\n]+\*\*|$)/u;
const EVIDENCE_STAMP = /\b(?:verified|verification|receipt|evidence:)/iu;
const REGISTER_ROW = /^\|\s*(PD-\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/gmu;
const REGISTER_REFERENCE = /\bPD-\d+\b/gu;
const PHASE_HEADER = /^### Phase (\d+) - (.+)$/gmu;

const capIssues = (body: string, execution: string): readonly string[] => {
  const registered = new Set<number>();
  const issues: string[] = [];
  for (const match of body.matchAll(CAP_ARITHMETIC)) {
    const product = Number(match[1]) * Number(match[2]);
    if (product === Number(match[3])) {
      registered.add(product);
    } else {
      issues.push(`Cap arithmetic ${match[0]} is wrong; the product is ${product}.`);
    }
  }
  for (const match of execution.matchAll(CAP_CLAIM)) {
    if (!registered.has(Number(match[1]))) {
      issues.push(`Cap of ${match[1]} has no matching base x multiplier = cap arithmetic.`);
    }
  }
  return issues;
};

const countedActual = (noun: string, labels: number, phases: number): number | undefined => {
  if (/\blabels?\b/u.test(noun)) {
    return labels;
  }
  return /\bphases?\b/u.test(noun) ? phases : undefined;
};

const countIssues = (body: string, labels: number, phases: number): readonly string[] => {
  const seen = new Map<string, number>();
  const issues: string[] = [];
  for (const match of body.matchAll(COUNT_ROW)) {
    const noun = match[1].trim().toLowerCase();
    const value = Number(match[2]);
    const previous = seen.get(noun);
    if (previous !== undefined && previous !== value) {
      issues.push(`Count register gives "${noun}" as both ${previous} and ${value}.`);
    }
    seen.set(noun, value);
    const actual = countedActual(noun, labels, phases);
    if (actual !== undefined && actual !== value) {
      issues.push(`Count register states ${value} ${noun} but the plan holds ${actual}.`);
    }
  }
  return issues;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const coveredToken = (text: string, exclusion: Exclusion): string | undefined =>
  exclusion.tokens.find((token) =>
    new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(token)}(?![A-Za-z0-9_])`, 'iu').test(text),
  );

const evidenceIssues = (target: string): readonly string[] =>
  (EVIDENCE_RECORD.exec(target)?.[1] ?? '')
    .split(/\n(?=- )/u)
    .map((bullet) => bullet.trim())
    .filter((bullet) => bullet.startsWith('- ') && !EVIDENCE_STAMP.test(bullet))
    .map((bullet) => `Evidence record bullet lacks a verification stamp: "${bullet.slice(0, 60)}"`);

const outputLabels = (output: string): number =>
  output.split('\n').filter((line) => OUTPUT_LABEL_ROW.test(line)).length;

const parseExclusions = (target: string): readonly Exclusion[] =>
  [...target.matchAll(EXCLUSION_ROW)].map((match) => ({
    id: match[1],
    tokens: match[2]
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  }));

const exclusionIssues = (target: string, workflow: string): readonly string[] => {
  const scope = INCLUDED_SCOPE.exec(target)?.[1] ?? '';
  const fields = workflow
    .split('\n')
    .filter((line) => TASK_ITEM.test(line))
    .map((line) => TARGET_FIELD.exec(line)?.[1] ?? '');
  return parseExclusions(target).flatMap((exclusion) => {
    const scopeToken = coveredToken(scope, exclusion);
    const issues = scopeToken
      ? [`Included scope names "${scopeToken}", which Exclusion ${exclusion.id} excludes.`]
      : [];
    fields.forEach((field, index) => {
      const token = coveredToken(field, exclusion);
      if (token && !READ_ONLY_TARGET.test(field)) {
        issues.push(
          `Workflow step ${index + 1} targets "${token}", which Exclusion ${exclusion.id} excludes.`,
        );
      }
    });
    return issues;
  });
};

const phaseBlocks = (workflow: string): readonly PhaseBlock[] => {
  const headers = [...workflow.matchAll(PHASE_HEADER)];
  return headers.map((header, index) => ({
    name: header[2],
    number: Number(header[1]),
    text: workflow.slice(
      (header.index ?? 0) + header[0].length,
      headers[index + 1]?.index ?? workflow.length,
    ),
  }));
};

const phaseIssues = (blocks: readonly PhaseBlock[]): readonly string[] => {
  const issues = /\bpreflight\b/iu.test(blocks[0].name)
    ? []
    : ['Phase 1 must be a Preflight phase when the plan has two or more phases.'];
  for (const block of blocks) {
    if (!/\bDeliverable:/u.test(block.text)) {
      issues.push(`Phase ${block.number} completion criteria must state a Deliverable:.`);
    }
  }
  return issues;
};

const registerIssues = (body: string, target: string): readonly string[] => {
  const rows = [...target.matchAll(REGISTER_ROW)];
  if (rows.length === 0) {
    return ['Plan must declare a Predicted deviations table with PD-n rows in TARGET DIRECTIVES.'];
  }
  const declared = new Set<string>();
  const issues: string[] = [];
  for (const row of rows) {
    if (declared.has(row[1])) {
      issues.push(`Predicted deviations id ${row[1]} is declared more than once.`);
    }
    declared.add(row[1]);
    if ([row[2], row[3], row[4]].some((cell) => cell.trim().length === 0)) {
      issues.push(`Predicted deviations row ${row[1]} has an empty cell.`);
    }
  }
  const unknown = new Set(
    [...body.matchAll(REGISTER_REFERENCE)]
      .map((match) => match[0])
      .filter((id) => !declared.has(id)),
  );
  for (const id of unknown) {
    issues.push(`Plan references ${id}, which the Predicted deviations table does not declare.`);
  }
  return issues;
};

const toCount = (token: string): number => {
  const numeric = Number(token);
  return Number.isInteger(numeric) ? numeric : NUMBER_WORDS.indexOf(token.toLowerCase());
};

const labelCountIssues = (body: string, labels: number): readonly string[] => {
  if (labels === 0) {
    return [];
  }
  return [...body.matchAll(LABEL_CLAIM)]
    .filter((match) => toCount(match[1]) !== labels)
    .map(
      (match) => `Plan states ${match[1]} output labels but RIGID OUTPUT SCHEMA lists ${labels}.`,
    );
};

export const consistencyIssues = (body: string, sections: PlanSections): readonly string[] => {
  const target = sections['TARGET DIRECTIVES'] ?? '';
  const workflow = sections['CHRONOLOGICAL WORKFLOW'] ?? '';
  const output = sections['RIGID OUTPUT SCHEMA'] ?? '';
  const execution = [
    workflow,
    sections['TOOL STRATEGY & FALLBACKS'] ?? '',
    sections['SYSTEMATIC VERIFICATION CHECKLIST'] ?? '',
    output,
  ].join('\n');
  const blocks = phaseBlocks(workflow);
  const labels = outputLabels(output);
  return [
    ...labelCountIssues(body, labels),
    ...exclusionIssues(target, workflow),
    ...countIssues(body, labels, blocks.length),
    ...capIssues(body, execution),
    ...evidenceIssues(target),
    ...(blocks.length >= 2 ? [...registerIssues(body, target), ...phaseIssues(blocks)] : []),
  ];
};
