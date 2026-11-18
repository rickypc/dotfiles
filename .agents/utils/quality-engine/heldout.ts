export const DEFAULT_LOOKS_PER_EPOCH = 2;

export type HeldOutLine = LookLine | RotationLine;

export interface LookLine {
  readonly at: string;
  readonly document: string;
  readonly documentSha256: string;
  readonly kind: 'look';
}

export interface LookStatus {
  readonly epoch: number;
  readonly looks: number;
  readonly seen: boolean;
}

export interface RotationLine {
  readonly at: string;
  readonly document: string;
  readonly kind: 'rotation';
  readonly poolSha256: string;
}

const sha256Pattern = /^[0-9a-f]{64}$/u;

const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isSha = (value: unknown): value is string =>
  typeof value === 'string' && sha256Pattern.test(value);

const isLine = (value: unknown): value is HeldOutLine => {
  const line = value as Record<string, unknown> | null;
  if (
    typeof line !== 'object'
    || line === null
    || !isNonBlank(line.at)
    || !isNonBlank(line.document)
  ) {
    return false;
  }
  return line.kind === 'look'
    ? isSha(line.documentSha256) && Object.keys(line).length === 4
    : line.kind === 'rotation' && isSha(line.poolSha256) && Object.keys(line).length === 4;
};

export const looksPerEpochOf = (manifestText: string | undefined): number => {
  try {
    const policy = (
      JSON.parse(manifestText ?? '{}') as { policy?: { heldOutLooksPerEpoch?: unknown } }
    ).policy;
    const value = policy?.heldOutLooksPerEpoch;
    return Number.isSafeInteger(value) && (value as number) >= 1
      ? (value as number)
      : DEFAULT_LOOKS_PER_EPOCH;
  } catch {
    return DEFAULT_LOOKS_PER_EPOCH;
  }
};

// A look is one distinct text of the document scored against its held-out probes. Looking again at
// a text already seen reveals nothing new, so it is not counted. A rotation starts a new epoch.
export const lookStatus = (
  lines: readonly HeldOutLine[],
  document: string,
  documentSha256: string,
): LookStatus => {
  const mine = lines.filter((line) => line.document === document);
  const lastRotation = mine.map((line) => line.kind).lastIndexOf('rotation');
  const epoch = mine.filter((line) => line.kind === 'rotation').length;
  const seenTexts = new Set(
    mine
      .slice(lastRotation + 1)
      .flatMap((line) => (line.kind === 'look' ? [line.documentSha256] : [])),
  );
  return { epoch, looks: seenTexts.size, seen: seenTexts.has(documentSha256) };
};

// The held-out ledger is append-only JSON lines, one event per line.
export const parseHeldOutLines = (text: string, sourcePath: string): readonly HeldOutLine[] =>
  text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error(`${sourcePath} line ${index + 1} is not valid JSON.`);
      }
      if (!isLine(parsed)) {
        throw new Error(`${sourcePath} line ${index + 1} is not a held-out look or rotation.`);
      }
      return parsed;
    });

export const renderHeldOutLine = (line: HeldOutLine): string => `${JSON.stringify(line)}\n`;
