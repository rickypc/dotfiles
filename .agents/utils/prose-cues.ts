interface Marker {
  readonly id: string;
  readonly pattern: RegExp;
}

export interface ProseCueMatch {
  readonly line: number;
  readonly lineId: string | null;
  readonly markers: readonly string[];
  readonly quotedContext: boolean;
  readonly text: string;
}

export interface ProseCueReport {
  readonly flaggedLineCount: number;
  readonly lineCount: number;
  readonly matches: readonly ProseCueMatch[];
  readonly schemaVersion: 1;
}

export const PROSE_CUE_SET_VERSION = 2;

// This fixed list was distilled from the locally reviewed source snapshots; it never fetches data.
const MARKERS: readonly Marker[] = [
  { id: 'fast-paced-ever-evolving', pattern: /\bfast-paced, ever-evolving\b/i },
  { id: 'intricate-tapestry', pattern: /\bintricate tapestry\b/i },
  { id: 'exciting-new-chapter', pattern: /\bexciting new chapter\b/i },
  { id: 'precipice', pattern: /\bprecipice\b/i },
  { id: 'more-than-ever', pattern: /\bmore than ever\b/i },
  { id: 'delve-into', pattern: /\bdelve into\b/i },
  { id: 'transformative-journey', pattern: /\btransformative journey\b/i },
  { id: 'abundantly-clear', pattern: /\babundantly clear\b/i },
  { id: 'dynamic-landscape', pattern: /\bdynamic .* landscape\b/i },
  { id: 'unlock-full-potential', pattern: /\bunlock the full potential\b/i },
  { id: 'brighter-than-ever', pattern: /\bbrighter than ever\b/i },
  { id: 'ever-evolving-landscape', pattern: /\bever-evolving .* landscape\b/i },
  { id: 'cutting-edge', pattern: /\bcutting-edge\b/i },
  { id: 'not-just-about', pattern: /\bnot just about\b/i },
  { id: 'at-the-end-of-the-day', pattern: /\bat the end of the day\b/i },
  { id: 'modern-landscape', pattern: /\bmodern .* landscape\b/i },
  { id: 'fundamentally-transforming', pattern: /\bfundamentally transforming\b/i },
  { id: 'pivotal-cornerstone', pattern: /\bpivotal cornerstone\b/i },
  { id: 'transformative-power', pattern: /\btransformative power\b/i },
  { id: 'crowded-marketplace', pattern: /\bcrowded marketplace\b/i },
  { id: 'technological-revolution', pattern: /\btechnological revolution\b/i },
  { id: 'unparalleled-possibilities', pattern: /\bunparalleled possibilities\b/i },
  { id: 'brighter-future', pattern: /\bbrighter future\b/i },
  { id: 'unlock-true-potential', pattern: /\bunlocking your true potential\b/i },
  { id: 'uniquely-positioned', pattern: /\buniquely positioned\b/i },
  { id: 'game-changing', pattern: /\bgame-changing\b/i },
  { id: 'unparalleled-growth', pattern: /\bunparalleled growth\b/i },
  { id: 'streamlined-tomorrow', pattern: /\bbrighter, more streamlined tomorrow\b/i },
  { id: 'delicate-balance', pattern: /\bdelicate balance\b/i },
  { id: 'fundamentally-reimagines', pattern: /\bfundamentally reimagines\b/i },
  { id: 'nothing-short-revolutionary', pattern: /\bnothing short of revolutionary\b/i },
  { id: 'unprecedented-heights', pattern: /\bunprecedented heights\b/i },
  { id: 'holistic-synergy', pattern: /\bholistic synergy\b/i },
  { id: 'spearhead-new-era', pattern: /\bspearhead a new era\b/i },
  { id: 'absolute-necessity', pattern: /\babsolute necessity\b/i },
  { id: 'stand-out-crowded-marketplace', pattern: /\bstand out in a crowded marketplace\b/i },
  { id: 'meaningful-progress', pattern: /\bmeaningful progress\b/i },
  { id: 'testament-to-power', pattern: /\btestament to the power\b/i },
  { id: 'catalyst-lasting-change', pattern: /\bcatalyst for lasting change\b/i },
  { id: 'transformative-impact', pattern: /\btransformative impact\b/i },
  { id: 'robust-outcomes', pattern: /\brobust outcomes\b/i },
  { id: 'cannot-be-overstated', pattern: /\bcannot be overstated\b/i },
  { id: 'seamless-synergy', pattern: /\bseamless synergy\b/i },
  { id: 'pivotal-step', pattern: /\bpivotal step\b/i },
  { id: 'never-before-imagined', pattern: /\bnever before imagined\b/i },
  { id: 'paradigm-shift', pattern: /\bparadigm shift\b/i },
  { id: 'cornerstone-excellence', pattern: /\bcornerstone of excellence\b/i },
  { id: 'game-changing-insights', pattern: /\bgame-changing insights\b/i },
  { id: 'new-standard-excellence', pattern: /\bnew standard for excellence\b/i },
  { id: 'recent-study-found', pattern: /\brecent study found\b/i },
  { id: 'researchers-report', pattern: /\bresearchers report\b/i },
  { id: 'industry-data-shows', pattern: /\bindustry data shows\b/i },
  { id: 'experts-agree', pattern: /\bexperts agree\b/i },
  { id: 'evidence-proves', pattern: /\bevidence proves\b/i },
  { id: 'analysts-predict', pattern: /\banalysts predict\b/i },
  { id: 'widely-known', pattern: /\bwidely known\b/i },
  { id: 'research-confirms', pattern: /\bresearch confirms\b/i },
  { id: 'survey-found', pattern: /\bsurvey found\b/i },
  { id: 'guarantees-return', pattern: /\bguarantees a return\b/i },
  { id: 'published-results', pattern: /\bpublished results\b/i },
  { id: 'proven-to-increase', pattern: /\bproven to increase\b/i },
  { id: 'benchmark-demonstrates', pattern: /\bbenchmark demonstrates\b/i },
  { id: 'reportedly-cuts', pattern: /\breportedly cuts\b/i },
  { id: 'third-party-analysis', pattern: /\bthird-party analysis\b/i },
  { id: 'according-to-experts', pattern: /\baccording to experts\b/i },
  { id: 'scientific-consensus', pattern: /\bscientific consensus\b/i },
  { id: 'proven-to-eliminate', pattern: /\bproven to eliminate\b/i },
  { id: 'global-study', pattern: /\bglobal study\b/i },
  { id: 'guarantees', pattern: /\bguarantees\b/i },
];

const FENCE_OPEN = /^\s{0,3}(\x60{3,}|~{3,})/u;
const INLINE_CODE = /(\x60+)(.*?)\1/gu;
const LINE_ID = /^\[(L\d{3})\]\s*(.*)$/u;
const QUOTED_SPAN = /"[^"]+"|“[^”]+”|‘[^’]+’|«[^»]+»/u;

const closeFence = (line: string, fence: string): boolean => {
  const trimmed = line.trim();
  const char = fence.startsWith('`') ? '\x60' : '~';
  const pattern = char === '\x60' ? /^\x60{3,}\s*$/u : /^~{3,}\s*$/u;
  const close = pattern.exec(trimmed)?.[0].trim();
  return close !== undefined && close.length >= fence.length;
};

const excerpt = (line: string): string => Array.from(line).slice(0, 240).join('');

const maskedCode = (text: string): string =>
  text.replace(INLINE_CODE, (match) => ' '.repeat(match.length));

const sourceLines = (text: string): string[] => {
  if (text === '') {
    return [];
  }
  const lines = text.split(/\r\n|\n|\r/u);
  if (/(?:\r\n|\n|\r)$/u.test(text)) {
    lines.pop();
  }
  return lines;
};

export const scanText = (text: string): ProseCueReport => {
  const lines = sourceLines(text);
  const matches: ProseCueMatch[] = [];
  let fence: string | undefined;

  const consumeFence = (rawLine: string): boolean => {
    const opening = FENCE_OPEN.exec(rawLine)?.[1];
    if (fence !== undefined) {
      if (opening !== undefined && closeFence(rawLine, fence)) {
        fence = undefined;
      }
      return true;
    }
    if (opening !== undefined) {
      fence = opening;
      return true;
    }
    return false;
  };

  const matchLine = (rawLine: string, index: number): ProseCueMatch | undefined => {
    const blockQuoted = rawLine.trimStart().startsWith('>');
    const contentLine = blockQuoted ? rawLine.trimStart().replace(/^(?:>\s*)+/u, '') : rawLine;
    const identity = LINE_ID.exec(contentLine);
    const lineId = identity?.[1] ?? null;
    const body = identity?.[2] ?? rawLine;
    const searchable = maskedCode(body);
    const markerIds = MARKERS.filter(({ pattern }) => pattern.test(searchable)).map(({ id }) => id);
    if (markerIds.length === 0) {
      return undefined;
    }
    return {
      line: index + 1,
      lineId,
      markers: markerIds,
      quotedContext: blockQuoted || QUOTED_SPAN.test(body),
      text: excerpt(rawLine),
    };
  };

  const scanLine = (rawLine: string, index: number): void => {
    if (consumeFence(rawLine)) {
      return;
    }
    const match = matchLine(rawLine, index);
    if (match !== undefined) {
      matches.push(match);
    }
  };

  for (const [index, rawLine] of lines.entries()) {
    scanLine(rawLine, index);
  }

  return {
    flaggedLineCount: matches.length,
    lineCount: lines.length,
    matches,
    schemaVersion: 1,
  };
};
