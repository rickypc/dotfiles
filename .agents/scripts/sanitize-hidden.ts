#!/usr/bin/env bun
/**
 * sanitize-hidden.ts — Recursively strip hidden/zero-width characters and
 * normalize weird dashes across all text files in a directory.
 *
 * Usage:
 *   bun  sanitize-hidden.ts [directory] [--dry-run] [--write] [--concurrency=16]
 *   tsx sanitize-hidden.ts [directory] [--dry-run] [--write] [--concurrency=16]
 *
 * Defaults: directory = pwd; concurrency = 16; DRY-RUN (writes nothing).
 *
 * SAFETY: this script previews by default. It writes nothing unless the
 * explicit `--write` flag is passed. Never run `--write` against a repository
 * that holds uncommitted work you have not backed up; inspect the dry-run
 * output first. Binary files are skipped by extension *and* by content
 * (a NUL byte or invalid UTF-8), so images, fonts, and archives are never
 * decoded or rewritten.
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
 * Double quotation marks — replaced with ASCII '"':
 *   U+201C  LEFT DOUBLE QUOTATION MARK
 *   U+201D  RIGHT DOUBLE QUOTATION MARK
 *   U+201E  DOUBLE LOW-9 QUOTATION MARK
 *   U+201F  DOUBLE HIGH-REVERSED-9 QUOTATION MARK
 *   U+2033  DOUBLE PRIME
 *   U+2036  REVERSED DOUBLE PRIME
 *   U+301D  REVERSED DOUBLE PRIME QUOTATION MARK
 *   U+301E  DOUBLE PRIME QUOTATION MARK
 *   U+301F  LOW DOUBLE PRIME QUOTATION MARK
 *   U+FF02  FULLWIDTH QUOTATION MARK
 *
 * Other:
 *   U+00A0  NON-BREAKING SPACE  -> " "
 *   U+2028  LINE SEPARATOR       -> "\n"
 *   U+2029  PARAGRAPH SEPARATOR  -> "\n"
 *
 * Skip rules (mirrors the find -prune list):
 *   .git, playwright, node_modules, build, coverage subtrees
 *   *.html files
 *   binary file extensions (images, fonts, archives, media, executables)
 *   any file whose bytes contain a NUL or are not valid UTF-8
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

interface ArgState {
  concurrency: number;
  dryRun: boolean;
  help: boolean;
  rootArg?: string;
}

const BINARY_EXTS = new Set([
  '.7z',
  '.ai',
  '.aif',
  '.aiff',
  '.apng',
  '.avi',
  '.avif',
  '.avifs',
  '.bin',
  '.bmp',
  '.bz2',
  '.class',
  '.dll',
  '.dylib',
  '.eot',
  '.exe',
  '.flac',
  '.gif',
  '.gz',
  '.heic',
  '.heif',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.jxl',
  '.m4a',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.psd',
  '.rar',
  '.so',
  '.tar',
  '.tgz',
  '.tiff',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.xz',
  '.zip',
]);

const CONCURRENCY_REGEX = /^--concurrency=(\d+)$/;

// biome-ignore lint/suspicious/noControlCharactersInRegex: Unicode escapes in regex are intentional for control character matching
const CONTROL_RE = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const FLAG_ACTIONS: Record<string, (state: ArgState) => void> = {
  '--dry-run': (state) => {
    state.dryRun = true;
  },
  '--help': (state) => {
    state.help = true;
  },
  '--write': (state) => {
    state.dryRun = false;
  },
  '-h': (state) => {
    state.help = true;
  },
};

const MAX_FILE_BYTES = 16 * 1024 * 1024; // 16 MB

const REPLACE_MAP = {
  '\u00A0': ' ',
  '\u00AD': '',
  '\u00D7': 'x', // MULTIPLICATION SIGN (×) -> "x"
  '\u200B': '',
  '\u200C': '',
  '\u200D': '',
  '\u201C': '"', // LEFT DOUBLE QUOTATION MARK
  '\u201D': '"', // RIGHT DOUBLE QUOTATION MARK
  '\u201E': '"', // DOUBLE LOW-9 QUOTATION MARK
  '\u201F': '"', // DOUBLE HIGH-REVERSED-9 QUOTATION MARK
  '\u301D': '"', // REVERSED DOUBLE PRIME QUOTATION MARK
  '\u301E': '"', // DOUBLE PRIME QUOTATION MARK
  '\u301F': '"', // LOW DOUBLE PRIME QUOTATION MARK
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2028': '\n',
  '\u2029': '\n',
  '\u2033': '"', // DOUBLE PRIME
  '\u2036': '"', // REVERSED DOUBLE PRIME
  '\u2060': '',
  '\uFEFF': '',
  '\uFF02': '"', // FULLWIDTH QUOTATION MARK
};

const USAGE = `sanitize-hidden.ts [directory] [--dry-run] [--write] [--concurrency=16]

  directory        root to scan (default: current working directory)
  --dry-run        preview changes without writing (default)
  --write          apply changes in place (required to modify files)
  --concurrency=N  parallel workers (default: 16)
  --help, -h       print this usage and exit`;

function applyArg(state: ArgState, arg: string): void {
  const action = FLAG_ACTIONS[arg];
  if (action) {
    action(state);
    return;
  }
  if (arg.startsWith('--concurrency=')) {
    const match = arg.match(CONCURRENCY_REGEX);
    if (match) {
      state.concurrency = Math.max(1, parseInt(match[1], 10));
    }
    return;
  }
  if (state.rootArg === undefined && !arg.startsWith('-')) {
    state.rootArg = arg;
  }
}

/**
 * Content-level binary guard. A file is treated as binary when it contains a
 * NUL byte or when decoding it as UTF-8 does not round-trip byte-for-byte
 * (invalid UTF-8). This catches images, fonts, and archives even when the
 * extension is missing from BINARY_EXTS.
 */
export function isBinaryBuffer(buf: Uint8Array): boolean {
  if (buf.includes(0)) {
    return true;
  }
  const decoded = Buffer.from(buf).toString('utf8');
  return !Buffer.from(decoded, 'utf8').equals(Buffer.from(buf));
}

export function parseArgs(): {
  concurrency: number;
  dryRun: boolean;
  help: boolean;
  root: string;
} {
  const state: { concurrency: number; dryRun: boolean; help: boolean; rootArg?: string } = {
    concurrency: 16,
    dryRun: true,
    help: false,
  };
  for (const arg of argv.slice(2)) {
    applyArg(state, arg);
  }
  const root = state.rootArg === undefined ? resolve(cwd()) : resolve(state.rootArg);
  return { concurrency: state.concurrency, dryRun: state.dryRun, help: state.help, root };
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
    const raw: string | Uint8Array = await readFile(file);
    if (typeof raw !== 'string' && isBinaryBuffer(raw)) {
      return { bytes: 0, changed: false, file };
    }
    const original = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
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
  '!*.7z',
  '!*.ai',
  '!*.aif',
  '!*.aiff',
  '!*.apng',
  '!*.avi',
  '!*.avif',
  '!*.avifs',
  '!*.bin',
  '!*.bmp',
  '!*.bz2',
  '!*.class',
  '!*.dll',
  '!*.dylib',
  '!*.eot',
  '!*.exe',
  '!*.flac',
  '!*.gif',
  '!*.gz',
  '!*.heic',
  '!*.heif',
  '!*.ico',
  '!*.jar',
  '!*.jpeg',
  '!*.jpg',
  '!*.jxl',
  '!*.m4a',
  '!*.mkv',
  '!*.mov',
  '!*.mp3',
  '!*.mp4',
  '!*.mpeg',
  '!*.mpg',
  '!*.ogg',
  '!*.otf',
  '!*.pdf',
  '!*.png',
  '!*.psd',
  '!*.rar',
  '!*.so',
  '!*.tar',
  '!*.tgz',
  '!*.tiff',
  '!*.ttf',
  '!*.wav',
  '!*.webm',
  '!*.webp',
  '!*.woff',
  '!*.woff2',
  '!*.xz',
  '!*.zip',
  '!build',
  '!coverage',
  '!dist',
  '!node_modules',
  '!playwright',
];

export async function* walk(dir: string): AsyncGenerator<string> {
  const keys = Object.keys(REPLACE_MAP)
    .map((ch) => `\\x{${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}}`)
    .join('');
  const controlClass = '\\x{0001}-\\x{0008}\\x{000B}\\x{000C}\\x{000E}-\\x{001F}\\x{007F}';
  const args = [
    'rg',
    '--files-with-matches',
    ...RG_EXCLUDE_GLOBS.flatMap((glob) => ['-g', glob]),
    `--max-filesize=${MAX_FILE_BYTES}`,
    '--no-messages',
    `[${controlClass}${keys}]`,
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
  const { root, dryRun, concurrency, help } = parseArgs();
  if (help) {
    console.log(USAGE);
    return;
  }
  console.log(`[sanitize] root=${root} dry-run=${dryRun} concurrency=${concurrency}`);
  if (!dryRun) {
    console.log('[sanitize] WRITE mode — files will be modified in place');
  }

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
    console.log(`\n[sanitize] ${changed} file(s) changed, ~${totalBytes} bytes removed:`);
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
