import { expect, mock, test } from 'bun:test';

import {
  assertAidlcKnowledgeContextResolvable,
  renderAidlcKnowledgeSnapshot,
  resolveAidlcKnowledgeContext,
  validateKnowledgeBindings,
} from '../../../utils/aidlc/context.js';
import { createAidlcIntent } from '../../../utils/aidlc/intent.js';
import { renderOkfConcept } from '../../../utils/knowledge-base.js';

const concept = (body: string): string =>
  renderOkfConcept(
    {
      description: 'Rules.',
      tags: ['rules'],
      title: 'Rules',
      type: 'practice',
    },
    body,
  );

test('resolves valid KB rules in strict organization-team-project order', async () => {
  const filesystem = {
    mkdir: mock(),
    readFile: mock(async (path: string) => {
      if (path.endsWith('organization/rules.md')) {
        return concept('- ALWAYS preserve explicit approvals');
      }
      if (path.endsWith('project/rules.md')) {
        return concept('- NEVER modify user configuration');
      }
      const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
      throw error;
    }),
    rm: mock(),
    writeFile: mock(),
  };
  const context = await resolveAidlcKnowledgeContext(
    filesystem,
    '/kb',
    {
      organization: 'shared/organization/rules.md',
      project: 'repo/project/rules.md',
      team: 'shared/team/rules.md',
    },
    '2026-07-30T00:00:00.000Z',
  );
  expect(context.sources).toEqual([
    'shared/organization/rules.md',
    'repo/project/rules.md',
  ]);
  expect(renderAidlcKnowledgeSnapshot(context)).toContain(
    'ALWAYS preserve explicit approvals',
  );
  expect(
    renderAidlcKnowledgeSnapshot({ bindings: {}, rules: [], sources: [] }),
  ).toContain('None configured or found.');
  await expect(
    resolveAidlcKnowledgeContext(
      filesystem,
      '/kb',
      { organization: undefined, project: undefined, team: undefined },
      '2026-07-30T00:00:00.000Z',
    ),
  ).resolves.toMatchObject({ bindings: {} });
});

test('reads independent KB layers together while preserving rule precedence', async () => {
  let releaseOrganization: ((value: string) => void) | undefined;
  const organization = new Promise<string>((resolve) => {
    releaseOrganization = resolve;
  });
  let teamReadStarted = false;
  const filesystem = {
    mkdir: mock(),
    readFile: mock(async (path: string) => {
      if (path.endsWith('organization/rules.md')) return organization;
      teamReadStarted = true;
      return concept('- ALWAYS preserve scope');
    }),
    rm: mock(),
    writeFile: mock(),
  };
  const result = resolveAidlcKnowledgeContext(
    filesystem,
    '/kb',
    {
      organization: 'shared/organization/rules.md',
      team: 'shared/team/rules.md',
    },
    '2026-07-30T00:00:00.000Z',
  );
  expect(teamReadStarted).toBeTrue();
  releaseOrganization?.(concept('- ALWAYS preserve explicit approvals'));
  await expect(result).resolves.toMatchObject({
    rules: ['ALWAYS preserve explicit approvals', 'ALWAYS preserve scope'],
    sources: ['shared/organization/rules.md', 'shared/team/rules.md'],
  });
});

test('rejects invalid roots, bindings, malformed KB, and conflicting rules', async () => {
  const filesystem = {
    mkdir: mock(),
    readFile: mock(async (path: string) =>
      concept(
        path.endsWith('organization/rules.md')
          ? '- ALWAYS preserve scope'
          : '- NEVER preserve scope',
      ),
    ),
    rm: mock(),
    writeFile: mock(),
  };
  expect(() => validateKnowledgeBindings({ project: 'bad.md' })).toThrow(
    'Invalid AIDLC knowledge binding',
  );
  expect(() =>
    validateKnowledgeBindings(
      { organization: 'shared/team/not-organization.md' },
      'repo',
    ),
  ).toThrow('Invalid AIDLC knowledge binding');
  expect(() =>
    validateKnowledgeBindings({ project: 'other/project/practice.md' }, 'repo'),
  ).toThrow('Invalid AIDLC knowledge binding');
  await expect(
    resolveAidlcKnowledgeContext(filesystem, 'relative', {}, 'now'),
  ).rejects.toThrow('absolute');
  await expect(
    resolveAidlcKnowledgeContext(
      filesystem,
      '/kb',
      {
        organization: 'shared/organization/rules.md',
        project: 'repo/project/rules.md',
      },
      'now',
    ),
  ).rejects.toThrow('Conflicting');
  const invalid = { ...filesystem, readFile: mock(async () => 'invalid') };
  await expect(
    resolveAidlcKnowledgeContext(
      invalid,
      '/kb',
      { team: 'shared/team/rules.md' },
      'now',
    ),
  ).rejects.toThrow('frontmatter');
  const unreadable = {
    ...filesystem,
    readFile: mock(async () => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    }),
  };
  await expect(
    resolveAidlcKnowledgeContext(
      unreadable,
      '/kb',
      { team: 'shared/team/rules.md' },
      'now',
    ),
  ).rejects.toThrow('denied');
});

test('requires context resolution exactly once at Reverse Engineering', () => {
  const initial = createAidlcIntent('repo', 'Resolved context');
  const resolved = {
    ...initial,
    kbContext: {
      bindings: {},
      resolvedAt: '2026-08-01T00:00:00.000Z',
      rules: [],
      sources: [],
    },
    stage: 'reverse-engineering' as const,
  };
  expect(() => assertAidlcKnowledgeContextResolvable(resolved)).toThrow(
    'already been resolved',
  );
});
