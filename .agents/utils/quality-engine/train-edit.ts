import matter from 'gray-matter';

export interface EditCaps {
  readonly maxBodyLines: number;
  readonly maxDescriptionPercent: number;
}

export interface EditSize {
  readonly bodyLines: number;
  readonly descriptionBaselineChars: number;
  readonly descriptionChars: number;
}

export const DEFAULT_EDIT_CAPS: EditCaps = { maxBodyLines: 40, maxDescriptionPercent: 25 };

const changedCharsOf = (before: string, after: string): number => {
  const shared = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shared && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < shared - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return Math.max(before.length, after.length) - prefix - suffix;
};

export const changeSummaryOf = (size: EditSize): string =>
  `description ${size.descriptionChars} of ${size.descriptionBaselineChars} characters, body ${size.bodyLines} lines`;

const descriptionOf = (parsed: matter.GrayMatterFile<string>): string => {
  const value = (parsed.data as Record<string, unknown>).description;
  return typeof value === 'string' ? value.trim() : '';
};

export const editCapViolation = (
  size: EditSize,
  caps: EditCaps = DEFAULT_EDIT_CAPS,
): string | undefined => {
  if (size.descriptionChars > 0 && size.bodyLines > 0) {
    return `An attempt makes one edit: change the description or the body, not both (${changeSummaryOf(size)}).`;
  }
  const allowedChars = Math.floor(
    (size.descriptionBaselineChars * caps.maxDescriptionPercent) / 100,
  );
  if (size.descriptionChars > allowedChars) {
    return `The description edit changes ${size.descriptionChars} characters; the cap is ${allowedChars} (${caps.maxDescriptionPercent} percent of ${size.descriptionBaselineChars}).`;
  }
  return size.bodyLines > caps.maxBodyLines
    ? `The body edit changes ${size.bodyLines} lines; the cap is ${caps.maxBodyLines}.`
    : undefined;
};

const lineCountsOf = (text: string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const line of text.split('\n')) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
};

const surplusLinesOf = (from: Map<string, number>, against: Map<string, number>): number =>
  [...from].reduce(
    (total, [line, count]) => total + Math.max(0, count - (against.get(line) ?? 0)),
    0,
  );

const changedLinesOf = (before: string, after: string): number => {
  const beforeCounts = lineCountsOf(before);
  const afterCounts = lineCountsOf(after);
  return Math.max(
    surplusLinesOf(beforeCounts, afterCounts),
    surplusLinesOf(afterCounts, beforeCounts),
  );
};

export const editSizeOf = (baselineText: string, candidateText: string): EditSize => {
  const before = matter(baselineText);
  const after = matter(candidateText);
  const baselineDescription = descriptionOf(before);
  return {
    bodyLines: changedLinesOf(before.content, after.content),
    descriptionBaselineChars: baselineDescription.length,
    descriptionChars: changedCharsOf(baselineDescription, descriptionOf(after)),
  };
};
