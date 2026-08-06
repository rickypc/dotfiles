import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import Parser from 'tree-sitter';

import type { CheckResult } from './contracts.js';
import {
  type BaselineDecision,
  type CandidateDecision,
  type ChallengeDecision,
  decideBaseline,
  decideCandidate,
  decideChallenge,
} from './quality-engine/controller.js';
import {
  type ActionPacket,
  createActionPacket,
} from './quality-engine/packet.js';
import {
  createReceipt,
  type EvidenceReceipt,
} from './quality-engine/receipt.js';

export type DeclarationKind =
  | 'const-function'
  | 'function'
  | 'interface'
  | 'type';

interface DeclarationNode {
  readonly item: DeclarationOrderItem;
  readonly node: SyntaxNode;
  readonly start: number;
  readonly statementIndex: number;
}

export interface DeclarationOrderCheckResult extends CheckResult {
  readonly status: 'blocked' | 'failed' | 'passed';
}

export interface DeclarationOrderFixResult {
  readonly changed: boolean;
  readonly report: DeclarationOrderReport;
  readonly source: string;
}

export interface DeclarationOrderGroup {
  readonly currentOrder: readonly string[];
  readonly desiredOrder: readonly string[];
  readonly id: string;
  readonly items: readonly DeclarationOrderItem[];
  readonly kind: 'runtime' | 'types';
  readonly needsPlacement: boolean;
}

export interface DeclarationOrderItem {
  readonly end: number;
  readonly kind: DeclarationKind;
  readonly name: string;
  readonly start: number;
}

export interface DeclarationOrderLifecycleInput {
  readonly attempt?: number;
  readonly attemptBudget?: number;
  readonly phase: DeclarationOrderPhase;
  readonly report: DeclarationOrderReport;
}

export interface DeclarationOrderLifecycleResult {
  readonly decision: BaselineDecision | CandidateDecision | ChallengeDecision;
  readonly receipt: EvidenceReceipt;
}

export type DeclarationOrderPhase = 'baseline' | 'candidate' | 'challenge';

export interface DeclarationOrderReport {
  readonly blockers: readonly string[];
  readonly groups: readonly DeclarationOrderGroup[];
  readonly packet: ActionPacket | undefined;
  readonly sourceFingerprint: string;
  readonly violations: readonly string[];
}

interface SourceStatement {
  readonly end: number;
  readonly node: SyntaxNode;
  readonly start: number;
}

type SyntaxNode = Parser.SyntaxNode;

interface TypeScriptGrammars {
  readonly tsx: Parser.Language;
  readonly typescript: Parser.Language;
}

const require = createRequire(import.meta.url);
const TypeScript = require('tree-sitter-typescript') as TypeScriptGrammars;

const alphabetically = (left: string, right: string): number =>
  left.localeCompare(right, 'en', { sensitivity: 'base' });

const ancestors = (node: SyntaxNode): readonly SyntaxNode[] => {
  const result: SyntaxNode[] = [];
  let current = node.parent;
  while (current) {
    result.push(current);
    current = current.parent;
  }
  return result;
};

const childForField = (
  node: SyntaxNode,
  field: string,
): SyntaxNode | undefined => node.childForFieldName(field) ?? undefined;

const declarationNodeFor = (node: SyntaxNode): SyntaxNode =>
  node.type === 'export_statement'
    ? (childForField(node, 'declaration') ?? node)
    : node;

export const declarationOrderDetail = (
  report: DeclarationOrderReport,
): string =>
  [
    ...report.violations,
    ...report.blockers.map((blocker) => `Not reordered: ${blocker}`),
  ].join('\n') || 'Top-level declarations are canonical.';

export const declarationOrderResult = (
  report: DeclarationOrderReport,
): DeclarationOrderCheckResult => {
  const detail = declarationOrderDetail(report);
  if (report.violations.length > 0) {
    return {
      detail: `${detail}\nAction packet: ${JSON.stringify(report.packet)}`,
      name: 'declaration-order',
      status: 'failed',
    };
  }
  return report.blockers.length > 0
    ? { detail, name: 'declaration-order', status: 'blocked' }
    : { detail, name: 'declaration-order', status: 'passed' };
};

export const evaluateDeclarationOrderLifecycle = ({
  attempt = 1,
  attemptBudget = 2,
  phase,
  report,
}: DeclarationOrderLifecycleInput): DeclarationOrderLifecycleResult => {
  const result = declarationOrderResult(report);
  const state =
    phase === 'baseline'
      ? 'baseline_recorded'
      : phase === 'candidate'
        ? 'candidate_submitted'
        : 'challenge_checked';
  const receipt = createReceipt({
    checks: [
      phase === 'baseline'
        ? {
            detail: report.packet
              ? `Ordering facts recorded; action packet ${report.packet.packetId} is required.`
              : 'Ordering facts recorded; no action packet is required.',
            name: 'declaration-order-facts',
            status: 'passed',
          }
        : result,
    ],
    sourceFingerprint: report.sourceFingerprint,
    state,
  });
  if (phase === 'baseline') {
    return { decision: decideBaseline(receipt), receipt };
  }
  if (phase === 'candidate') {
    return {
      decision: decideCandidate({
        attempt,
        attemptBudget,
        receipt,
        state: 'candidate_submitted',
      }),
      receipt,
    };
  }
  return { decision: decideChallenge(receipt), receipt };
};

const hasField = (
  node: SyntaxNode,
  field: string,
  child: SyntaxNode,
): boolean => childForField(node, field)?.id === child.id;

const isBinding = (node: SyntaxNode, declaration: SyntaxNode): boolean => {
  const parent = node.parent;
  if (
    parent?.type === 'variable_declarator' &&
    hasField(parent, 'name', node)
  ) {
    return parent.id !== declaration.id;
  }
  if (
    parent?.type === 'function_declaration' &&
    hasField(parent, 'name', node)
  ) {
    return parent.id !== declaration.id;
  }
  return parent
    ? ancestors(node).some((ancestor) => ancestor.type === 'formal_parameters')
    : false;
};

const isImport = (node: SyntaxNode): boolean =>
  node.type === 'import_statement';

const isPropertyName = (node: SyntaxNode): boolean => {
  const parent = node.parent;
  return Boolean(
    parent &&
      (hasField(parent, 'property', node) ||
        hasField(parent, 'key', node) ||
        parent.type === 'property_identifier'),
  );
};

const isRuntime = (item: DeclarationOrderItem | undefined): boolean =>
  item?.kind === 'const-function' || item?.kind === 'function';

const isType = (item: DeclarationOrderItem | undefined): boolean =>
  item?.kind === 'interface' || item?.kind === 'type';

const isTypePosition = (node: SyntaxNode): boolean =>
  ancestors(node).some((ancestor) =>
    [
      'type_annotation',
      'type_arguments',
      'type_parameters',
      'type_alias_declaration',
      'interface_declaration',
      'predefined_type',
    ].includes(ancestor.type),
  );

const nameFor = (
  node: SyntaxNode,
  kind: DeclarationKind,
): string | undefined => {
  const declaration = declarationNodeFor(node);
  if (kind === 'const-function') {
    const declarator = declaration.namedChildren.find(
      (child) => child.type === 'variable_declarator',
    );
    return childForField(declarator ?? declaration, 'name')?.text;
  }
  return childForField(declaration, 'name')?.text;
};

const rangeFor = (
  items: readonly DeclarationOrderItem[],
): { readonly end: number; readonly start: number } => ({
  end: Math.max(...items.map((item) => item.end)),
  start: Math.min(...items.map((item) => item.start)),
});

const reorderedText = (
  source: string,
  group: DeclarationOrderGroup,
): string => {
  const items = new Map(group.items.map((item) => [item.name, item]));
  return group.desiredOrder
    .map((name) => {
      const item = items.get(name);
      return source.slice(item?.start ?? 0, item?.end ?? 0).trim();
    })
    .join('\n\n');
};

const replaceRange = (
  source: string,
  start: number,
  end: number,
  replacement: string,
): string => `${source.slice(0, start)}${replacement}${source.slice(end)}`;

const runtimeSpan = (
  declarations: readonly (DeclarationNode | undefined)[],
  start: number,
): { readonly entries: DeclarationNode[]; readonly nextIndex: number } => {
  let nextIndex = start;
  while (
    nextIndex < declarations.length &&
    isRuntime(declarations[nextIndex]?.item)
  ) {
    nextIndex += 1;
  }
  return {
    entries: declarations
      .slice(start, nextIndex)
      .filter((entry): entry is DeclarationNode => entry !== undefined),
    nextIndex,
  };
};

const sameOrder = (
  currentOrder: readonly string[],
  desiredOrder: readonly string[],
): boolean => currentOrder.every((name, index) => name === desiredOrder[index]);

const applyRuntimeGroups = (
  source: string,
  groups: readonly DeclarationOrderGroup[],
): string => {
  let next = source;
  for (const group of [...groups].sort(
    (left, right) => rangeFor(right.items).start - rangeFor(left.items).start,
  )) {
    if (sameOrder(group.currentOrder, group.desiredOrder)) {
      continue;
    }
    const range = rangeFor(group.items);
    next = replaceRange(
      next,
      range.start,
      range.end,
      reorderedText(next, group),
    );
  }
  return next;
};

const groupPacket = (
  filePath: string,
  sourceFingerprint: string,
  groups: readonly DeclarationOrderGroup[],
): ActionPacket | undefined => {
  const failedGroups = groups.filter(
    (group) =>
      group.needsPlacement ||
      !sameOrder(group.currentOrder, group.desiredOrder),
  );
  if (failedGroups.length === 0) {
    return undefined;
  }
  return createActionPacket({
    forbiddenActions: [
      'Do not change a declaration body, signature, comments, imports, or exports.',
      'Do not move a declaration across a reported barrier or blocked group.',
      'Do not add, remove, rename, or merge declarations.',
    ],
    intentId: `declaration-order-${sourceFingerprint.slice(0, 12)}`,
    knownUserQuestions: [],
    nextPhase: 'candidate',
    packetId: `declaration-order-${sourceFingerprint.slice(0, 12)}`,
    requiredActionGroups: failedGroups.map((group) => ({
      allowedPaths: [filePath],
      id: group.id,
      requiredAssertionIds: [`declaration-order:${group.id}`],
      title: `${group.needsPlacement ? 'Move and reorder' : 'Reorder'} ${group.kind} declarations as ${group.desiredOrder.join(', ')}.`,
    })),
    state: 'candidate_requested',
  });
};

const toCharacterIndex = (source: string, byteIndex: number): number => {
  let characterIndex = 0;
  let bytes = 0;
  while (characterIndex < source.length && bytes < byteIndex) {
    const codePoint = source.codePointAt(characterIndex);
    if (codePoint === undefined) {
      break;
    }
    bytes += new TextEncoder().encode(String.fromCodePoint(codePoint)).length;
    characterIndex += codePoint > 0xffff ? 2 : 1;
  }
  return characterIndex;
};

const typeFor = (node: SyntaxNode): DeclarationKind | undefined => {
  const declaration = declarationNodeFor(node);
  if (declaration.type === 'interface_declaration') {
    return 'interface';
  }
  if (declaration.type === 'type_alias_declaration') {
    return 'type';
  }
  if (declaration.type === 'function_declaration') {
    return 'function';
  }
  if (declaration.type !== 'lexical_declaration') {
    return undefined;
  }
  const declarator = declaration.namedChildren.find(
    (child) => child.type === 'variable_declarator',
  );
  if (
    declaration.text.trimStart().startsWith('const ') &&
    declarator &&
    declaration.namedChildren.length === 1 &&
    childForField(declarator, 'name')?.type === 'identifier'
  ) {
    const value = childForField(declarator, 'value');
    if (
      value?.type === 'arrow_function' ||
      value?.type === 'function_expression'
    ) {
      return 'const-function';
    }
  }
  return undefined;
};

const declarationsFor = (
  statements: readonly SourceStatement[],
): readonly (DeclarationNode | undefined)[] =>
  statements.map(({ end, node, start }, statementIndex) => {
    const kind = typeFor(node);
    if (!kind) {
      return undefined;
    }
    const name = nameFor(node, kind);
    return {
      item: { end, kind, name: name as string, start },
      node,
      start,
      statementIndex,
    };
  });

const typeGroupsFor = (
  declarations: readonly (DeclarationNode | undefined)[],
  firstNonImport: number,
): DeclarationOrderGroup[] => {
  const allTypes = declarations.filter((entry): entry is DeclarationNode =>
    isType(entry?.item),
  );
  if (allTypes.length === 0) {
    return [];
  }
  const expectedTypes = declarations.slice(
    firstNonImport,
    firstNonImport + allTypes.length,
  );
  const desiredItems = [...allTypes.map(({ item }) => item)].sort(
    (left, right) => alphabetically(left.name, right.name),
  );
  return [
    {
      currentOrder: allTypes.map(({ item }) => item.name),
      desiredOrder: desiredItems.map(({ name }) => name),
      id: 'types-after-imports',
      items: allTypes.map(({ item }) => item),
      kind: 'types',
      needsPlacement:
        expectedTypes.length !== allTypes.length ||
        !expectedTypes.every((entry) => isType(entry?.item)),
    },
  ];
};

const usesTsxGrammar = (filePath: string): boolean =>
  /\.(?:jsx|tsx)$/u.test(filePath);

const parserFor = (filePath: string): Parser => {
  const parser = new Parser();
  parser.setLanguage(
    usesTsxGrammar(filePath) ? TypeScript.tsx : TypeScript.typescript,
  );
  return parser;
};

const sourceStatements = (
  filePath: string,
  source: string,
): {
  readonly blockers: readonly string[];
  readonly statements: readonly SourceStatement[];
} => {
  const root = parserFor(filePath).parse(source).rootNode;
  if (root.hasError) {
    return {
      blockers: [
        'Source contains syntax errors; declaration order was not evaluated.',
      ],
      statements: [],
    };
  }
  const statements: SourceStatement[] = [];
  let leadingStart: number | undefined;
  for (const node of root.children) {
    if (node.type === 'comment') {
      leadingStart ??= toCharacterIndex(source, node.startIndex);
      continue;
    }
    statements.push({
      end: toCharacterIndex(source, node.endIndex),
      node,
      start: leadingStart ?? toCharacterIndex(source, node.startIndex),
    });
    leadingStart = undefined;
  }
  return { blockers: [], statements };
};

const importsEndFor = (filePath: string, source: string): number => {
  const parsed = sourceStatements(filePath, source);
  const firstNonImport = parsed.statements.findIndex(
    ({ node }) => !isImport(node),
  );
  return firstNonImport <= 0
    ? 0
    : (parsed.statements.at(firstNonImport - 1)?.end ?? source.length);
};

const applyTypeGroup = (
  filePath: string,
  source: string,
  group: DeclarationOrderGroup,
): string => {
  const typeText = reorderedText(source, group);
  if (!group.needsPlacement) {
    const range = rangeFor(group.items);
    return replaceRange(source, range.start, range.end, typeText);
  }
  const importsEnd = importsEndFor(filePath, source);
  let withoutTypes = source;
  for (const item of [...group.items].sort(
    (left, right) => right.start - left.start,
  )) {
    withoutTypes = replaceRange(withoutTypes, item.start, item.end, '');
  }
  const before = withoutTypes.slice(0, importsEnd).trimEnd();
  const after = withoutTypes.slice(importsEnd).trimStart();
  return [before, typeText, after].filter(Boolean).join('\n\n');
};

const topLevelStatementSet = (
  filePath: string,
  source: string,
): readonly string[] =>
  sourceStatements(filePath, source)
    .statements.map(({ end, start }) => source.slice(start, end).trim())
    .sort(alphabetically);

const preservesTopLevelStatements = (
  filePath: string,
  before: string,
  after: string,
): boolean =>
  JSON.stringify(topLevelStatementSet(filePath, before)) ===
  JSON.stringify(topLevelStatementSet(filePath, after));

const violationsFor = (groups: readonly DeclarationOrderGroup[]): string[] =>
  groups
    .filter(
      (group) =>
        group.needsPlacement ||
        !sameOrder(group.currentOrder, group.desiredOrder),
    )
    .map(
      (group) =>
        `${group.id} must ${group.needsPlacement ? 'be immediately after imports and ' : ''}be ${group.desiredOrder.join(', ')} (current: ${group.currentOrder.join(', ')}).`,
    );

const walk = (node: SyntaxNode, visit: (node: SyntaxNode) => void): void => {
  visit(node);
  for (const child of node.namedChildren) {
    walk(child, visit);
  }
};

const dependenciesFor = (
  declaration: DeclarationNode,
  candidateNames: ReadonlySet<string>,
): {
  readonly dependencies: readonly string[];
  readonly shadowed: readonly string[];
} => {
  const dependencies = new Set<string>();
  const shadowed = new Set<string>();
  walk(declaration.node, (node) => {
    if (node.type !== 'identifier' || !candidateNames.has(node.text)) {
      return;
    }
    if (node.text === declaration.item.name || isTypePosition(node)) {
      return;
    }
    if (isBinding(node, declarationNodeFor(declaration.node))) {
      shadowed.add(node.text);
      return;
    }
    if (!isPropertyName(node)) {
      dependencies.add(node.text);
    }
  });
  return {
    dependencies: [...dependencies].sort(alphabetically),
    shadowed: [...shadowed].sort(alphabetically),
  };
};

const dependencyOrder = (
  declarations: readonly DeclarationNode[],
):
  | { readonly blockers: readonly string[] }
  | { readonly items: readonly DeclarationOrderItem[] } => {
  const names = new Set(declarations.map(({ item }) => item.name));
  if (names.size !== declarations.length) {
    return { blockers: ['Runtime declarations have duplicate names.'] };
  }
  const dependencies = new Map<string, readonly string[]>();
  for (const declaration of declarations) {
    const result = dependenciesFor(declaration, names);
    if (result.shadowed.length > 0) {
      return {
        blockers: [
          `Runtime declaration ${declaration.item.name} shadows sortable names: ${result.shadowed.join(', ')}.`,
        ],
      };
    }
    dependencies.set(
      declaration.item.name,
      result.dependencies.filter((name) => name !== declaration.item.name),
    );
  }
  const pending = new Set(names);
  const orderedNames: string[] = [];
  while (pending.size > 0) {
    const next = [...pending]
      .filter((name) =>
        (dependencies.get(name) ?? []).every(
          (dependency) => !pending.has(dependency),
        ),
      )
      .sort(alphabetically)[0];
    if (!next) {
      return {
        blockers: ['Runtime declaration dependencies contain a cycle.'],
      };
    }
    pending.delete(next);
    orderedNames.push(next);
  }
  return {
    items: orderedNames
      .map(
        (name) =>
          declarations.find((declaration) => declaration.item.name === name)
            ?.item,
      )
      .filter((item): item is DeclarationOrderItem => item !== undefined),
  };
};

const runtimeGroupsFor = (
  declarations: readonly (DeclarationNode | undefined)[],
  firstNonImport: number,
): {
  readonly blockers: string[];
  readonly groups: DeclarationOrderGroup[];
} => {
  const blockers: string[] = [];
  const groups: DeclarationOrderGroup[] = [];
  let group = 0;
  for (let index = firstNonImport; index < declarations.length; ) {
    if (!isRuntime(declarations[index]?.item)) {
      index += 1;
      continue;
    }
    const span = runtimeSpan(declarations, index);
    index = span.nextIndex;
    const entries = span.entries;
    const ordered = entries.length < 2 ? undefined : dependencyOrder(entries);
    if (!ordered) {
      continue;
    }
    if ('blockers' in ordered) {
      blockers.push(...ordered.blockers);
      continue;
    }
    group += 1;
    groups.push({
      currentOrder: entries.map(({ item }) => item.name),
      desiredOrder: ordered.items.map(({ name }) => name),
      id: `runtime-${group}`,
      items: entries.map(({ item }) => item),
      kind: 'runtime',
      needsPlacement: false,
    });
  }
  return { blockers, groups };
};

export const inspectDeclarationOrder = (
  filePath: string,
  source: string,
): DeclarationOrderReport => {
  const sourceFingerprint = createHash('sha256').update(source).digest('hex');
  const parsed = sourceStatements(filePath, source);
  const declarations = declarationsFor(parsed.statements);
  const blockers = [...parsed.blockers];
  const groups: DeclarationOrderGroup[] = [];
  const importEnd = parsed.statements.findIndex(({ node }) => !isImport(node));
  const firstNonImport =
    importEnd === -1 ? parsed.statements.length : importEnd;
  groups.push(...typeGroupsFor(declarations, firstNonImport));
  const runtime = runtimeGroupsFor(declarations, firstNonImport);
  groups.push(...runtime.groups);
  blockers.push(...runtime.blockers);
  const violations = violationsFor(groups);
  return {
    blockers,
    groups,
    packet: groupPacket(filePath, sourceFingerprint, groups),
    sourceFingerprint,
    violations,
  };
};

export const declarationOrderCheck = (
  filePath: string,
  source: string,
): DeclarationOrderCheckResult =>
  declarationOrderResult(inspectDeclarationOrder(filePath, source));

export const fixDeclarationOrder = (
  filePath: string,
  source: string,
  preserve?: (filePath: string, before: string, after: string) => boolean,
): DeclarationOrderFixResult => {
  const baseline = inspectDeclarationOrder(filePath, source);
  if (baseline.blockers.length > 0 || baseline.violations.length === 0) {
    return { changed: false, report: baseline, source };
  }
  const typeGroup = baseline.groups.find((group) => group.kind === 'types');
  const afterTypes =
    typeGroup &&
    (typeGroup.needsPlacement ||
      !sameOrder(typeGroup.currentOrder, typeGroup.desiredOrder))
      ? applyTypeGroup(filePath, source, typeGroup)
      : source;
  const afterTypeReport = inspectDeclarationOrder(filePath, afterTypes);
  const next = applyRuntimeGroups(
    afterTypes,
    afterTypeReport.groups.filter((group) => group.kind === 'runtime'),
  );
  const finalReport = inspectDeclarationOrder(filePath, next);
  const sourceGuard = preserve ?? preservesTopLevelStatements;
  if (!sourceGuard(filePath, source, next)) {
    return {
      changed: false,
      report: {
        ...finalReport,
        blockers: [
          ...finalReport.blockers,
          'Automatic reorder rejected because top-level source statements changed.',
        ],
        packet: undefined,
        violations: [],
      },
      source,
    };
  }
  return {
    changed: next !== source,
    report: finalReport,
    source: next,
  };
};
