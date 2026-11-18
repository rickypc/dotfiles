import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { BehaviorRunAssertion } from '../utils/quality-engine/behavior-run.js';
import { parseCapture, renderSealLine, sealCase } from '../utils/quality-engine/behavior-seal.js';

export interface SealDeps {
  readonly appendText: (file: string, content: string) => Promise<void>;
  readonly readText: (file: string) => Promise<string | undefined>;
  readonly sha256: (text: string) => string;
}

export const defaultSealDeps = (): SealDeps => ({
  appendText: async (file, content) => {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, content, 'utf8');
  },
  readText: async (file) => {
    try {
      return await readFile(file, 'utf8');
    } catch {
      return undefined;
    }
  },
  sha256: (text) => createHash('sha256').update(text).digest('hex'),
});

const hardAssertionsOf = (cases: string, caseId: string): readonly BehaviorRunAssertion[] => {
  for (const line of cases.split('\n')) {
    const value: unknown = line.trim() === '' ? undefined : JSON.parse(line);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const item = value as Record<string, unknown>;
      if (item.kind === 'behavior' && item.id === caseId && Array.isArray(item.hardAssertions)) {
        return item.hardAssertions as BehaviorRunAssertion[];
      }
    }
  }
  throw new Error(`Owner has no behavior case with hard assertions: ${caseId}`);
};

const ownerDirectory = (ownerId: string): string => {
  if (ownerId === 'root') {
    return 'evals/';
  }
  const skill = /^skill:([\w-]+)$/u.exec(ownerId)?.[1];
  if (skill === undefined) {
    throw new Error(`Unknown owner id: ${ownerId}`);
  }
  return `evals/skills/${skill}/`;
};

export const sealUsage = (): string =>
  'Usage: bun <agents-root>/scripts/skill-manager.ts seal <absolute-agents-root> <owner-id> '
  + '<case-id> <absolute-capture-json> <document-sha256>';

// Seals one fresh target run: literal hard assertions over the captured output, trace, and diff,
// bound to the exact document text. The verdict line goes to the owner's behavior-seals.jsonl; the
// payload stays with the caller.
export const runSeal = async (
  args: readonly string[],
  write: (message: string) => void,
  deps: SealDeps,
): Promise<void> => {
  const [, root, ownerId, caseId, capturePath, documentSha256, ...extra] = args;
  if (
    !root?.startsWith('/')
    || !ownerId
    || !caseId
    || !capturePath?.startsWith('/')
    || !/^[a-f0-9]{64}$/u.test(documentSha256 ?? '')
    || extra.length > 0
  ) {
    throw new Error(sealUsage());
  }
  const directory = path.join(root, ownerDirectory(ownerId));
  const [cases, captureText] = await Promise.all([
    deps.readText(path.join(directory, 'cases.jsonl')),
    deps.readText(capturePath),
  ]);
  if (cases === undefined || captureText === undefined) {
    throw new Error('The owner cases file and the capture file must both exist.');
  }
  const line = sealCase({
    capture: parseCapture(JSON.parse(captureText)),
    caseId,
    documentSha256: documentSha256 as string,
    hardAssertions: hardAssertionsOf(cases, caseId),
    sha256: deps.sha256,
  });
  await deps.appendText(path.join(directory, 'behavior-seals.jsonl'), renderSealLine(line));
  write(JSON.stringify(line, null, 2));
};
