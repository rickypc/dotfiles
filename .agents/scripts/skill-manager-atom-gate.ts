import path from 'node:path';

import type { FileSystem } from '../utils/filesystem.js';
import { auditAtoms } from '../utils/quality-engine/atom-audit.js';
import {
  type InstructionPathDependencies,
  instructionDocuments,
  isGlobalAgentsRoot,
  setPathFor,
} from './instruction-gate-paths.js';
import { atomMapPathOf } from './instruction-gate-policy.js';

export type AtomGateDeps = Pick<InstructionPathDependencies, 'agentsRoot' | 'listDirectory'> & {
  readonly readText: (file: string) => Promise<string | undefined>;
};

export const atomGateDeps = (
  fileSystem: Pick<FileSystem, 'readFile' | 'readdir'>,
  agentsRoot: string,
): AtomGateDeps => ({
  agentsRoot,
  listDirectory: async (directory) =>
    ((await fileSystem.readdir?.(directory, { withFileTypes: true })) ?? []).map((entry) => ({
      isDirectory: entry.isDirectory(),
      name: entry.name,
    })),
  readText: async (file) => {
    try {
      return await fileSystem.readFile(file, 'utf8');
    } catch {
      return undefined;
    }
  },
});

// Every instruction document must have an atom map, and every map must audit without an error
// finding. There is no opt-out: a missing map is a failure, never a skip.
export const atomGateProblems = async (
  deps: AtomGateDeps,
  reader: Pick<FileSystem, 'readFile'>,
): Promise<readonly string[]> => {
  // Only the global runtime carries the central evaluation layout; a custom root has no atom lane.
  if (!isGlobalAgentsRoot(deps.agentsRoot)) {
    return [];
  }
  const missing: string[] = [];
  for (const document of await instructionDocuments(deps)) {
    const mapPath = atomMapPathOf(setPathFor(document, true));
    if ((await deps.readText(path.join(deps.agentsRoot, mapPath))) === undefined) {
      missing.push(`${document}: no atom map at ${mapPath}.`);
    }
  }
  try {
    const audits = await auditAtoms(reader, deps.agentsRoot);
    return [
      ...missing,
      ...audits.flatMap((audit) => [
        ...audit.errors.map((error) => `${audit.ownerId}: ${error}`),
        ...audit.findings
          .filter((finding) => finding.severity === 'error')
          .map(
            (finding) => `${audit.ownerId}: ${finding.source}: ${finding.kind} ${finding.detail}`,
          ),
      ]),
    ];
  } catch (error) {
    return [
      ...missing,
      `Atom audit failed: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
};
