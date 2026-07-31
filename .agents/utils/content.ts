export interface ClaimSource {
  readonly author: string;
  readonly date: string;
  readonly publisher: string;
  readonly sourceClass: SourceClass;
  readonly url: string;
}

export interface ContentBrief {
  readonly audience: string;
  readonly citationStyle: string;
  readonly constraints: string;
  readonly format: string;
  readonly objective: string;
  readonly scope: string;
  readonly tone: string;
  readonly webOptimization: boolean;
}

export interface ContentClaim {
  readonly quotation?: Quotation;
  readonly sourceUrl: string;
  readonly statement: string;
}

export interface ContentPackage {
  readonly brief: ContentBrief;
  readonly claims: readonly ContentClaim[];
  readonly draft: string;
  readonly refreshInventory?: RefreshInventory;
  readonly result: 'blocked' | 'needs-input' | 'ready';
  readonly sources: readonly ClaimSource[];
}

export interface Quotation {
  readonly original: string;
  readonly translation?: string;
  readonly transliteration?: string;
}

export interface RefreshInventory {
  readonly citations: boolean;
  readonly currentness: boolean;
  readonly purpose: boolean;
  readonly quotations: boolean;
  readonly structure: boolean;
}

export type SourceClass =
  | 'authoritative'
  | 'official'
  | 'primary'
  | 'peer-reviewed'
  | 'reputable-independent'
  | 'discovery';

const admissible = new Set<SourceClass>([
  'official',
  'authoritative',
  'primary',
  'peer-reviewed',
  'reputable-independent',
]);

const hasHttpsUrl = (url: string): boolean => /^https:\/\/.+/u.test(url);

export const canSupportClaim = (source: ClaimSource): boolean =>
  admissible.has(source.sourceClass) &&
  hasHttpsUrl(source.url) &&
  Boolean(source.author.trim()) &&
  Boolean(source.publisher.trim()) &&
  Boolean(source.date.trim());

export const renderQuotation = (quotation: Quotation): string => {
  if (!quotation.original) {
    throw new Error('A quotation must preserve the original text.');
  }
  const lines = [`> ${quotation.original}`];
  if (quotation.translation) {
    lines.push('', `Translation: ${quotation.translation}`);
  }
  if (quotation.transliteration) {
    lines.push('', `Transliteration: ${quotation.transliteration}`);
  }
  return lines.join('\n');
};

export const requiresQuotationClarification = (
  quotation: Quotation,
  audienceNeedsTransliteration: boolean | undefined,
): boolean =>
  Boolean(quotation.translation) && audienceNeedsTransliteration === undefined;

export const validateClaimSources = (sources: readonly ClaimSource[]): void => {
  if (
    sources.length === 0 ||
    sources.some((source) => !canSupportClaim(source))
  ) {
    throw new Error(
      'Every material claim needs an admissible, attributable source.',
    );
  }
};

export const validateContentBrief = (brief: ContentBrief): void => {
  for (const [name, value] of Object.entries(brief)) {
    if (typeof value === 'string' && !value.trim()) {
      throw new Error(`Content brief ${name} is required.`);
    }
  }
};

export const renderContentOutline = (brief: ContentBrief): string => {
  validateContentBrief(brief);
  return [
    `# ${brief.objective}`,
    '',
    '## Audience and scope',
    brief.audience,
    brief.scope,
    '',
    '## Evidence-backed draft',
    '',
    '## Sources and citations',
    '',
    `Web optimization: ${brief.webOptimization ? 'SEO and GEO' : 'none'}`,
  ].join('\n');
};

const validateContentClaim = (
  content: ContentPackage,
  sources: ReadonlyMap<string, ClaimSource>,
  claim: ContentClaim,
): void => {
  const source = sources.get(claim.sourceUrl);
  if (!claim.statement.trim() || !source || !canSupportClaim(source)) {
    throw new Error('Every material claim needs an admissible source.');
  }
  if (!content.draft.includes(claim.statement)) {
    throw new Error('Every material claim must appear in the draft.');
  }
  if (claim.quotation && !content.draft.includes(claim.quotation.original)) {
    throw new Error('Every quotation must be preserved in the draft.');
  }
};

export const validateRefreshInventory = (inventory: RefreshInventory): void => {
  if (Object.values(inventory).some((complete) => !complete)) {
    throw new Error('Refresh requires a complete content inventory.');
  }
};

export const validateContentPackage = (content: ContentPackage): void => {
  validateContentBrief(content.brief);
  if (!content.draft.trim() || content.claims.length === 0) {
    throw new Error('Content package needs a draft and material claims.');
  }
  const sources = new Map(
    content.sources.map((source) => [source.url, source]),
  );
  for (const claim of content.claims) {
    validateContentClaim(content, sources, claim);
  }
  if (content.refreshInventory)
    validateRefreshInventory(content.refreshInventory);
};
