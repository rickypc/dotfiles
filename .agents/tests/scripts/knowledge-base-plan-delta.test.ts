import { expect, mock, test } from 'bun:test';
import * as realOs from 'node:os';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';
import type { FileSystem } from '../../utils/filesystem.js';

// Plan-import delta coverage in its own file so the shared knowledge-base suite stays under the
// file-size limit. The SUT and its local helpers are real (shared-suite integration); the external
// package and node boundaries are registered below, the filesystem is an in-memory fake, and the
// SUT globals (Bun.argv, console) are never reached because importPlan is called directly with
// that fake, and the CLI path resolves its plan through process.cwd with a mock() writer.
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('node:os', () => realOs);
mock.module('node:path', () => realPath);

const { importPlan, run } = await import('../../scripts/knowledge-base.js');

const deltaPlanPath = '/kb/.agents/plans/delta-plan.md';
const deltaPlan = [
  '---',
  'title: "Delta Plan"',
  'repo_search_index: "shared"',
  'status: "completed"',
  '---',
  '',
  '## 1. TARGET DIRECTIVES',
  'Objective',
  '',
  '## 2. VARIABLE DEFINITION MATRIX',
  'Matrix',
  '',
  '## 3. CHRONOLOGICAL WORKFLOW',
  'Workflow',
  '',
  '## 4. TOOL STRATEGY & FALLBACKS',
  'Strategy',
  '',
  '## 5. SYSTEMATIC VERIFICATION CHECKLIST',
  'Checklist',
  '',
  '## 6. RIGID OUTPUT SCHEMA',
  'Schema',
].join('\n');

const deltaJson = JSON.stringify({
  caps: [{ id: 'gemma', planned: 6, used: 4 }],
  deviations: [
    { class: 'noise-retry', note: 'flip', registerId: 'PD-1' },
    { class: 'contradiction', note: 'label words' },
  ],
  plan: 'delta-plan.md',
  schemaVersion: 1,
  score: 0.25,
  steps: { completed: 3, planned: 4, skipped: 1 },
  unforeseen: 1,
});

const importWith = async (delta: string | undefined) => {
  const written = new Map<string, string>();
  const fileSystem: FileSystem = {
    exists: async (path) => path.endsWith('.delta.json') && delta !== undefined,
    mkdir: async () => undefined,
    readdir: async () => [],
    readFile: async (path) => (path.endsWith('.delta.json') ? (delta ?? '') : deltaPlan),
    rm: async () => undefined,
    writeFile: async (path, content) => {
      written.set(path, content);
    },
  };
  await importPlan(fileSystem, '/kb', deltaPlanPath);
  return written.get('/kb/shared/plans/delta-plan.md') ?? '';
};

test('importPlan appends a Plan delta section when the sibling record exists', async () => {
  const withDelta = await importWith(deltaJson);
  expect(withDelta).toContain('## Plan delta');
  expect(withDelta).toContain('- Steps: 4 planned, 3 completed, 1 skipped');
  expect(withDelta).toContain('- Unforeseen deviations: 1 (score 0.25)');
  expect(withDelta).toContain('- Cap gemma: 4 used of 6');
  expect(withDelta).toContain('- Deviations contradiction: 1');
  expect(withDelta).toContain('- Deviations noise-retry: 1');
  expect(withDelta).not.toContain('- Deviations env-fact');
});

test('importPlan without a delta record keeps the concept free of a delta section', async () => {
  const without = await importWith(undefined);
  expect(without).not.toContain('Plan delta');
  expect(without).toContain('## RIGID OUTPUT SCHEMA\n\nSchema');
});

test('importPlan rejects a malformed delta record before writing the concept', async () => {
  await expect(importWith('{oops')).rejects.toThrow(/Delta record must be valid JSON/u);
});

test('the import-plan command carries the delta concept through the CLI receipt', async () => {
  const write = mock();
  const stub = async () => ({ ok: true });
  await run(
    ['import-plan', deltaPlanPath],
    write,
    stub as never,
    stub as never,
    stub as never,
    stub as never,
    stub as never,
    async (_fs: FileSystem, _root: string, planPath: string) => {
      const concept = await importWith(deltaJson);
      return {
        concept: { conceptPath: concept } as never,
        conceptPath: 'c',
        planPath,
        repoSearchIndex: 'shared',
        sections: [],
      };
    },
  );
  expect(JSON.parse(write.mock.calls[0]?.[0] as string).planPath).toBe(deltaPlanPath);
});
