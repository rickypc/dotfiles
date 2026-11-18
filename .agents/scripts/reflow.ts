#!/usr/bin/env bun
/**
 * reflow.ts - deterministic 100-column Markdown/MDX reflow transform CLI.
 * Default mode refills only blocks containing a line over the width limit and
 * only when every non-final refilled line lands in the 81-100 band; every
 * other block - including prose wrapped at 80 or below - stays byte-identical.
 * Band mode reflows every block with the greedy max-fill objective: each line
 * takes as many atoms as fit within 100 columns, and a short line appears only
 * where an unbreakable atom forces it; a line may run past 100 only to end at
 * an unbreakable token, which closes its own line.
 * Usage: bun <agents-root>/scripts/reflow.ts <file-or-dir>... [--band] [--write] [--report]
 * Dry run by default; `--write` applies refills; `--report` prints residuals.
 */

import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandDeclaration } from '../utils/cli/declaration.js';
import { CliError } from '../utils/cli/errors.js';
import { runMain } from '../utils/cli/index.js';
import {
  classifyFile,
  DEFAULT_OPTIONS,
  type ReflowResult,
  reflowText,
  residualOverLimitLines,
  verifyInvariants,
} from '../utils/reflow/file.js';
import { cpLen } from '../utils/reflow/index.js';

export interface CliArgs {
  band: boolean;
  paths: string[];
  report: boolean;
  write: boolean;
}

export interface ReflowDeps {
  log: (message: string) => void;
  read: (path: string) => Promise<string>;
  transform: (text: string) => ReflowResult;
  write: (path: string, text: string) => Promise<unknown>;
}

export interface ReflowOutput {
  readonly aborted: number;
  readonly changed: readonly string[];
  readonly files: number;
  readonly lines: readonly string[];
}

// Deterministic directory walk: sorted entries, .md/.mdx files only, junk
// directories skipped. A path that cannot be stat-ed falls through so
// processFile reports it as unreadable. Inside a git work tree the file list
// comes from git itself - tracked plus new untracked files - so ignored
// paths (backups, scratch trees, caches) are never touched.
const SKIP_DIRS: ReadonlySet<string> = new Set([
  '.docusaurus',
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright',
]);

export const defaultReflowDeps = (band?: boolean): ReflowDeps => ({
  log: (message: string) => console.log(message),
  read: (path: string) => readFile(path, 'utf8'),
  transform: (text: string) => reflowText(text, band === true ? { band: true } : {}),
  write: (path: string, text: string) => writeFile(path, text, 'utf8'),
});

const gitMarkdownFiles = (dir: string): string[] | null => {
  const probe = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
  });
  if (probe.status !== 0) {
    return null;
  }
  const list = spawnSync(
    'git',
    [
      '-C',
      dir,
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      '*.md',
      '*.mdx',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (list.status !== 0) {
    return null;
  }
  return list.stdout
    .split('\0')
    .filter(Boolean)
    .map((rel) => join(dir, rel))
    .sort();
};

const isMarkdown = (name: string): boolean => name.endsWith('.md') || name.endsWith('.mdx');

const collectMarkdown = async (root: string, acc: string[]): Promise<void> => {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await collectMarkdown(join(root, entry.name), acc);
      }
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      acc.push(join(root, entry.name));
    }
  }
};

const expandPaths = async (paths: readonly string[]): Promise<string[]> => {
  const files: string[] = [];
  for (const path of paths) {
    try {
      const info = await stat(path);
      if (info.isDirectory()) {
        const fromGit = gitMarkdownFiles(path);
        if (fromGit !== null) {
          files.push(...fromGit);
        } else {
          await collectMarkdown(path, files);
        }
      } else {
        files.push(path);
      }
    } catch {
      files.push(path);
    }
  }
  return files;
};

const reportOverLimit = (file: string, output: string, deps: ReflowDeps): void => {
  for (const r of classifyFile(output)) {
    if (r && cpLen(r.raw) > DEFAULT_OPTIONS.width) {
      deps.log(`[reflow] over100 ${file}:${r.n} class=${r.kind ?? 'unknown'}`);
    }
  }
};

const processFile = async (
  file: string,
  parsed: CliArgs,
  deps: ReflowDeps,
): Promise<{ changed: boolean; ok: boolean }> => {
  const text = await deps.read(file).catch(() => null);
  if (text === null) {
    deps.log(`[reflow] unreadable: ${file}`);
    return { changed: false, ok: false };
  }
  const result = deps.transform(text);
  const failures = verifyInvariants(text, result.output);
  const overLimit = residualOverLimitLines(result.output, DEFAULT_OPTIONS);
  const reasons = [...failures, ...overLimit.map((l) => `non-exempt over-limit line ${l}`)];
  if (reasons.length > 0) {
    deps.log(`[reflow] abort ${file}: ${reasons.join('; ')}`);
    return { changed: false, ok: false };
  }
  if (parsed.report) {
    for (const r of result.residuals) {
      deps.log(`[reflow] residual ${file}:${r.line} len=${r.len} class=${r.blockKind} ${r.reason}`);
    }
    reportOverLimit(file, result.output, deps);
  }
  if (result.changed && parsed.write) {
    await deps.write(file, result.output);
  }
  return { changed: result.changed, ok: true };
};

export const reflowPaths = async (
  parsed: CliArgs,
  deps: ReflowDeps,
): Promise<Omit<ReflowOutput, 'lines'>> => {
  const files = await expandPaths(parsed.paths);
  let aborted = 0;
  const changed: string[] = [];
  for (const file of files) {
    const outcome = await processFile(file, parsed, deps);
    if (outcome.changed) {
      changed.push(file);
    }
    if (!outcome.ok) {
      aborted++;
    }
  }
  deps.log(`[reflow] files=${files.length} changed=${changed.length} aborted=${aborted}`);
  for (const file of changed) {
    deps.log(`  ${file}`);
  }
  return { aborted, changed, files: files.length };
};

export const createCommand = (
  overrides: Partial<ReflowDeps> = {},
): CommandDeclaration<ReflowOutput> => ({
  arity: [1, Number.POSITIVE_INFINITY],
  options: {
    band: {
      description: 'Reflow every block to greedy max-fill; default is over-limit blocks only.',
      type: 'boolean',
    },
    report: {
      description: 'Print residual violations with class and reason.',
      type: 'boolean',
    },
    write: { description: 'Apply refills in place.', type: 'boolean' },
  },
  positionals: '<file-or-dir>...',
  renderText: (data) => data.lines.join('\n'),
  run: async (input) => {
    const parsed: CliArgs = {
      band: input.values.band === true,
      paths: [...input.positionals],
      report: input.values.report === true,
      write: input.values.write === true,
    };
    const lines: string[] = [];
    const deps: ReflowDeps = {
      ...defaultReflowDeps(parsed.band),
      ...overrides,
      log: (message) => {
        lines.push(message);
        overrides.log?.(message);
      },
    };
    const summary = await reflowPaths(parsed, deps);
    const output = { ...summary, lines };
    if (summary.aborted > 0) {
      throw new CliError(`Reflow aborted for ${summary.aborted} file(s).`, 1, output);
    }
    return output;
  },
  script: 'scripts/reflow.ts',
  summary: 'Deterministic 100-column Markdown/MDX reflow; a dry run unless --write is given.',
});

export const command = createCommand();

void runMain(command, import.meta.main);
