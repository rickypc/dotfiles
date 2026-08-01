import { expect, mock, test } from 'bun:test';

import { run, usage } from '../../scripts/aidlc.js';
import type { saveAidlcIntent } from '../../utils/aidlc/intent.js';

test('starts from the current workspace and records established early-stage evidence atomically', async () => {
  const saved: unknown[][] = [];
  const save: typeof saveAidlcIntent = async (fileSystem, path, intent) => {
    saved.push([fileSystem, path, intent]);
  };
  const write = mock();
  const resolve = mock(async (projectRoot: string) => {
    expect(projectRoot).toBe('/project');
    return 'resolved-repo';
  });
  await run(
    [
      'start',
      'Refresh browser UI',
      '--ui',
      '--initial-record',
      JSON.stringify([
        {
          evidence: 'The user requested a professional browser UI refresh.',
          outcome: 'complete',
          stage: 'intent-capture',
        },
        {
          evidence:
            'Existing browser assets and dependencies support the refresh.',
          outcome: 'complete',
          stage: 'feasibility',
        },
        {
          evidence: 'Visual refresh and browser verification are in scope.',
          outcome: 'complete',
          stage: 'scope-definition',
        },
      ]),
    ],
    save,
    write,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    resolve,
    undefined,
    '/project',
    undefined,
    '/agents',
  );
  expect(saved[0]?.[2]).toMatchObject({
    stage: 'approval-handoff',
    uiRequired: true,
  });
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"initialRecordApplied":true'),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"stage":"approval-handoff"'),
  );
});

test('does not accept caller-supplied root arguments', async () => {
  const resolve = mock(async () => 'resolved-repo');
  await expect(
    run(
      ['start', '/incorrect-workspace', 'Build KB'],
      undefined,
      mock(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      resolve,
      undefined,
      '/project',
    ),
  ).rejects.toThrow(usage());
  expect(resolve).not.toHaveBeenCalled();
});

test('accepts standalone start options and rejects invalid initial records', async () => {
  const save: typeof saveAidlcIntent = async () => undefined;
  const resolve = mock(async () => 'resolved-repo');
  await run(
    ['start', 'UI only', '--ui'],
    save,
    mock(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    resolve,
    undefined,
    '/project',
    undefined,
    '/agents',
  );
  await expect(
    run(
      [
        'start',
        'Incomplete record',
        '--initial-record',
        JSON.stringify([
          {
            evidence: 'The user request was captured.',
            outcome: 'complete',
            stage: 'intent-capture',
          },
        ]),
      ],
      save,
      mock(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      resolve,
      undefined,
      '/project',
      undefined,
      '/agents',
    ),
  ).rejects.toThrow('must end at Approval Handoff');
  await expect(
    run(
      [
        'start',
        'Invalid record',
        '--initial-record',
        JSON.stringify([
          {
            evidence: 'Approval cannot be batched.',
            outcome: 'complete',
            stage: 'approval-handoff',
          },
        ]),
      ],
      save,
      mock(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      resolve,
      undefined,
      '/project',
      undefined,
      '/agents',
    ),
  ).rejects.toThrow('cannot cross Approval Handoff');
  await expect(
    run(
      ['start', 'Invalid option', '--unexpected'],
      save,
      mock(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      resolve,
      undefined,
      '/project',
      undefined,
      '/agents',
    ),
  ).rejects.toThrow(usage());
});
