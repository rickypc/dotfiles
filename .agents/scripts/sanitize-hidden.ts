#!/usr/bin/env tsx
/**
 * sanitize-hidden.ts — Recursively strip hidden/zero-width characters and
 * normalize weird dashes across all text files in a directory.
 *
 * Usage:
 *   tsx sanitize-hidden.ts [directory] [--dry-run] [--concurrency=16]
 *   bun  sanitize-hidden.ts [directory] [--dry-run] [--concurrency=16]
 *
 * Defaults: directory = pwd; concurrency = 16; writes in place.
 *
 * Hidden characters from the grep command — replaced with empty string:
 *   U+200B  ZERO WIDTH SPACE
 *   U+200C  ZERO WIDTH NON-JOINER
 *   U+2060  WORD JOINER
 *   U+FEFF  BOM / ZERO WIDTH NO-BREAK SPACE
 *   U+00AD  SOFT HYPHEN
 *   U+200D  ZERO WIDTH JOINER (bonus)
 *   control chars 0x01–0x08, 0x0B, 0x0C, 0x0E–0x1F, 0x7F
 *
 * Weird dashes — replaced with ASCII "-":
 *   U+2010  HYPHEN
 *   U+2011  NON-BREAKING HYPHEN
 *   U+2012  FIGURE DASH
 *   U+2013  EN DASH
 *   U+2014  EM DASH
 *   U+00D7  MULTIPLICATION SIGN (×) -> "x"
 *
 * Other:
 *   U+00A0  NON-BREAKING SPACE  -> " "
 *   U+2028  LINE SEPARATOR       -> "\n"
 *   U+2029  PARAGRAPH SEPARATOR  -> "\n"
 *
 * Skip rules (mirrors the find -prune list):
 *   .git, playwright, node_modules, build, coverage subtrees
 *   *.html files
 *   binary file extensions
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

const REPLACE_MAP = {
  '\u00A0': ' ',
  '\u00AD': '',
  '\u00D7': 'x', // MULTIPLICATION SIGN (×) -> "x"
  '\u200B': '',
  '\u200C': '',
  '\u200D': '',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2028': '\n',
  '\u2029': '\n',
  '\u2060': '',
  '\uFEFF': '',
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: Unicode escapes in regex are intentional for control character matching
const CONTROL_RE = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const BINARY_EXTS = new Set([
  '.avi',
  '.bmp',
  '.eot',
  '.gif',
  '.gz',
  '.ico',
  '.jpg',
  '.jpeg',
  '.mov',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.tar',
  '.tiff',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.zip',
]);

const MAX_FILE_BYTES = 16 * 1024 * 1024; // 16 MB

export function parseArgs(): {
  concurrency: number;
  dryRun: boolean;
  root: string;
} {
  const rest = argv.slice(2);
  let rootArg: string | undefined;
  let dryRun = false;
  let concurrency = 16;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a.startsWith('--concurrency=')) {
      concurrency = Math.max(1, parseInt(a.slice('--concurrency='.length), 10));
      continue;
    }
    if (a.startsWith('--')) {
      continue;
    }
    if (!rootArg) {
      rootArg = a;
    }
  }
  const root = rootArg ? resolve(rootArg) : resolve(cwd());
  return { concurrency, dryRun, root };
}

export function sanitizeText(input: string): string {
  let out = input;
  for (const [from, to] of Object.entries(REPLACE_MAP)) {
    out = out.split(from).join(to);
  }
  out = out.replace(CONTROL_RE, '');
  return out;
}

export async function sanitizeFile(
  file: string,
  dryRun: boolean,
): Promise<{ file: string; changed: boolean; bytes: number }> {
  const lower = file.toLowerCase();
  if (Array.from(BINARY_EXTS).some((ext) => lower.endsWith(ext))) {
    return { bytes: 0, changed: false, file };
  }
  if (lower.endsWith('.html')) {
    return { bytes: 0, changed: false, file };
  }
  try {
    const st = await stat(file);
    if (!st.isFile()) {
      return { bytes: 0, changed: false, file };
    }
    if (st.size > MAX_FILE_BYTES) {
      return { bytes: 0, changed: false, file };
    }
    const original = await readFile(file, 'utf8');
    const modified = sanitizeText(original);
    if (modified === original) {
      return { bytes: 0, changed: false, file };
    }
    if (!dryRun) {
      await writeFile(file, modified, 'utf8');
    }
    return { bytes: original.length - modified.length, changed: true, file };
  } catch {
    return { bytes: 0, changed: false, file };
  }
}

const RG_EXCLUDE_GLOBS = [
  '!.git',
  '!.hg',
  '!.svn',
  '!*.avi',
  '!*.bmp',
  '!*.eot',
  '!*.gif',
  '!*.gz',
  '!*.ico',
  '!*.jpg',
  '!*.jpeg',
  '!*.mov',
  '!*.mp3',
  '!*.mp4',
  '!*.pdf',
  '!*.png',
  '!*.tar',
  '!*.tiff',
  '!*.ttf',
  '!*.webm',
  '!*.webp',
  '!*.woff',
  '!*.zip',
  '!build',
  '!coverage',
  '!node_modules',
  '!playwright',
];

export async function* walk(dir: string): AsyncGenerator<string> {
  const args = [
    '--files',
    '--no-messages',
    '--no-ignore-vcs',
    ...RG_EXCLUDE_GLOBS,
    dir,
  ];
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  try {
    proc = Bun.spawn(args, { stderr: 'pipe', stdout: 'pipe' });
  } catch {
    return;
  }
  const decoder = new TextDecoder();
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf('\n');
    while (nl !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.length > 0) {
        yield line;
      }
      nl = buf.indexOf('\n');
    }
  }
  buf += decoder.decode();
  if (buf.length > 0) {
    yield buf;
  }
  await proc.exited;
}

export async function runPool<T>(
  gen: AsyncGenerator<string>,
  concurrency: number,
  fn: (f: string) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  const slots: Promise<void>[] = [];

  async function dispatch(value: string): Promise<void> {
    results.push(await fn(value));
  }

  let next = gen.next();
  while (true) {
    const { value, done } = await next;
    if (done) {
      break;
    }
    if (slots.length >= concurrency) {
      await Promise.race(slots);
    }
    const task = dispatch(value as string).then(() => {
      slots.splice(slots.indexOf(task), 1);
    });
    slots.push(task);
    next = gen.next();
  }
  await Promise.all(slots);
  return results;
}

export async function main(): Promise<void> {
  const { root, dryRun, concurrency } = parseArgs();
  console.log(
    `[sanitize] root=${root} dry-run=${dryRun} concurrency=${concurrency}`,
  );

  const gen = walk(root);
  const all = await runPool(gen, concurrency, (f) => sanitizeFile(f, dryRun));
  const results = all.filter((r) => r.changed);

  const changed = results.length;
  const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
  const rootLen = root.length + 1;

  if (dryRun) {
    console.log(
      `\n[sanitize] dry-run — ${changed} file(s) would change, ~${totalBytes} bytes removed:`,
    );
  } else {
    console.log(
      `\n[sanitize] ${changed} file(s) changed, ~${totalBytes} bytes removed:`,
    );
  }
  for (const r of results) {
    const rel = r.file.startsWith(`${root}/`) ? r.file.slice(rootLen) : r.file;
    console.log(`  ${rel}  (-${r.bytes} bytes)`);
  }
  if (changed === 0) {
    console.log('  (no changes needed — all clean)');
  }
}

main().catch((err) => {
  console.error('[sanitize] fatal:', err);
  exit(1);
});
