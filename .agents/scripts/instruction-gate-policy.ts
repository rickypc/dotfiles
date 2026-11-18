import path from 'node:path';

import { parseAtomMap } from '../utils/quality-engine/atoms.js';
import {
  lookStatus,
  looksPerEpochOf,
  parseHeldOutLines,
  renderHeldOutLine,
} from '../utils/quality-engine/heldout.js';
import type { Baseline, Measurement } from './instruction-gate.js';

export const HELD_OUT_LOOKS_FILE = 'held-out-looks.jsonl';

export interface PolicyContext {
  readonly blocked: string | undefined;
  readonly commit: () => Promise<void>;
  readonly core: readonly string[] | undefined;
}

export interface PolicyDeps {
  readonly agentsRoot: string;
  readonly now: () => Date;
  readonly readText: (file: string) => Promise<string | undefined>;
  readonly sha256: (text: string) => string;
  readonly writeText: (file: string, content: string) => Promise<void>;
}

export interface PolicyOptions {
  readonly rotatePoolPath?: string;
}

export interface PolicyTarget {
  readonly document: string;
  readonly receiptPath: string;
  readonly setPath: string;
}

export interface PolicyVerdict {
  readonly problems: readonly string[];
  readonly swapped: boolean;
}

export const atomMapPathOf = (setPath: string): string =>
  setPath.replace('/comprehension/', '/atoms/').replace(/\.json$/u, '.md');

// Core probes are the ones the calibration run saw flip. A document with no readable atom map has
// no core, so the plain per-probe rule applies to it.
export const coreOf = async (
  deps: Pick<PolicyDeps, 'agentsRoot' | 'readText'>,
  setPath: string,
): Promise<readonly string[] | undefined> => {
  const text = await deps.readText(path.join(deps.agentsRoot, atomMapPathOf(setPath)));
  if (text === undefined) {
    return undefined;
  }
  try {
    return parseAtomMap(text)
      .sensitivity.filter((entry) => entry.mutantsFlipped > 0)
      .map((entry) => entry.probeId);
  } catch {
    return undefined;
  }
};

const looksPathOf = (receiptPath: string): string =>
  path.join(path.dirname(path.dirname(receiptPath)), HELD_OUT_LOOKS_FILE);

// The never-worse rule with a protected core. A core probe is one a rule change can flip, so losing
// it is a real regression. Losing any other train probe is a swap: allowed only with a written
// reason and only when the edit gains at least as many probes as it loses. Held-out validation may
// still never lose a pass, because per-probe validation ids stay hidden from the editor.
export const policyProblems = (
  candidate: Measurement,
  baseline: Baseline,
  core: readonly string[],
  swapReason: string | undefined,
): PolicyVerdict => {
  const lost = baseline.trainPassed.filter((id) => candidate.trainFailed.includes(id));
  const problems = lost
    .filter((id) => core.includes(id))
    .map((id) => `Core train probe ${id} passed at baseline and now fails.`);
  const swapped = lost.filter((id) => !core.includes(id));
  const gained =
    candidate.trainPassed.filter((id) => !baseline.trainPassed.includes(id)).length
    + Math.max(0, candidate.validationPassed - baseline.validationPassed);
  if (swapped.length > 0 && !swapReason) {
    problems.push(
      `Non-core train probe ${swapped.join(', ')} passed at baseline and now fails; a swap needs --allow-swap <reason>.`,
    );
  } else if (swapped.length > gained) {
    problems.push(
      `A swap must not lose more than it gains: ${swapped.length} lost against ${gained} gained.`,
    );
  }
  if (candidate.validationPassed < baseline.validationPassed) {
    problems.push(
      `Held-out validation fell from ${baseline.validationPassed} to ${candidate.validationPassed} passing probes.`,
    );
  }
  return { problems, swapped: swapped.length > 0 };
};

const rotate = async (
  deps: PolicyDeps,
  looksPath: string,
  existing: string,
  target: PolicyTarget,
  poolPath: string,
): Promise<string> => {
  const pool = await deps.readText(path.resolve(deps.agentsRoot, poolPath));
  if (pool === undefined || pool.trim() === '') {
    throw new Error(`The sealed held-out pool is missing or blank: ${poolPath}.`);
  }
  const line = renderHeldOutLine({
    at: deps.now().toISOString(),
    document: target.document,
    kind: 'rotation',
    poolSha256: deps.sha256(pool),
  });
  await deps.writeText(path.join(deps.agentsRoot, looksPath), `${existing}${line}`);
  return `${existing}${line}`;
};

// Every distinct text of a document scored against its held-out probes is a look. A third look in
// one epoch is blocked until the pool is rotated with `--rotate-pool <sealed-pool-file>`.
export const policyContext = async (
  deps: PolicyDeps,
  target: PolicyTarget,
  documentText: string,
  options: PolicyOptions,
  central: boolean,
): Promise<PolicyContext> => {
  if (!central) {
    return { blocked: undefined, commit: async () => undefined, core: undefined };
  }
  const looksPath = looksPathOf(target.receiptPath);
  let existing = (await deps.readText(path.join(deps.agentsRoot, looksPath))) ?? '';
  if (options.rotatePoolPath !== undefined) {
    existing = await rotate(deps, looksPath, existing, target, options.rotatePoolPath);
  }
  const sha = deps.sha256(documentText);
  const status = lookStatus(parseHeldOutLines(existing, looksPath), target.document, sha);
  const cap = looksPerEpochOf(
    await deps.readText(path.join(deps.agentsRoot, 'evals', 'manifest.json')),
  );
  const core = await coreOf(deps, target.setPath);
  if (core === undefined) {
    return {
      blocked: `BLOCKED ${target.document}: no readable atom map at ${atomMapPathOf(target.setPath)}. Every instruction document needs one; run skill-manager atoms --write first.`,
      commit: async () => undefined,
      core,
    };
  }
  if (!status.seen && status.looks >= cap) {
    return {
      blocked: `BLOCKED ${target.document}: ${status.looks} held-out looks used in epoch ${status.epoch} (limit ${cap}). Author a new held-out pool with a fresh session that sees the atoms but no candidate diff, then rerun with --rotate-pool <pool-file>.`,
      commit: async () => undefined,
      core,
    };
  }
  const commit = async (): Promise<void> => {
    if (status.seen) {
      return;
    }
    const line = renderHeldOutLine({
      at: deps.now().toISOString(),
      document: target.document,
      documentSha256: sha,
      kind: 'look',
    });
    await deps.writeText(path.join(deps.agentsRoot, looksPath), `${existing}${line}`);
  };
  return { blocked: undefined, commit, core };
};
