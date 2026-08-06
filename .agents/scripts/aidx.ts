import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  type AidxEvent,
  type AidxLessonDisposition,
  appendAidxNote,
  createAidxGoal,
  parseAidxGoal,
  setAidxLesson,
  transitionAidxGoal,
} from '../utils/aidx.js';
import { runWhenMain } from '../utils/cli.js';

const stateRoot = resolve(import.meta.dir, '..', 'skills', 'aidx', 'sessions');

const absolutePath = (value: string | undefined, name: string): string => {
  if (!value?.startsWith('/')) {
    throw new Error(`${name} must be an absolute path.`);
  }
  return resolve(value);
};

const assertGoalPath = (path: string): void => {
  if (!path.startsWith(`${stateRoot}/`) || !path.endsWith('.md')) {
    throw new Error(`AIDX goal records must live under ${stateRoot}.`);
  }
};

const goalPathFor = (id: string, cbmIndex: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) {
    throw new Error('AIDX goal id contains unsupported characters.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(cbmIndex)) {
    throw new Error('AIDX CBM index contains unsupported characters.');
  }
  return join(stateRoot, cbmIndex, 'goals', `${id}.md`);
};

const goalsMap = (cbmIndex: string): string =>
  `# AIDX goal records\n\nGoal records for CBM index \`${cbmIndex}\`. Each goal file is the source of truth for one resumable request.\n`;

const readEvidence = async (path: string): Promise<string> => {
  const evidence = (await readFile(path, 'utf8')).trim();
  if (!evidence) {
    throw new Error('AIDX evidence file is empty.');
  }
  return evidence;
};

const readEvidenceSync = (path: string): string => {
  const value = readFileSync(path, 'utf8').trim();
  if (!value) {
    throw new Error('AIDX evidence file is empty.');
  }
  return value;
};

const sessionMap = (cbmIndex: string): string =>
  `# AIDX session map\n\nThis directory contains resumable AIDX goal records for CBM index \`${cbmIndex}\`.\n\n- [Goal records](goals/index.md) — active and historical records for this index.\n`;

const updateGoal = async (
  path: string,
  transform: (content: string) => string,
): Promise<ReturnType<typeof parseAidxGoal>> => {
  const current = await readFile(path, 'utf8');
  const next = transform(current);
  await writeFile(path, next, 'utf8');
  return parseAidxGoal(next);
};

export const usage = (): string =>
  [
    'Usage:',
    '  bun <agents-root>/scripts/aidx.ts init <absolute-request-json-path>',
    '  bun <agents-root>/scripts/aidx.ts status <absolute-goal-record-path>',
    '  bun <agents-root>/scripts/aidx.ts validate <absolute-goal-record-path>',
    '  bun <agents-root>/scripts/aidx.ts note <absolute-goal-record-path> <event> <absolute-evidence-path>',
    '  bun <agents-root>/scripts/aidx.ts advance <absolute-goal-record-path> <event> <absolute-evidence-path>',
    '  bun <agents-root>/scripts/aidx.ts lesson <absolute-goal-record-path> <disposition> <absolute-evidence-path>',
  ].join('\n');

const writeResult = (write: (message: string) => void, value: object): void =>
  write(JSON.stringify(value, null, 2));

const commandHandlers: Record<
  string,
  (args: readonly string[], write: (message: string) => void) => Promise<void>
> = {
  advance: async (args, write) => {
    if (args.length !== 4) {
      throw new Error(usage());
    }
    const [, first, second, third] = args;
    const path = absolutePath(first, 'goal record path');
    const evidencePath = absolutePath(third, 'evidence path');
    assertGoalPath(path);
    const evidence = await readEvidence(evidencePath);
    const next = await updateGoal(path, (content) =>
      transitionAidxGoal(
        content,
        second as AidxEvent,
        evidence,
        new Date().toISOString(),
      ),
    );
    writeResult(write, {
      nextState: next.metadata.status,
      path,
      status: 'updated',
    });
  },
  init: async (args, write) => {
    if (args.length !== 2) {
      throw new Error(usage());
    }
    const requestPath = absolutePath(args[1], 'request path');
    const request = JSON.parse(await readFile(requestPath, 'utf8')) as {
      readonly cbmIndex?: string;
      readonly goal?: string;
      readonly id?: string;
      readonly initialContext?: string;
      readonly projectRoot?: string;
    };
    if (
      !request.id ||
      !request.cbmIndex ||
      !request.projectRoot ||
      !request.goal
    ) {
      throw new Error(
        'AIDX init request requires id, cbmIndex, projectRoot, and goal.',
      );
    }
    const path = goalPathFor(request.id, request.cbmIndex);
    await mkdir(dirname(path), { recursive: true });
    const sessionDirectory = dirname(dirname(path));
    await writeFile(
      join(sessionDirectory, 'index.md'),
      sessionMap(request.cbmIndex),
      {
        encoding: 'utf8',
        flag: 'wx',
      },
    ).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    });
    await writeFile(
      join(dirname(path), 'index.md'),
      goalsMap(request.cbmIndex),
      {
        encoding: 'utf8',
        flag: 'wx',
      },
    ).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    });
    const content = createAidxGoal({
      cbmIndex: request.cbmIndex,
      goal: request.goal,
      id: request.id,
      initialContext: request.initialContext,
      projectRoot: request.projectRoot,
    });
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx' });
    writeResult(write, { path, state: 'CAPTURE_GOAL', status: 'created' });
  },
  lesson: async (args, write) => {
    if (args.length !== 4) {
      throw new Error(usage());
    }
    const [, first, second, third] = args;
    const path = absolutePath(first, 'goal record path');
    const evidencePath = absolutePath(third, 'evidence path');
    assertGoalPath(path);
    const next = await updateGoal(path, (content) =>
      setAidxLesson(
        content,
        second as AidxLessonDisposition,
        readEvidenceSync(evidencePath),
        new Date().toISOString(),
      ),
    );
    writeResult(write, {
      nextState: next.metadata.status,
      path,
      status: 'updated',
    });
  },
  note: async (args, write) => {
    if (args.length !== 4) {
      throw new Error(usage());
    }
    const [, first, second, third] = args;
    const path = absolutePath(first, 'goal record path');
    const evidencePath = absolutePath(third, 'evidence path');
    assertGoalPath(path);
    const next = await updateGoal(path, (content) =>
      appendAidxNote(
        content,
        second ?? '',
        readEvidenceSync(evidencePath),
        new Date().toISOString(),
      ),
    );
    writeResult(write, {
      nextState: next.metadata.status,
      path,
      status: 'updated',
    });
  },
  status: async (args, write) => {
    if (args.length !== 2) {
      throw new Error(usage());
    }
    const path = absolutePath(args[1], 'goal record path');
    assertGoalPath(path);
    const document = parseAidxGoal(await readFile(path, 'utf8'));
    writeResult(write, { metadata: document.metadata, path });
  },
  validate: async (args, write) => {
    if (args.length !== 2) {
      throw new Error(usage());
    }
    const path = absolutePath(args[1], 'goal record path');
    assertGoalPath(path);
    const document = parseAidxGoal(await readFile(path, 'utf8'));
    writeResult(write, {
      path,
      state: document.metadata.status,
      status: 'valid',
    });
  },
};

export const run = async (
  args: readonly string[],
  write: (message: string) => void = console.log,
): Promise<void> => {
  const handler = commandHandlers[args[0] ?? ''];
  if (!handler) {
    throw new Error(usage());
  }
  await handler(args, write);
};

await runWhenMain(import.meta.main, Bun.argv.slice(2), run);
